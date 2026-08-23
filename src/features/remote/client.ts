import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { desktop } from '@/lib/desktop'
import type {
  AppSettings,
  DeviceRecord,
  MirroredNotification,
  PairedController,
  PairedPcDevice,
  PairingPayload,
  RemoteCommand,
  RemoteCommandKind,
  RemoteConnectionStatus,
  TimerState,
} from '@/types'

export function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'KAP-'
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export function generatePairingSecret(): string {
  const chars = 'abcdef0123456789'
  let secret = ''
  for (let i = 0; i < 32; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return secret
}

export function isValidUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
}

export function generateUuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export async function getDefaultSettings(): Promise<AppSettings> {
  const sysInfo = await desktop.system.getInfo().catch(() => ({ hostname: 'Windows PC', os: 'Windows', platform: 'win32' }))
  const autostart = await desktop.autostart.isEnabled().catch(() => true)
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string) || ''
  const envKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || ''
  const envDeviceId = (import.meta.env.VITE_SUPABASE_DEVICE_ID as string) || ''

  const finalDeviceId = isValidUuid(envDeviceId) ? envDeviceId : generateUuidV4()

  return {
    supabaseUrl: envUrl,
    supabaseAnonKey: envKey,
    deviceId: finalDeviceId,
    deviceName: sysInfo.hostname || 'Masaüstü PC',
    pairingCode: generatePairingCode(),
    pairingSecret: generatePairingSecret(),
    autostart,
    heartbeatIntervalSeconds: 15,
    lastSavedAt: Date.now(),
    remoteDesktopEnabled: true,
  }
}

export async function getEffectiveSettings(): Promise<AppSettings> {
  const stored = await desktop.settings.get()
  const defaults = await getDefaultSettings()
  if (!stored) {
    await desktop.settings.save(defaults)
    return defaults
  }
  const merged: AppSettings = {
    ...defaults,
    ...stored,
    supabaseUrl: stored.supabaseUrl || defaults.supabaseUrl,
    supabaseAnonKey: stored.supabaseAnonKey || defaults.supabaseAnonKey,
    deviceId: stored.deviceId || defaults.deviceId,
    deviceName: stored.deviceName || defaults.deviceName,
    pairingCode: stored.pairingCode || defaults.pairingCode,
    pairingSecret: stored.pairingSecret || defaults.pairingSecret,
    remoteDesktopEnabled: stored.remoteDesktopEnabled !== false,
  }

  // Ensure deviceId is a valid UUID for PostgreSQL uuid type
  if (!isValidUuid(merged.deviceId)) {
    merged.deviceId = generateUuidV4()
    await desktop.settings.save(merged)
  }

  return merged
}

export async function saveEffectiveSettings(settings: AppSettings): Promise<void> {
  settings.lastSavedAt = Date.now()
  await desktop.settings.save(settings)
  if (desktop.isElectron()) {
    await desktop.autostart.setEnabled(settings.autostart).catch(() => undefined)
  }
}

const clientCache = new Map<string, SupabaseClient>()

export function getSupabaseClient(url: string, anonKey: string): SupabaseClient | null {
  if (!url || !anonKey || !url.startsWith('http')) return null
  const cacheKey = `${url}::${anonKey}`
  let client = clientCache.get(cacheKey)
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
    clientCache.set(cacheKey, client)
  }
  return client
}

export async function testSupabaseConnection(url: string, anonKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const client = getSupabaseClient(url, anonKey)
    if (!client) return { success: false, message: 'Geçersiz Supabase URL veya Anon Key.' }
    const { error } = await client.from('devices').select('id').limit(1)
    if (error) {
      return { success: false, message: `Supabase Hatası: ${error.message}` }
    }
    return { success: true, message: 'Supabase bağlantısı başarılı!' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Bağlantı kurulamadı.'
    return { success: false, message: msg }
  }
}

