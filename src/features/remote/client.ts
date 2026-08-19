import type { TimerAction } from '@/types'

type RemoteCommandKind = TimerAction | 'cancel'

interface RemoteCommandRow {
  id: string
  device_id: string
  owner_id: string
  command: RemoteCommandKind
  delay_seconds: number
  status: 'pending' | 'processing' | 'completed' | 'rejected'
  created_at: string
  expires_at: string
}

interface RemoteCommandHandlers {
  execute: (command: RemoteCommandKind, delaySeconds: number) => Promise<void>
}

export async function startRemoteCommandBridge({ execute }: RemoteCommandHandlers): Promise<() => void> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const deviceId = import.meta.env.VITE_SUPABASE_DEVICE_ID

  if (!url || !publishableKey || !deviceId) return () => undefined

  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  const { data: { user } } = await client.auth.getUser()
  if (!user) return () => undefined
  const ownerId = user.id
  const heartbeat = () => client
    .from('devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', deviceId)
    .eq('owner_id', ownerId)

  await heartbeat()

  async function processCommand(command: RemoteCommandRow) {
    if (command.device_id !== deviceId || command.owner_id !== ownerId || command.status !== 'pending') return

    const expired = !Number.isFinite(Date.parse(command.expires_at)) || Date.parse(command.expires_at) <= Date.now()
    const invalidDelay = !Number.isInteger(command.delay_seconds) || command.delay_seconds < 0 || command.delay_seconds > 86_400
    if (expired || invalidDelay) {
      await client
        .from('device_commands')
        .update({ status: 'rejected', completed_at: new Date().toISOString(), error_message: expired ? 'Komutun süresi doldu.' : 'Geçersiz gecikme süresi.' })
        .eq('id', command.id)
        .eq('device_id', deviceId)
        .eq('owner_id', ownerId)
        .eq('status', 'pending')
      return
    }

    const { data: claimed } = await client
      .from('device_commands')
      .update({ status: 'processing', error_message: null })
      .eq('id', command.id)
      .eq('device_id', deviceId)
      .eq('owner_id', ownerId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle()

    if (!claimed) return

    try {
      await execute(command.command, command.delay_seconds)
      await client
        .from('device_commands')
        .update({ status: 'completed', completed_at: new Date().toISOString(), error_message: null })
        .eq('id', command.id)
        .eq('device_id', deviceId)
        .eq('owner_id', ownerId)
      await heartbeat()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Windows komutu çalıştırılamadı.'
      await client
        .from('device_commands')
        .update({ status: 'rejected', completed_at: new Date().toISOString(), error_message: message.slice(0, 240) })
        .eq('id', command.id)
        .eq('device_id', deviceId)
        .eq('owner_id', ownerId)
    }
  }

  const { data: pending } = await client
    .from('device_commands')
    .select('id, device_id, owner_id, command, delay_seconds, status, created_at, expires_at')
    .eq('device_id', deviceId)
    .eq('owner_id', ownerId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })

  for (const command of (pending ?? []) as RemoteCommandRow[]) void processCommand(command)

  const channel = client
    .channel(`device-commands:${deviceId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'device_commands', filter: `device_id=eq.${deviceId}` },
      (payload) => void processCommand(payload.new as RemoteCommandRow),
    )
    .subscribe()

  return () => { void client.removeChannel(channel) }
}
