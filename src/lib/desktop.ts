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
  RemoteTrustedDevice,
  TimerAction,
  TimerState,
  TransferItem,
} from '@/types'
import { APP_EVENTS, BROWSER_EVENTS, type AgentAppAction, type AiConversation, type AiMessage, type AiProviderConfigInput, type AiProviderId, type AiSendInput, type AiSendResult, type AiSnapshot, type AiUpdate, type BrowserBounds, type BrowserDebugSnapshot, type BrowserDownloadItem, type BrowserExtensionInfo, type BrowserFeatureState, type BrowserHistoryItem, type BrowserMediaProjection, type BrowserPermissionRecord, type BrowserPermissionRequest, type BrowserSessionSnapshot, type BrowserTabProjection, type DesktopEventName, type ElectronDesktopBridge, type IpcChannel, type PermissionSetInput, type ProgramCandidate, type SystemMediaSession, type YouTubeMusicState } from '../../shared/contracts'
import type { VaultFileEntry } from '@/features/notes/types'
import type { AppTheme } from '@/theme'

export { APP_EVENTS, BROWSER_EVENTS }
export type { AgentAppAction, AiConversation, AiMessage, AiProviderConfigInput, AiProviderId, AiSendInput, AiSendResult, AiSnapshot, AiUpdate, BrowserBounds, BrowserDebugSnapshot, BrowserDownloadItem, BrowserExtensionInfo, BrowserFeatureState, BrowserHistoryItem, BrowserMediaProjection, BrowserPermissionRecord, BrowserPermissionRequest, BrowserSessionSnapshot, BrowserTabProjection, PermissionSetInput, ProgramCandidate, SystemMediaSession, YouTubeMusicState }

type Unsubscribe = () => void

function getBridge(): ElectronDesktopBridge | undefined {
  return typeof window !== 'undefined' ? window.kapanisDesktop : undefined
}

export function isElectronRuntime() {
  return Boolean(getBridge())
}

export function isDesktopRuntime() {
  return isElectronRuntime()
}

function requireBridge() {
  const bridge = getBridge()
  if (!bridge) throw new Error('Eon masaüstü API’si yalnızca Electron uygulaması içinde çalışır.')
  return bridge
}

function invoke<T>(channel: IpcChannel, payload?: unknown): Promise<T> {
  return requireBridge().invoke(channel, payload) as Promise<T>
}

function optionalInvoke<T>(channel: IpcChannel, fallback: T, payload?: unknown): Promise<T> {
  return getBridge() ? invoke<T>(channel, payload) : Promise.resolve(fallback)
}

function listen<T>(event: DesktopEventName, callback: (payload: T) => void): Unsubscribe {
  const bridge = getBridge()
  return bridge ? bridge.on(event, callback as (payload: unknown) => void) : () => undefined
}

function readLocal<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}

type TriggeredAlarmHandler = (alarm: Alarm) => void

function emptyAiSnapshot(): AiSnapshot {
  return { providers: [], conversations: [], cacheEntries: 0 }
}