export interface RemoteEngineHandlers {
  execute: (command: RemoteCommandKind, delaySeconds: number) => Promise<void>
  onStatusChange?: (status: RemoteConnectionStatus, lastHeartbeat: number | null) => void
  onPairedControllersChange?: (controllers: PairedController[]) => void
  getTimerState: () => TimerState | null
}

export async function startRemoteEngine({
  execute,
  onStatusChange,
  onPairedControllersChange,
  getTimerState,
}: RemoteEngineHandlers): Promise<() => void> {
  const settings = await getEffectiveSettings()
  if (!settings.supabaseUrl || !settings.supabaseAnonKey) {
    onStatusChange?.('disconnected', null)
    return () => undefined
  }

  const client = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey)
  if (!client) {
    onStatusChange?.('disconnected', null)
    return () => undefined
  }
  const supabase = client

  onStatusChange?.('connecting', null)

  const sysInfo = await desktop.system.getInfo().catch(() => ({ hostname: settings.deviceName, os: 'Windows', platform: 'win32' }))

  const performHeartbeat = async () => {
    try {
      const currentTimer = getTimerState()
      const nowIso = new Date().toISOString()
      const { error } = await supabase
        .from('devices')
        .upsert(
          {
            id: settings.deviceId,
            name: settings.deviceName,
            pairing_code: settings.pairingCode.toUpperCase(),
            pairing_secret: settings.pairingSecret,
            is_online: true,
            last_seen_at: nowIso,
            timer_state: currentTimer
              ? {
                  action: currentTimer.action,
                  targetAt: currentTimer.targetAt,
                  durationSeconds: currentTimer.durationSeconds,
                }
              : null,
            system_info: sysInfo,
            updated_at: nowIso,
          },
          { onConflict: 'id' },
        )

      if (error) {
        console.error('Supabase heartbeat error:', error)
        onStatusChange?.('error', null)
      } else {
        onStatusChange?.('connected', Date.now())
      }
    } catch (e) {
      console.error('Heartbeat exception:', e)
      onStatusChange?.('error', null)
    }
  }

  const refreshPairedControllers = async () => {
    try {
      const { data, error } = await supabase
        .from('paired_controllers')
        .select('id, device_id, controller_id, controller_name, controller_type, last_active_at, created_at')
        .eq('device_id', settings.deviceId)
        .order('last_active_at', { ascending: false })

      if (!error && data) {
        const controllers: PairedController[] = data.map((row) => ({
          id: row.id,
          deviceId: row.device_id,
          controllerId: row.controller_id,
          controllerName: row.controller_name,
          controllerType: row.controller_type || 'mobile',
          lastActiveAt: row.last_active_at,
          createdAt: row.created_at,
        }))
        onPairedControllersChange?.(controllers)
      }
    } catch {
      // ignore
    }
  }

  await performHeartbeat()
  await refreshPairedControllers()

  async function processCommand(cmd: any) {
    if (cmd.device_id !== settings.deviceId || cmd.status !== 'pending') return

    const expired = !Number.isFinite(Date.parse(cmd.expires_at)) || Date.parse(cmd.expires_at) <= Date.now()
    const invalidDelay = !Number.isInteger(cmd.delay_seconds) || cmd.delay_seconds < 0 || cmd.delay_seconds > 86_400

    if (expired || invalidDelay) {
      await supabase
        .from('device_commands')
        .update({
          status: 'rejected',
          completed_at: new Date().toISOString(),
          error_message: expired ? 'Komutun süresi doldu.' : 'Geçersiz gecikme süresi.',
        })
        .eq('id', cmd.id)
        .eq('device_id', settings.deviceId)
        .eq('status', 'pending')
      return
    }

    const { data: claimed } = await supabase
      .from('device_commands')
      .update({ status: 'processing', error_message: null })
      .eq('id', cmd.id)
      .eq('device_id', settings.deviceId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle()

    if (!claimed) return

    try {
      await execute(cmd.command, cmd.delay_seconds)
      await supabase
        .from('device_commands')
        .update({ status: 'completed', completed_at: new Date().toISOString(), error_message: null })
        .eq('id', cmd.id)
        .eq('device_id', settings.deviceId)
      await performHeartbeat()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Windows komutu çalıştırılamadı.'
      await supabase
        .from('device_commands')
        .update({
          status: 'rejected',
          completed_at: new Date().toISOString(),
          error_message: message.slice(0, 240),
        })
        .eq('id', cmd.id)
        .eq('device_id', settings.deviceId)
    }
  }

  // Check existing pending commands
  try {
    const { data: pending } = await supabase
      .from('device_commands')
      .select('*')
      .eq('device_id', settings.deviceId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true })

    if (pending) {
      for (const cmd of pending) void processCommand(cmd)
    }
  } catch {
    // ignore
  }

  // Realtime subscription for commands
  const commandChannel = supabase
    .channel(`device-commands:${settings.deviceId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'device_commands', filter: `device_id=eq.${settings.deviceId}` },
      (payload) => void processCommand(payload.new),
    )
    .subscribe()

  // Realtime subscription for controllers
  const controllerChannel = supabase
    .channel(`paired-controllers:${settings.deviceId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'paired_controllers', filter: `device_id=eq.${settings.deviceId}` },
      () => void refreshPairedControllers(),
    )
    .subscribe()

  // Realtime broadcast channel for notifications
  const notificationChannel = supabase.channel(`device-notifications:${settings.deviceId}`)
  notificationChannel.subscribe()

  const persistMirroredNotification = (notif: MirroredNotification) => {
    if (!notif.id) return

    // Keep the desktop notification id as the row id. This makes retries and
    // the history replay below idempotent instead of creating duplicate rows.
    void Promise.resolve(
      supabase
        .from('device_notifications')
        .upsert({
          id: notif.id,
          device_id: settings.deviceId,
          notification_id: String(notif.notificationId || notif.id),
          app_name: notif.appName,
          title: notif.title,
          body: notif.body,
          timestamp: new Date(notif.timestamp).toISOString(),
        }, { onConflict: 'id', ignoreDuplicates: true })
    )
      .then(({ error }) => {
        if (error) console.error('[remote-notification] Supabase kayıt hatası:', error.message)
      })
      .catch((error) => {
        console.error('[remote-notification] Supabase bağlantı hatası:', error)
      })
  }

  const stopNotificationListener = desktop.notifications.onMirrored((notif) => {
    if (settings.notificationMirroringEnabled === false) return

    // 1. Broadcast over Supabase Realtime channel
    void notificationChannel.send({
      type: 'broadcast',
      event: 'notification',
      payload: notif,
    })

    // 2. Insert into Supabase table. Android's background service reads this
    // table over REST, so do not silently discard an insert error.
    persistMirroredNotification(notif)

    // 3. Push to ntfy.sh if enabled
    if (settings.ntfyEnabled && settings.ntfyTopic) {
      void pushNotificationToNtfy(settings.ntfyTopic, notif, settings.ntfyServer)
    }
  })

  // If the listener captured a notification before the renderer finished
  // connecting, replay the persisted desktop history into Supabase.
  void desktop.notifications.getHistory()
    .then((history) => {
      if (settings.notificationMirroringEnabled === false) return
      history.forEach(persistMirroredNotification)
    })
    .catch((error) => {
      console.error('[remote-notification] Geçmiş okunamadı:', error)
    })

  // Heartbeat timer interval
  const intervalMs = Math.max(5, settings.heartbeatIntervalSeconds || 15) * 1000
  const timerInterval = window.setInterval(() => {
    void performHeartbeat()
  }, intervalMs)

  return () => {
    window.clearInterval(timerInterval)
    stopNotificationListener()
    void supabase.removeChannel(commandChannel)
    void supabase.removeChannel(controllerChannel)
    void supabase.removeChannel(notificationChannel)
    // Mark device offline on cleanup
    void supabase
      .from('devices')
      .update({ is_online: false, updated_at: new Date().toISOString() })
      .eq('id', settings.deviceId)
  }
}

