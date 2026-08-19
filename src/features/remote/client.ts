import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { desktop } from '@/lib/desktop'
import type {
  AppSettings,
  DeviceRecord,
  PairedController,
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
  if (desktop.isTauri()) {
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

  // Heartbeat timer interval
  const intervalMs = Math.max(5, settings.heartbeatIntervalSeconds || 15) * 1000
  const timerInterval = window.setInterval(() => {
    void performHeartbeat()
  }, intervalMs)

  return () => {
    window.clearInterval(timerInterval)
    void supabase.removeChannel(commandChannel)
    void supabase.removeChannel(controllerChannel)
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
  if (!device) return { success: false, message: 'Bu eşleştirme koduna ait bilgisayar bulunamadı. Lütfen bilgisayarınızdaki kapanış uygulamasının açık ve Ayarlar sekmesinde Supabase bağlantısının yeşil (çevrim içi) olduğundan emin olun.' }

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
  controllerId: string,
  command: RemoteCommandKind,
  delaySeconds: number,
): Promise<{ success: boolean; command?: RemoteCommand; message?: string }> {
  const client = getSupabaseClient(url, anonKey)
  if (!client) return { success: false, message: 'Supabase istemcisi oluşturulamadı.' }

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  const { data, error } = await client
    .from('device_commands')
    .insert({
      device_id: deviceId,
      controller_id: controllerId,
      command,
      delay_seconds: delaySeconds,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (error) return { success: false, message: `Komut iletilemedi: ${error.message}` }

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
