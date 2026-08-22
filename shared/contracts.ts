import type {
  Alarm,
  AppSettings,
  ConnectionInfo,
  CreateAlarmInput,
  LocalSendDevice,
  LocalSendStatus,
  MirroredNotification,
  MobileNotification,
  NoteItem,
  ReceivedFileRecord,
  RemoteDesktopStatus,
  RemoteDesktopInput,
  RemoteDesktopSignal,
  RemoteTrustedDevice,
  TimerAction,
  TimerState,
  TransferItem,
} from '../src/types.js'

export const REMOTE_DESKTOP_PROTOCOL_VERSION = 1 as const
export type RemoteDesktopInputMessage = RemoteDesktopInput
export type RemoteDesktopSignalMessage = RemoteDesktopSignal

export const BROWSER_EVENTS = {
  tabCreated: 'browser:tab-created',
  tabUpdated: 'browser:tab-updated',
  tabDestroyed: 'browser:tab-destroyed',
  mediaUpdated: 'browser:media-updated',
  openRequest: 'browser:open-request',
  rendererFailed: 'browser:renderer-failed',
  permissionRequest: 'browser:permission-request',
  fullscreenChanged: 'browser:fullscreen-changed',
  downloadUpdated: 'browser:download-updated',
  historyUpdated: 'browser:history-updated',
} as const

export type BrowserEventName = (typeof BROWSER_EVENTS)[keyof typeof BROWSER_EVENTS]

export const APP_EVENTS = {
  alarmTriggered: 'alarm:triggered',
  alarmCreated: 'alarm:created',
  alarmCancelled: 'alarm:cancelled',
  remoteCommand: 'remote:command',
  mobileNote: 'mobile:note',
  mobileFile: 'mobile:file',
  mobileNotification: 'mobile:notification',
  notificationMirrored: 'notification:mirrored',
  localSendDevice: 'localsend:device-discovered',
  localSendFile: 'localsend:file-received',
  vaultFsChange: 'vault:fs-change',
  youtubeMusicState: 'youtube-music-state',
  aiUpdated: 'ai:updated',
  remoteDesktopState: 'remote-desktop:state',
} as const

export type AppEventName = (typeof APP_EVENTS)[keyof typeof APP_EVENTS]
export type DesktopEventName = BrowserEventName | AppEventName

export interface BrowserBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface BrowserTabProjection {
  id: string
  url: string
  title: string
  favicon: string | null
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error: string | null
  label: string
  muted?: boolean
  pinned?: boolean
  incognito?: boolean
}

export interface BrowserMediaProjection {
  tabId: string
  playing: boolean
  title: string
  artist: string
  album: string
  artwork: string | null
  source: string
  favicon: string | null
  lastPlayingAt: number
  currentTime: number
  duration: number
  muted: boolean
  volume?: number | null
}

export interface BrowserDebugSnapshot {
  openTabIds: string[]
  webContentsIds: number[]
  activeId: string | null
  mediaIds: string[]
  closingIds: string[]
  listenerCount: number
  viewStates: Array<{
    id: string
    bounds: BrowserBounds
    visible: boolean
    url: string
    loading: boolean
  }>
}

export interface BrowserSessionTab {
  id: string
  url: string | null
  title: string
  favicon: string | null
  pinned: boolean
  muted: boolean
  incognito?: boolean
}

export interface BrowserSessionSnapshot {
  tabs: BrowserSessionTab[]
  activeTabId: string | null
}

export interface BrowserHistoryItem {
  id: string
  url: string
  title: string
  favicon: string | null
  visitedAt: number
}

export type DownloadState = 'progressing' | 'completed' | 'cancelled' | 'interrupted'

export interface BrowserDownloadItem {
  id: string
  tabId: string | null
  url: string
  filename: string
  path: string
  state: DownloadState
  receivedBytes: number
  totalBytes: number
  startedAt: number
  completedAt: number | null
  error: string | null
}