export async function fetchPairedControllers(url: string, anonKey: string, deviceId: string): Promise<PairedController[]> {
  const client = getSupabaseClient(url, anonKey)
  if (!client) return []
  const { data, error } = await client
    .from('paired_controllers')
    .select('id, device_id, controller_id, controller_name, controller_type, last_active_at, created_at')
    .eq('device_id', deviceId)
    .order('last_active_at', { ascending: false })

  if (error || !data) return []
  return data.map((row) => ({
    id: row.id,
    deviceId: row.device_id,
    controllerId: row.controller_id,
    controllerName: row.controller_name,
    controllerType: row.controller_type || 'mobile',
    lastActiveAt: row.last_active_at,
    createdAt: row.created_at,
  }))
}

export async function removePairedController(url: string, anonKey: string, controllerRowId: string): Promise<boolean> {
  const client = getSupabaseClient(url, anonKey)
  if (!client) return false
  const { error } = await client.from('paired_controllers').delete().eq('id', controllerRowId)
  return !error
}

// Controller side (Phone / Web) helpers:
export async function pairWithDeviceByCode(
  url: string,
  anonKey: string,
  pairingCode: string,
  controllerName: string,
  controllerType: string = 'mobile',
): Promise<{ success: boolean; device?: DeviceRecord; message?: string; controllerId?: string }> {
  const client = getSupabaseClient(url, anonKey)
  if (!client) return { success: false, message: 'Supabase istemcisi oluşturulamadı.' }

  const cleanCode = pairingCode.trim().toUpperCase()
  const codeWithPrefix = cleanCode.startsWith('KAP-') ? cleanCode : `KAP-${cleanCode}`
  const codeWithoutPrefix = cleanCode.replace(/^KAP-/, '')

  const { data: device, error } = await client
    .from('devices')
    .select('*')
    .or(`pairing_code.eq.${codeWithPrefix},pairing_code.eq.${codeWithoutPrefix},pairing_code.eq.${cleanCode}`)
    .maybeSingle()

  if (error) return { success: false, message: `Sorgu hatası: ${error.message}` }
  if (!device) return { success: false, message: 'Bu eşleştirme koduna ait bilgisayar bulunamadı. Lütfen bilgisayarınızdaki Omni uygulamasının açık ve Ayarlar sekmesinde Supabase bağlantısının yeşil (çevrim içi) olduğundan emin olun.' }

  let controllerId = localStorage.getItem('kapanis_controller_id')
  if (!controllerId) {
    controllerId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'ctrl-' + Math.random().toString(36).substring(2, 11)
    localStorage.setItem('kapanis_controller_id', controllerId)
  }

  // Register controller
  await client.from('paired_controllers').upsert(
    {
      device_id: device.id,
      controller_id: controllerId,
      controller_name: controllerName,
      controller_type: controllerType,
      last_active_at: new Date().toISOString(),
    },
    { onConflict: 'device_id,controller_id' },
  )

  return {
    success: true,
    controllerId,
    device: {
      id: device.id,
      name: device.name,
      pairingCode: device.pairing_code,
      pairingSecret: device.pairing_secret,
      isOnline: device.is_online,
      lastSeenAt: device.last_seen_at,
      timerState: device.timer_state,
      systemInfo: device.system_info,
      createdAt: device.created_at,
      updatedAt: device.updated_at,
    },
  }
}

