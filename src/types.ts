export type TimerAction = 'shutdown' | 'restart'

export interface TimerState {
  action: TimerAction
  targetAt: number
  durationSeconds: number
}

export type AlarmSoundProfile = 'gentle' | 'chime' | 'urgent'

export interface Alarm {
  id: string
  timestamp: number
  note: string
  createdAt: number
  intervalSeconds: number | null
  remainingOccurrences: number | null
  soundEnabled: boolean
  soundProfile: AlarmSoundProfile
}

export interface CreateAlarmInput {
  timestamp: number
  note: string
  intervalSeconds: number | null
  occurrenceCount: number | null
  soundEnabled: boolean
  soundProfile: AlarmSoundProfile
}

export interface AppSettings {
  supabaseUrl: string
  supabaseAnonKey: string
  deviceId: string
  deviceName: string
  pairingCode: string
  pairingSecret: string
  autostart: boolean
  heartbeatIntervalSeconds: number
  lastSavedAt: number
}

export interface PairedController {
  id: string
  deviceId: string
  controllerId: string
  controllerName: string
  controllerType: string
  lastActiveAt: string
  createdAt: string
}

export type RemoteCommandKind = TimerAction | 'cancel'

export interface RemoteCommand {
  id: string
  deviceId: string
  controllerId?: string
  command: RemoteCommandKind
  delaySeconds: number
  status: 'pending' | 'processing' | 'completed' | 'rejected'
  errorMessage?: string | null
  createdAt: string
  expiresAt: string
  completedAt?: string | null
}

export interface DeviceRecord {
  id: string
  name: string
  pairingCode: string
  pairingSecret: string
  isOnline: boolean
  lastSeenAt: string
  timerState: TimerState | null
  systemInfo?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type RemoteConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface NoteItem {
  id: string
  content: string
  createdAt: number
  updatedAt: number
  pinned: boolean
}

export interface TransferItem {
  id: string
  filename: string
  path: string
  size: number
  mimeType: string
  createdAt: number
  isImage: boolean
}

export interface LocalSendDevice {
  ip: string
  port: number
  alias: string
  version: string
  deviceModel?: string | null
  deviceType: 'mobile' | 'desktop' | 'web' | 'headless' | 'server' | string
  fingerprint: string
  protocol: 'http' | 'https' | string
  download: boolean
  lastSeen: number
}

export interface ReceivedFileRecord {
  id: string
  fileName: string
  size: number
  senderAlias: string
  senderIp: string
  localPath: string
  isText: boolean
  textPreview?: string | null
  receivedAt: number
}

export interface LocalSendStatus {
  isRunning: boolean
  localIp: string
  allIps: string[]
  port: number
  alias: string
  fingerprint: string
  autoAccept: boolean
  downloadDir: string
  discoveredCount: number
}

export interface ConnectionInfo {
  port: number
  ipAddresses: string[]
  deviceName: string
  qrPayload: string
}

export interface MobileNotification {
  id: string
  title: string
  message: string
  urgent: boolean
  createdAt: number
}