export type BrowserPermission =
  | 'clipboard-read'
  | 'clipboard-sanitized-write'
  | 'display-capture'
  | 'fullscreen'
  | 'geolocation'
  | 'idle-detection'
  | 'media'
  | 'mediaKeySystem'
  | 'midi'
  | 'midiSysex'
  | 'notifications'
  | 'pointerLock'
  | 'protectedMediaIdentifier'
  | 'sensors'
  | 'serial'
  | 'storage-access'
  | 'usb'
  | 'videoCapture'
  | 'audioCapture'
  | string

export type BrowserPermissionDecision = 'allow' | 'deny' | 'ask'

export interface BrowserPermissionRequest {
  requestId: string
  tabId: string | null
  origin: string
  permission: BrowserPermission
  createdAt: number
}

export interface BrowserPermissionRecord {
  origin: string
  permission: BrowserPermission
  decision: Exclude<BrowserPermissionDecision, 'ask'>
  updatedAt: number
}

export interface PermissionSetInput {
  origin: string
  permission: BrowserPermission
  decision: BrowserPermissionDecision
  requestId?: string
}

export interface SystemMediaSession {
  sourceAppId: string
  title: string
  artist: string
  albumTitle: string
  playbackStatus: 'playing' | 'paused' | 'stopped' | 'unknown'
  positionSeconds: number
  durationSeconds: number
  canPlay: boolean
  canPause: boolean
  canSkipNext: boolean
  canSkipPrevious: boolean
}

export interface RemoteCommandPayload {
  command: TimerAction | 'cancel'
  delaySeconds: number
}

export interface YouTubeMusicState {
  title: string
  artist: string
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number | null
  muted: boolean
  artworkUrl: string | null
}

export interface ProgramCandidate {
  name: string
  path: string
  source: 'start-menu' | 'app-paths' | 'manual'
}

export type AiProviderId = 'openrouter' | 'openai' | 'anthropic' | 'google' | 'mistral' | 'groq' | 'ollama' | 'custom'

export interface AiProviderState {
  id: AiProviderId
  label: string
  baseUrl: string
  model: string
  enabled: boolean
  requiresApiKey: boolean
  apiKeySet: boolean
}

export interface AiProviderConfigInput {
  id: AiProviderId
  apiKey?: string
  clearApiKey?: boolean
  model?: string
  baseUrl?: string
  enabled?: boolean
}

export interface AiConversation {
  id: string
  title: string
  providerId: AiProviderId
  model: string
  createdAt: number
  updatedAt: number
  messageCount: number
  pinned: boolean
  isArchived: boolean
}

export interface AiMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  createdAt: number
  cached?: boolean
}

export interface AiSnapshot {
  providers: AiProviderState[]
  conversations: AiConversation[]
  cacheEntries: number
}

export interface AiSendInput {
  conversationId?: string | null
  providerId: AiProviderId
  model?: string
  content: string
}

export interface AiSendResult {
  conversationId: string
  userMessage: AiMessage
  assistantMessage: AiMessage
  cached: boolean
}

export type AiUpdate = { type: 'snapshot'; snapshot: AiSnapshot }