export async function sendRemoteCommand(
  url: string,
  anonKey: string,
  deviceId: string,
  command: RemoteCommandKind,
  delaySeconds: number = 0,
  controllerId?: string,
): Promise<{ success: boolean; command?: RemoteCommand; message?: string }> {
  const client = getSupabaseClient(url, anonKey)
  if (!client) return { success: false, message: 'Supabase istemcisi oluşturulamadı.' }

  const cid = controllerId || (typeof localStorage !== 'undefined' ? localStorage.getItem('kapanis_controller_id') : null) || 'ctrl-web'
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  const { data, error } = await client
    .from('device_commands')
    .insert({
      device_id: deviceId,
      controller_id: cid,
      command,
      delay_seconds: Math.max(0, Math.round(delaySeconds)),
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('*')
    .single()

  if (error) {
    return { success: false, message: `Komut kaydedilemedi: ${error.message}` }
  }

  // Also broadcast via Realtime channel for instant sub-second trigger
  try {
    const channel = client.channel(`device-commands:${deviceId}`)
    void channel.send({
      type: 'broadcast',
      event: 'command',
      payload: {
        id: data.id,
        deviceId: data.device_id,
        controllerId: data.controller_id,
        command: data.command,
        delaySeconds: data.delay_seconds,
        status: data.status,
        createdAt: data.created_at,
        expiresAt: data.expires_at,
      },
    })
  } catch {}

  // Update controller last active
  void client
    .from('paired_controllers')
    .update({ last_active_at: new Date().toISOString() })
    .eq('device_id', deviceId)
    .eq('controller_id', controllerId)

  return {
    success: true,
    command: {
      id: data.id,
      deviceId: data.device_id,
      controllerId: data.controller_id,
      command: data.command,
      delaySeconds: data.delay_seconds,
      status: data.status,
      errorMessage: data.error_message,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
      completedAt: data.completed_at,
    },
  }
}

export async function fetchDeviceState(url: string, anonKey: string, deviceId: string): Promise<DeviceRecord | null> {
  const client = getSupabaseClient(url, anonKey)
  if (!client) return null
  const { data, error } = await client.from('devices').select('*').eq('id', deviceId).maybeSingle()
  if (error || !data) return null
  return {
    id: data.id,
    name: data.name,
    pairingCode: data.pairing_code,
    pairingSecret: data.pairing_secret,
    isOnline: data.is_online,
    lastSeenAt: data.last_seen_at,
    timerState: data.timer_state,
    systemInfo: data.system_info,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export function subscribeToDeviceUpdates(
  url: string,
  anonKey: string,
  deviceId: string,
  onUpdate: (device: DeviceRecord) => void,
): () => void {
  const client = getSupabaseClient(url, anonKey)
  if (!client) return () => undefined

  const channel = client
    .channel(`device-updates:${deviceId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'devices', filter: `id=eq.${deviceId}` },
      (payload) => {
        const d = payload.new as any
        onUpdate({
          id: d.id,
          name: d.name,
          pairingCode: d.pairing_code,
          pairingSecret: d.pairing_secret,
          isOnline: d.is_online,
          lastSeenAt: d.last_seen_at,
          timerState: d.timer_state,
          systemInfo: d.system_info,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        })
      },
    )
    .subscribe()

  return () => {
    void client.removeChannel(channel)
  }
}

export async function pushNotificationToNtfy(
  topic: string,
  notif: MirroredNotification,
  serverUrl = 'https://ntfy.sh',
): Promise<boolean> {
  if (!topic || !topic.trim()) return false
  const cleanTopic = topic.trim().replace(/^\/+/, '')
  const baseUrl = (serverUrl || 'https://ntfy.sh').replace(/\/+$/, '')
  const target = `${baseUrl}/${cleanTopic}`

  try {
    const res = await fetch(target, {
      method: 'POST',
      body: notif.body || notif.title,
      headers: {
        'Title': `[${notif.appName}] ${notif.title}`,
        'Priority': 'default',
        'Tags': 'bell,desktop',
      },
    })
    return res.ok
  } catch (e) {
    console.error('ntfy push failed:', e)
    return false
  }
}

export async function fetchDeviceNotifications(
  url: string,
  anonKey: string,
  deviceId: string,
  limit = 50,
): Promise<MirroredNotification[]> {
  const client = getSupabaseClient(url, anonKey)
  if (!client) return []
  try {
    const { data, error } = await client
      .from('device_notifications')
      .select('*')
      .eq('device_id', deviceId)
      .order('timestamp', { ascending: false })
      .limit(limit)

    if (error || !data) return []
    return data.map((row) => ({
      id: row.id,
      notificationId: row.notification_id,
      appName: row.app_name || 'Sistem',
      title: row.title || '',
      body: row.body || '',
      timestamp: new Date(row.timestamp).getTime(),
      source: 'windows',
    }))
  } catch {
    return []
  }
}

export function subscribeToDeviceNotifications(
  url: string,
  anonKey: string,
  deviceId: string,
  onNotification: (notification: MirroredNotification) => void,
): () => void {
  const client = getSupabaseClient(url, anonKey)
  if (!client) return () => undefined

  const channel = client.channel(`device-notifications:${deviceId}`)

  // 1. Broadcast event listener (instant push)
  channel.on('broadcast', { event: 'notification' }, (payload) => {
    if (payload?.payload) {
      onNotification(payload.payload as MirroredNotification)
    }
  })

  // 2. Postgres changes fallback listener
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'device_notifications', filter: `device_id=eq.${deviceId}` },
    (payload) => {
      const row = payload.new as any
      if (row) {
        onNotification({
          id: row.id,
          notificationId: row.notification_id,
          appName: row.app_name || 'Sistem',
          title: row.title || '',
          body: row.body || '',
          timestamp: new Date(row.timestamp).getTime(),
          source: 'windows',
        })
      }
    },
  )

  channel.subscribe()

  return () => {
    void client.removeChannel(channel)
  }
}

// ----------------------------------------------------------------------------
// Multi-PC Management & Zero-Config Pairing Helpers
// ----------------------------------------------------------------------------

export function createPairingPayload(settings: AppSettings, localIps: string[] = [], port = 53317): string {
  const payload: PairingPayload = {
    v: 2,
    id: settings.deviceId,
    name: settings.deviceName || 'Windows PC',
    code: settings.pairingCode,
    secret: settings.pairingSecret,
    url: settings.supabaseUrl || '',
    key: settings.supabaseAnonKey || '',
    ips: localIps,
    port,
    ntfy: settings.ntfyTopic || `kapanis_${settings.deviceId.slice(0, 8)}`,
  }
  const jsonStr = JSON.stringify(payload)
  try {
    if (typeof btoa !== 'undefined') {
      return btoa(unescape(encodeURIComponent(jsonStr)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    }
  } catch {}
  return Buffer.from(jsonStr).toString('base64url')
}

export function parsePairingPayload(input: string): PairingPayload | null {
  if (!input || typeof input !== 'string') return null
  let raw = input.trim()

  if (raw.includes('pair_data=')) {
    try {
      const parsedUrl = new URL(raw, 'http://dummy.com')
      raw = parsedUrl.searchParams.get('pair_data') || raw
    } catch {
      const match = raw.match(/pair_data=([^&]+)/)
      if (match) raw = decodeURIComponent(match[1])
    }
  }

  // 1. Try base64url decode
  try {
    let base64 = raw.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4) base64 += '='
    const decoded = typeof atob !== 'undefined'
      ? decodeURIComponent(escape(atob(base64)))
      : Buffer.from(base64, 'base64').toString('utf8')
    const obj = JSON.parse(decoded) as PairingPayload
    if (obj && obj.id && (obj.code || obj.secret)) return obj
  } catch {}

  // 2. Try raw JSON
  try {
    const obj = JSON.parse(raw) as PairingPayload
    if (obj && obj.id && (obj.code || obj.secret)) return obj
  } catch {}

  return null
}

const STORAGE_KEY_PCS = 'kapanis_paired_pcs_v2'
const STORAGE_KEY_ACTIVE_PC = 'kapanis_active_pc_id_v2'

export function getStoredPCs(): PairedPcDevice[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const item = localStorage.getItem(STORAGE_KEY_PCS)
    return item ? JSON.parse(item) : []
  } catch {
    return []
  }
}

export function saveStoredPC(pc: PairedPcDevice): void {
  if (typeof localStorage === 'undefined') return
  const pcs = getStoredPCs()
  const idx = pcs.findIndex((p) => p.id === pc.id)
  if (idx >= 0) {
    pcs[idx] = { ...pcs[idx], ...pc, lastConnectedAt: Date.now() }
  } else {
    pcs.unshift({ ...pc, lastConnectedAt: Date.now() })
  }
  localStorage.setItem(STORAGE_KEY_PCS, JSON.stringify(pcs))
  setActivePCId(pc.id)
}

export function removeStoredPC(pcId: string): void {
  if (typeof localStorage === 'undefined') return
  const pcs = getStoredPCs().filter((p) => p.id !== pcId)
  localStorage.setItem(STORAGE_KEY_PCS, JSON.stringify(pcs))
  const active = getActivePCId()
  if (active === pcId) {
    setActivePCId(pcs.length > 0 ? pcs[0].id : '')
  }
}

export function getActivePCId(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(STORAGE_KEY_ACTIVE_PC) || null
}

export function setActivePCId(pcId: string): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY_ACTIVE_PC, pcId)
}

export function getActivePC(): PairedPcDevice | null {
  const pcs = getStoredPCs()
  if (pcs.length === 0) return null
  const activeId = getActivePCId()
  return pcs.find((p) => p.id === activeId) || pcs[0]
}

export async function pairWithPayload(
  payload: PairingPayload,
  controllerName?: string,
): Promise<{ success: boolean; device?: PairedPcDevice; error?: string }> {
  const name = controllerName || (typeof navigator !== 'undefined' && /iPhone|Android|iPad/i.test(navigator.userAgent) ? 'Mobil Cihaz' : 'Tarayıcı')

  // 1. Try Supabase cloud pairing if URL & Key exist
  if (payload.url && payload.key) {
    const result = await pairWithDeviceByCode(payload.url, payload.key, payload.code || payload.secret, name)
    if (result.success && result.device) {
      const pcDevice: PairedPcDevice = {
        id: result.device.id,
        name: result.device.name || payload.name || 'Windows PC',
        pairingCode: result.device.pairingCode || payload.code,
        pairingSecret: result.device.pairingSecret || payload.secret,
        supabaseUrl: payload.url,
        supabaseAnonKey: payload.key,
        localIps: payload.ips,
        localPort: payload.port || 53317,
        ntfyTopic: payload.ntfy || `kapanis_${result.device.id.slice(0, 8)}`,
        isOnline: result.device.isOnline,
        lastSeenAt: result.device.lastSeenAt,
        authSource: 'cloud',
      }
      saveStoredPC(pcDevice)
      return { success: true, device: pcDevice }
    }
  }

  // 2. Fallback: Save local configuration directly
  const pcDevice: PairedPcDevice = {
    id: payload.id,
    name: payload.name || 'Windows PC',
    pairingCode: payload.code,
    pairingSecret: payload.secret,
    supabaseUrl: payload.url || '',
    supabaseAnonKey: payload.key || '',
    localIps: payload.ips,
    localPort: payload.port || 53317,
    ntfyTopic: payload.ntfy || `kapanis_${payload.id.slice(0, 8)}`,
    authSource: payload.url ? 'cloud' : 'local',
  }
  saveStoredPC(pcDevice)
  return { success: true, device: pcDevice }
}