export const desktop = {
  isElectron: isElectronRuntime,
  openExternal: async (url: string): Promise<void> => {
    if (!/^https?:\/\//i.test(url.trim())) throw new Error('Yalnızca http veya https bağlantıları açılabilir.')
    if (!getBridge()) {
      if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    await invoke<void>('open-external', { url })
  },
  browser: {
    create: (id: string, url: string, bounds: BrowserBounds, options?: { incognito?: boolean }) => invoke<BrowserTabProjection>('browser:create-tab', { id, url, bounds, incognito: options?.incognito }),
    activate: (id: string, visible: boolean) => optionalInvoke<void>('browser:activate-tab', undefined, { id, visible }),
    close: (id: string) => optionalInvoke<boolean>('browser:close-tab', false, { id }),
    navigate: (id: string, url: string) => invoke<void>('browser:navigate', { id, url }),
    stop: (id: string) => optionalInvoke<void>('browser:stop', undefined, { id }),
    reload: (id: string) => optionalInvoke<void>('browser:reload', undefined, { id }),
    back: (id: string) => optionalInvoke<void>('browser:back', undefined, { id }),
    forward: (id: string) => optionalInvoke<void>('browser:forward', undefined, { id }),
    setVisible: (visible: boolean) => optionalInvoke<void>('browser:set-visible', undefined, { visible }),
    deactivate: () => optionalInvoke<void>('browser:deactivate', undefined),
    setBounds: (id: string, bounds: BrowserBounds) => optionalInvoke<void>('browser:set-bounds', undefined, { id, bounds }),
    setZoom: (id: string, factor: number) => optionalInvoke<void>('browser:set-zoom', undefined, { id, factor }),
    capturePage: (id: string) => optionalInvoke<void>('browser:capture-page', undefined, { id }),
    debugSnapshot: () => optionalInvoke<BrowserDebugSnapshot | null>('browser:debug-snapshot', null),
    syncMetadata: () => optionalInvoke<void>('browser:sync-metadata', undefined),
    toggleMedia: (id: string) => optionalInvoke<void>('browser:toggle-media', undefined, { id }),
    controlMedia: (id: string, action: 'toggle-play' | 'next' | 'previous' | 'toggle-mute') => optionalInvoke<void>('browser:media-control', undefined, { id, action }),
    setMediaVolume: (id: string, volume: number) => optionalInvoke<void>('browser:media-volume', undefined, { id, volume }),
    setTheme: (theme: 'light' | 'dark') => optionalInvoke<void>('browser:set-theme', undefined, { theme }),
    getSession: () => optionalInvoke<BrowserSessionSnapshot>('browser:get-session', { tabs: [], activeTabId: null }),
    saveSession: (snapshot: BrowserSessionSnapshot) => optionalInvoke<void>('browser:save-session', undefined, snapshot),
    duplicate: (id: string, newId: string, bounds: BrowserBounds) => invoke<BrowserTabProjection>('browser:duplicate-tab', { id, newId, bounds }),
    setPinned: (id: string, pinned: boolean) => optionalInvoke<void>('browser:set-pinned', undefined, { id, pinned }),
    setMuted: (id: string, muted: boolean) => optionalInvoke<void>('browser:set-muted', undefined, { id, muted }),
    showTabMenu: (id: string) => optionalInvoke<void>('browser:show-tab-menu', undefined, { id }),
    listHistory: (limit?: number) => optionalInvoke<BrowserHistoryItem[]>('browser:list-history', [], { limit }),
    clearHistory: () => optionalInvoke<void>('browser:clear-history', undefined),
    listDownloads: () => optionalInvoke<BrowserDownloadItem[]>('browser:list-downloads', []),
    openDownload: (id: string) => optionalInvoke<void>('browser:open-download', undefined, { id }),
    showDownload: (id: string) => optionalInvoke<void>('browser:show-download', undefined, { id }),
    cancelDownload: (id: string) => optionalInvoke<boolean>('browser:cancel-download', false, { id }),
    removeDownload: (id: string) => optionalInvoke<boolean>('browser:remove-download', false, { id }),
    listPermissions: () => optionalInvoke<BrowserPermissionRecord[]>('browser:list-permissions', []),
    setPermission: (input: PermissionSetInput) => optionalInvoke<void>('browser:set-permission', undefined, input),
    clearPermission: (origin?: string, permission?: string) => optionalInvoke<void>('browser:clear-permission', undefined, { origin, permission }),
    getFeatures: () => optionalInvoke<BrowserFeatureState>('browser:get-features', {
      adBlockEnabled: true,
      adBlockReady: false,
      adBlockEngine: 'Ghostery · uBlock/EasyList uyumlu',
      extensionCount: 0,
      extensions: [],
    }),
    setAdBlock: (enabled: boolean) => optionalInvoke<BrowserFeatureState>('browser:set-adblock', {
      adBlockEnabled: enabled,
      adBlockReady: false,
      adBlockEngine: 'Ghostery · uBlock/EasyList uyumlu',
      extensionCount: 0,
      extensions: [],
    }, { enabled }),
    installExtensionFromStore: (value: string) => invoke<BrowserExtensionInfo>('browser:install-extension-store', { value }),
    installUnpackedExtension: () => optionalInvoke<BrowserExtensionInfo | null>('browser:install-extension-unpacked', null),
    setExtensionEnabled: (id: string, enabled: boolean) => optionalInvoke<BrowserFeatureState>('browser:set-extension-enabled', {
      adBlockEnabled: true,
      adBlockReady: false,
      adBlockEngine: 'Ghostery · uBlock/EasyList uyumlu',
      extensionCount: 0,
      extensions: [],
    }, { id, enabled }),
    removeExtension: (id: string) => optionalInvoke<BrowserFeatureState>('browser:remove-extension', {
      adBlockEnabled: true,
      adBlockReady: false,
      adBlockEngine: 'Ghostery · uBlock/EasyList uyumlu',
      extensionCount: 0,
      extensions: [],
    }, { id }),
    openExtensionOptions: (id: string) => optionalInvoke<void>('browser:open-extension-options', undefined, { id }),
    clearBrowsingData: (scope: 'cache' | 'cookies' | 'all') => optionalInvoke<void>('browser:clear-browsing-data', undefined, { scope }),
    on: <T>(event: (typeof BROWSER_EVENTS)[keyof typeof BROWSER_EVENTS], callback: (payload: T) => void) => listen<T>(event, callback),
  },
  media: {
    getCurrent: () => optionalInvoke<SystemMediaSession | null>('media:get-current', null),
    control: (action: 'toggle-play-pause' | 'next' | 'previous') => optionalInvoke<boolean>('media:control', false, { action }),
  },
  youtubeMusic: {
    control: (action: 'toggle-play' | 'next' | 'previous' | 'toggle-mute') => optionalInvoke<void>('youtube-music:control', undefined, { action }),
    setVolume: (volume: number) => optionalInvoke<void>('youtube-music:set-volume', undefined, { volume }),
    syncState: () => optionalInvoke<YouTubeMusicState | null>('youtube-music:sync-state', null),
    onState: (callback: (state: YouTubeMusicState) => void) => listen(APP_EVENTS.youtubeMusicState, callback),
  },
  programs: {
    launch: (path: string) => invoke<void>('launch-program', { path }),
    list: (refresh = false) => optionalInvoke<ProgramCandidate[]>('programs:list', [], { refresh }),
    icon: (path: string) => optionalInvoke<string | null>('programs:icon', null, { path }),
    pick: () => optionalInvoke<ProgramCandidate | null>('programs:pick', null),
  },
  websiteIcons: {
    get: (url: string) => optionalInvoke<string | null>('website-icons:get', null, { url }),
  },
  window: {
    minimize: () => optionalInvoke<void>('window:minimize', undefined),
    toggleMaximize: () => optionalInvoke<void>('window:toggle-maximize', undefined),
    isMaximized: () => optionalInvoke<boolean>('window:is-maximized', false),
    setBrowserFocus: (enabled: boolean) => optionalInvoke<boolean>('window:set-browser-focus', false, { enabled }),
    isBrowserFocus: () => optionalInvoke<boolean>('window:is-browser-focus', false),
    onBrowserFocusChanged: (callback: (payload: { enabled: boolean }) => void) => listen(APP_EVENTS.browserFocusChanged, callback),
    onBrowserFocusShortcut: (callback: () => void) => listen(APP_EVENTS.browserFocusShortcut, callback),
    close: () => optionalInvoke<void>('window:close', undefined),
  },
  system: {
    getTimerStatus: () => optionalInvoke<TimerState | null>('system:get-timer-status', null),
    scheduleShutdown: (action: TimerAction, seconds: number) => invoke<TimerState>('system:schedule-shutdown', { action, seconds }),
    cancelShutdown: () => invoke<void>('system:cancel-shutdown'),
    getInfo: () => optionalInvoke<{ hostname: string; os: string; platform: string }>('system:get-info', { hostname: 'Web Controller', os: 'Web Browser', platform: 'web' }),
    onCommand: (callback: (payload: { command: string; delaySeconds: number }) => void) => listen(APP_EVENTS.remoteCommand, callback),
  },
  autostart: {
    isEnabled: () => optionalInvoke<boolean>('system:get-autostart', false),
    setEnabled: (enabled: boolean) => optionalInvoke<boolean>('system:set-autostart', enabled, { enabled }),
  },
  settings: {
    get: async (): Promise<AppSettings | null> => {
      if (!getBridge()) return readLocal<AppSettings>('kapanis_settings')
      return invoke<AppSettings | null>('settings:get')
    },
    save: async (settings: AppSettings): Promise<void> => {
      if (!getBridge()) {
        localStorage.setItem('kapanis_settings', JSON.stringify(settings))
        return
      }
      await invoke<void>('settings:save', { settings })
    },
  },
  alarms: {
    list: () => optionalInvoke<Alarm[]>('alarms:list', []),
    getActive: () => optionalInvoke<Alarm | null>('alarms:get-active', null),
    create: (input: CreateAlarmInput) => invoke<Alarm>('alarms:create', { input }),
    cancel: (id: string) => invoke<boolean>('alarms:cancel', { id }),
    stopSound: () => invoke<void>('alarms:stop-sound'),
    onTriggered: (callback: TriggeredAlarmHandler, _onError?: (error: unknown) => void) => listen(APP_EVENTS.alarmTriggered, callback),
    onCreated: (callback: (alarm: Alarm) => void) => listen(APP_EVENTS.alarmCreated, callback),
    onCancelled: (callback: (id: string) => void) => listen(APP_EVENTS.alarmCancelled, callback),
  },
  notes: {
    list: () => optionalInvoke<NoteItem[]>('notes:list', []),
    save: (content: string, id?: string, pinned?: boolean) => invoke<NoteItem>('notes:save', { id, content, pinned }),
    delete: (id: string) => invoke<boolean>('notes:delete', { id }),
    togglePin: (id: string) => invoke<boolean>('notes:toggle-pin', { id }),
    onReceived: (callback: (note: NoteItem) => void) => listen(APP_EVENTS.mobileNote, callback),
  },
  transfers: {
    list: () => optionalInvoke<TransferItem[]>('transfers:list', []),
    open: (path: string) => invoke<void>('transfers:open', { path }),
    showInFolder: (path: string) => invoke<void>('transfers:show-in-folder', { path }),
    delete: (id: string) => invoke<boolean>('transfers:delete', { id }),
    clear: () => invoke<void>('transfers:clear'),
    onReceived: (callback: (item: TransferItem) => void) => listen(APP_EVENTS.mobileFile, callback),
  },
  mobile: {
    getConnectionInfo: () => optionalInvoke<ConnectionInfo>('mobile:get-connection-info', { port: 54321, ipAddresses: ['127.0.0.1'], deviceName: 'Eon Desktop', qrPayload: 'kapanis://connect?host=127.0.0.1&port=54321&name=Desktop' }),
    onNotification: (callback: (payload: MobileNotification) => void) => listen(APP_EVENTS.mobileNotification, callback),
  },
  localsend: {
    getStatus: () => optionalInvoke<LocalSendStatus>('localsend:get-status', { isRunning: false, localIp: '127.0.0.1', allIps: ['127.0.0.1'], port: 53317, alias: 'Eon Desktop', fingerprint: 'web-preview', autoAccept: false, downloadDir: '', discoveredCount: 0 }),
    getDevices: () => optionalInvoke<LocalSendDevice[]>('localsend:get-devices', []),
    scanNetwork: () => optionalInvoke<void>('localsend:scan-network', undefined),
    sendText: (targetIp: string, targetPort: number, text: string) => invoke<string>('localsend:send-text', { targetIp, targetPort, text }),
    sendFile: (targetIp: string, targetPort: number, filePath: string) => invoke<string>('localsend:send-file', { targetIp, targetPort, filePath }),
    sendCloudFile: (filePath: string, controllerId: string) => invoke<string>('localsend:send-cloud-file', { filePath, controllerId }),
    getReceivedFiles: () => optionalInvoke<ReceivedFileRecord[]>('localsend:get-received-files', []),
    openDownloadFolder: () => optionalInvoke<void>('localsend:open-download-folder', undefined),
    setAutoAccept: (enabled: boolean) => optionalInvoke<boolean>('localsend:set-auto-accept', enabled, { enabled }),
    addManualDevice: (targetIp: string, targetPort?: number) => invoke<LocalSendDevice>('localsend:add-manual-device', { targetIp, targetPort }),
    onDeviceDiscovered: (callback: (device: LocalSendDevice) => void) => listen(APP_EVENTS.localSendDevice, callback),
    onFileReceived: (callback: (file: ReceivedFileRecord) => void) => listen(APP_EVENTS.localSendFile, callback),
  },
  remoteDesktop: {
    getStatus: () => optionalInvoke<RemoteDesktopStatus>('remote-desktop:get-status', { state: 'ready', sessionId: null, controllerId: null, controllerName: null, display: null, lastError: null }),
    setEnabled: (enabled: boolean) => optionalInvoke<boolean>('remote-desktop:set-enabled', enabled, { enabled }),
    stopSession: () => optionalInvoke<boolean>('remote-desktop:stop-session', false),
    listTrustedDevices: () => optionalInvoke<RemoteTrustedDevice[]>('remote-desktop:list-trusted-devices', []),
    revokeTrustedDevice: (id: string) => optionalInvoke<boolean>('remote-desktop:revoke-trusted-device', false, { id }),
    revokeAllTrustedDevices: () => optionalInvoke<number>('remote-desktop:revoke-all-trusted-devices', 0),
    onState: (callback: (status: RemoteDesktopStatus) => void) => listen(APP_EVENTS.remoteDesktopState, callback),
  },
  ai: {
    getState: () => optionalInvoke<AiSnapshot>('ai:get-state', emptyAiSnapshot()),
    getMessages: (conversationId: string) => optionalInvoke<AiMessage[]>('ai:get-messages', [], { conversationId }),
    createConversation: (providerId?: AiProviderId, model?: string) => optionalInvoke<AiConversation | null>('ai:create-conversation', null, { providerId, model }),
    deleteConversation: (conversationId: string) => optionalInvoke<boolean>('ai:delete-conversation', false, { conversationId }),
    setProvider: (input: AiProviderConfigInput) => optionalInvoke<AiSnapshot>('ai:set-provider', emptyAiSnapshot(), input),
    sendMessage: (input: AiSendInput) => optionalInvoke<AiSendResult | null>('ai:send-message', null, input),
    clearCache: () => optionalInvoke<boolean>('ai:clear-cache', false),
    onUpdate: (callback: (update: AiUpdate) => void) => listen(APP_EVENTS.aiUpdated, callback),
  },
  vault: {
    selectFolder: () => optionalInvoke<string | null>('vault:select-folder', null),
    getDefaultPath: () => optionalInvoke<string>('vault:get-default-path', '/mock/vault'),
    listEntries: (vaultPath: string) => optionalInvoke<VaultFileEntry[]>('vault:list-entries', [], { vaultPath }),
    readFile: (vaultPath: string, relPath: string) => optionalInvoke<string>('vault:read-file', '', { vaultPath, relPath }),
    writeFile: (vaultPath: string, relPath: string, content: string) => invoke<void>('vault:write-file', { vaultPath, relPath, content }),
    createFile: (vaultPath: string, relPath: string, initialContent?: string) => invoke<void>('vault:create-file', { vaultPath, relPath, initialContent }),
    createFolder: (vaultPath: string, relPath: string) => invoke<void>('vault:create-folder', { vaultPath, relPath }),
    renameEntry: (vaultPath: string, oldRelPath: string, newRelPath: string) => invoke<void>('vault:rename-entry', { vaultPath, oldRelPath, newRelPath }),
    deleteEntry: (vaultPath: string, relPath: string) => invoke<void>('vault:delete-entry', { vaultPath, relPath }),
    revealInExplorer: (vaultPath: string, relPath?: string) => optionalInvoke<void>('vault:reveal-in-explorer', undefined, { vaultPath, relPath }),
    startWatcher: (vaultPath: string) => optionalInvoke<void>('vault:start-watcher', undefined, { vaultPath }),
    stopWatcher: () => optionalInvoke<void>('vault:stop-watcher', undefined),
    setWindowMode: (mode: 'notes' | 'compact') => optionalInvoke<void>('vault:set-window-mode', undefined, { mode }),
    onFsChange: (callback: (payload: { kind: string; path: string }) => void) => listen(APP_EVENTS.vaultFsChange, callback),
  },
  notifications: {
    getHistory: () => optionalInvoke<MirroredNotification[]>('notifications:get-history', []),
    clearHistory: () => optionalInvoke<boolean>('notifications:clear-history', true),
    getStatus: () => optionalInvoke<{ running: boolean; accessGranted: boolean; historyCount: number }>('notifications:get-status', { running: false, accessGranted: false, historyCount: 0 }),
    test: (title?: string, body?: string) => optionalInvoke<MirroredNotification | null>('notifications:test', null, { title, body }),
    onMirrored: (callback: (notification: MirroredNotification) => void) => listen(APP_EVENTS.notificationMirrored, callback),
  },
  agent: {
    onAction: (callback: (action: AgentAppAction) => void) => listen(APP_EVENTS.agentAction, callback),
  },
  libreChat: {
    activate: (bounds: BrowserBounds) => optionalInvoke<{ url: string } | null>('librechat:activate', null, { bounds }),
    setBounds: (bounds: BrowserBounds) => optionalInvoke<void>('librechat:set-bounds', undefined, { bounds }),
    setTheme: (theme: AppTheme) => optionalInvoke<void>('librechat:set-theme', undefined, { theme }),
    deactivate: () => optionalInvoke<void>('librechat:deactivate', undefined),
  },
}