export type IpcChannel =
  | 'window:minimize'
  | 'window:toggle-maximize'
  | 'window:is-maximized'
  | 'window:close'
  | 'window:show'
  | 'open-external'
  | 'launch-program'
  | 'programs:list'
  | 'programs:icon'
  | 'programs:pick'
  | 'website-icons:get'
  | 'system:get-timer-status'
  | 'system:schedule-shutdown'
  | 'system:cancel-shutdown'
  | 'system:get-info'
  | 'system:get-autostart'
  | 'system:set-autostart'
  | 'settings:get'
  | 'settings:save'
  | 'alarms:list'
  | 'alarms:get-active'
  | 'alarms:create'
  | 'alarms:cancel'
  | 'alarms:stop-sound'
  | 'media:get-current'
  | 'media:control'
  | 'browser:create-tab'
  | 'browser:activate-tab'
  | 'browser:close-tab'
  | 'browser:navigate'
  | 'browser:stop'
  | 'browser:reload'
  | 'browser:back'
  | 'browser:forward'
  | 'browser:set-visible'
  | 'browser:deactivate'
  | 'browser:set-bounds'
  | 'browser:set-zoom'
  | 'browser:capture-page'
  | 'browser:sync-metadata'
  | 'browser:toggle-media'
  | 'browser:media-control'
  | 'browser:media-volume'
  | 'browser:set-theme'
  | 'browser:debug-snapshot'
  | 'browser:get-session'
  | 'browser:save-session'
  | 'browser:duplicate-tab'
  | 'browser:set-pinned'
  | 'browser:set-muted'
  | 'browser:show-tab-menu'
  | 'browser:list-history'
  | 'browser:clear-history'
  | 'browser:list-downloads'
  | 'browser:open-download'
  | 'browser:show-download'
  | 'browser:cancel-download'
  | 'browser:remove-download'
  | 'browser:list-permissions'
  | 'browser:set-permission'
  | 'browser:clear-permission'
  | 'youtube-music:control'
  | 'youtube-music:set-volume'
  | 'youtube-music:sync-state'
  | 'notes:list'
  | 'notes:save'
  | 'notes:delete'
  | 'notes:toggle-pin'
  | 'transfers:list'
  | 'transfers:open'
  | 'transfers:show-in-folder'
  | 'transfers:delete'
  | 'transfers:clear'
  | 'mobile:get-connection-info'
  | 'localsend:get-status'
  | 'localsend:get-devices'
  | 'localsend:scan-network'
  | 'localsend:send-text'
  | 'localsend:send-file'
  | 'localsend:send-cloud-file'
  | 'localsend:get-received-files'
  | 'localsend:open-download-folder'
  | 'localsend:set-auto-accept'
  | 'localsend:add-manual-device'
  | 'remote-desktop:get-status'
  | 'remote-desktop:set-enabled'
  | 'remote-desktop:stop-session'
  | 'remote-desktop:list-trusted-devices'
  | 'remote-desktop:revoke-trusted-device'
  | 'remote-desktop:revoke-all-trusted-devices'
  | 'vault:select-folder'
  | 'vault:get-default-path'
  | 'vault:list-entries'
  | 'vault:read-file'
  | 'vault:write-file'
  | 'vault:create-file'
  | 'vault:create-folder'
  | 'vault:rename-entry'
  | 'vault:delete-entry'
  | 'vault:reveal-in-explorer'
  | 'vault:start-watcher'
  | 'vault:stop-watcher'
  | 'vault:set-window-mode'
  | 'notifications:get-history'
  | 'notifications:test'
  | 'notifications:get-status'
  | 'notifications:clear-history'
  | 'ai:get-state'
  | 'ai:get-messages'
  | 'ai:create-conversation'
  | 'ai:delete-conversation'
  | 'ai:set-provider'
  | 'ai:send-message'
  | 'ai:clear-cache'
  | 'librechat:activate'
  | 'librechat:set-bounds'
  | 'librechat:deactivate'

export interface ElectronDesktopBridge {
  invoke(channel: IpcChannel, payload?: unknown): Promise<unknown>
  on(event: DesktopEventName, listener: (payload: unknown) => void): () => void
}

export type SharedAppPayload =
  | Alarm
  | AppSettings
  | ConnectionInfo
  | CreateAlarmInput
  | LocalSendDevice
  | LocalSendStatus
  | MirroredNotification
  | MobileNotification
  | NoteItem
  | ReceivedFileRecord
  | RemoteDesktopStatus
  | RemoteTrustedDevice
  | SystemMediaSession
  | TimerState
  | TransferItem
  | BrowserTabProjection
  | BrowserMediaProjection
  | BrowserDownloadItem
  | BrowserPermissionRequest
  | BrowserHistoryItem
  | YouTubeMusicState
  | RemoteCommandPayload
  | AiProviderState
  | AiConversation
  | AiMessage
  | AiSnapshot
  | AiSendResult
  | AiUpdate
  | string
  | null

declare global {
  interface Window {
    kapanisDesktop?: ElectronDesktopBridge
  }
}
