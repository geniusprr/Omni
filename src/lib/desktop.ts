import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { Alarm, AppSettings, CreateAlarmInput, TimerAction, TimerState } from '@/types'

type TriggeredAlarmHandler = (alarm: Alarm) => void

export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function assertTauriRuntime() {
  if (!isTauriRuntime()) {
    throw new Error('kapanış. masaüstü API’si yalnızca Windows uygulaması içinde çalışır.')
  }
}

function listenWithoutBlocking<T>(
  eventName: string,
  callback: (payload: T) => void,
  onError?: (error: unknown) => void,
) {
  if (!isTauriRuntime()) return () => undefined
  let active = true
  let unlisten: UnlistenFn | null = null

  void listen<T>(eventName, (event) => callback(event.payload))
    .then((cleanup) => {
      unlisten = cleanup
      if (!active) cleanup()
    })
    .catch((error) => {
      if (active) onError?.(error)
    })

  return () => {
    active = false
    unlisten?.()
  }
}

export const desktop = {
  isTauri: isTauriRuntime,
  window: {
    minimize: async () => {
      if (!isTauriRuntime()) return
      await getCurrentWindow().minimize()
    },
    toggleMaximize: async () => {
      if (!isTauriRuntime()) return
      const win = getCurrentWindow()
      if (await win.isMaximized()) {
        await win.unmaximize()
      } else {
        await win.maximize()
      }
    },
    isMaximized: async () => {
      if (!isTauriRuntime()) return false
      return getCurrentWindow().isMaximized()
    },
    close: async () => {
      if (!isTauriRuntime()) return
      await getCurrentWindow().close()
    },
  },
  system: {
    getTimerStatus: async () => {
      if (!isTauriRuntime()) return null
      return invoke<TimerState | null>('get_timer_status')
    },
    scheduleShutdown: async (action: TimerAction, seconds: number) => {
      assertTauriRuntime()
      return invoke<TimerState>('schedule_shutdown', { action, seconds })
    },
    cancelShutdown: async () => {
      assertTauriRuntime()
      return invoke<void>('cancel_shutdown')
    },
    getInfo: async () => {
      if (!isTauriRuntime()) {
        return { hostname: 'Web Controller', os: 'Web Browser', platform: 'web' }
      }
      return invoke<{ hostname: string; os: string; platform: string }>('get_system_info')
    },
    onCommand: (callback: (payload: { command: string; delaySeconds: number }) => void) => {
      if (!isTauriRuntime()) return () => undefined
      return listenWithoutBlocking<{ command: string; delaySeconds: number }>('remote:command', callback)
    },
  },
  autostart: {
    isEnabled: async () => {
      if (!isTauriRuntime()) return false
      try {
        return await invoke<boolean>('is_autostart_enabled')
      } catch {
        return false
      }
    },
    setEnabled: async (enabled: boolean) => {
      if (!isTauriRuntime()) return enabled
      try {
        return await invoke<boolean>('set_autostart_enabled', { enabled })
      } catch {
        return false
      }
    },
  },
  settings: {
    get: async (): Promise<AppSettings | null> => {
      if (!isTauriRuntime()) {
        const stored = localStorage.getItem('kapanis_settings')
        return stored ? JSON.parse(stored) : null
      }
      try {
        const content = await invoke<string | null>('get_app_settings')
        return content ? JSON.parse(content) : null
      } catch {
        return null
      }
    },
    save: async (settings: AppSettings): Promise<void> => {
      if (!isTauriRuntime()) {
        localStorage.setItem('kapanis_settings', JSON.stringify(settings))
        return
      }
      await invoke<void>('save_app_settings', { settingsJson: JSON.stringify(settings, null, 2) })
    },
  },
  alarms: {
    list: async () => {
      if (!isTauriRuntime()) return []
      return invoke<Alarm[]>('list_alarms')
    },
    getActive: async () => {
      if (!isTauriRuntime()) return null
      return invoke<Alarm | null>('get_active_alarm')
    },
    create: (payload: CreateAlarmInput) => {
      assertTauriRuntime()
      return invoke<Alarm>('create_alarm', { input: payload })
    },
    cancel: (id: string) => {
      assertTauriRuntime()
      return invoke<boolean>('cancel_alarm', { id })
    },
    stopSound: () => {
      assertTauriRuntime()
      return invoke<void>('stop_alarm_sound')
    },
    onTriggered: (callback: TriggeredAlarmHandler, onError?: (error: unknown) => void) => {
      if (!isTauriRuntime()) return () => undefined
      return listenWithoutBlocking<Alarm>('alarm:triggered', callback, onError)
    },
    onCreated: (callback: (alarm: Alarm) => void) => {
      if (!isTauriRuntime()) return () => undefined
      return listenWithoutBlocking<Alarm>('alarm:created', callback)
    },
    onCancelled: (callback: (id: string) => void) => {
      if (!isTauriRuntime()) return () => undefined
      return listenWithoutBlocking<string>('alarm:cancelled', callback)
    },
  },
  notes: {
    list: async () => {
      if (!isTauriRuntime()) return []
      return invoke<import('@/types').NoteItem[]>('list_notes')
    },
    save: async (content: string, id?: string, pinned?: boolean) => {
      assertTauriRuntime()
      return invoke<import('@/types').NoteItem>('save_note', { id: id ?? null, content, pinned: pinned ?? null })
    },
    delete: async (id: string) => {
      assertTauriRuntime()
      return invoke<boolean>('delete_note', { id })
    },
    togglePin: async (id: string) => {
      assertTauriRuntime()
      return invoke<boolean>('toggle_note_pin', { id })
    },
    onReceived: (callback: (note: import('@/types').NoteItem) => void) => {
      if (!isTauriRuntime()) return () => undefined
      return listenWithoutBlocking<import('@/types').NoteItem>('mobile:note', callback)
    },
  },
  transfers: {
    list: async () => {
      if (!isTauriRuntime()) return []
      return invoke<import('@/types').TransferItem[]>('list_transfers')
    },
    open: async (path: string) => {
      assertTauriRuntime()
      return invoke<void>('open_transfer_file', { path })
    },
    showInFolder: async (path: string) => {
      assertTauriRuntime()
      return invoke<void>('show_transfer_in_folder', { path })
    },
    delete: async (id: string) => {
      assertTauriRuntime()
      return invoke<boolean>('delete_transfer', { id })
    },
    clear: async () => {
      assertTauriRuntime()
      return invoke<void>('clear_transfers')
    },
    onReceived: (callback: (item: import('@/types').TransferItem) => void) => {
      if (!isTauriRuntime()) return () => undefined
      return listenWithoutBlocking<import('@/types').TransferItem>('mobile:file', callback)
    },
  },
  mobile: {
    getConnectionInfo: async () => {
      if (!isTauriRuntime()) {
        return {
          port: 54321,
          ipAddresses: ['127.0.0.1'],
          deviceName: 'Kapanış Desktop',
          qrPayload: 'kapanis://connect?host=127.0.0.1&port=54321&name=Desktop',
        }
      }
      return invoke<import('@/types').ConnectionInfo>('get_connection_info')
    },
    onNotification: (callback: (payload: import('@/types').MobileNotification) => void) => {
      if (!isTauriRuntime()) return () => undefined
      return listenWithoutBlocking<import('@/types').MobileNotification>('mobile:notification', callback)
    },
  },
  localsend: {
    getStatus: async (): Promise<import('@/types').LocalSendStatus> => {
      if (!isTauriRuntime()) {
        return {
          isRunning: true,
          localIp: '192.168.1.100',
          allIps: ['192.168.1.100'],
          port: 53317,
          alias: 'Masaüstü PC',
          fingerprint: 'web-demo',
          autoAccept: true,
          downloadDir: 'Downloads/kapanis_received',
          discoveredCount: 0,
        }
      }
      return invoke<import('@/types').LocalSendStatus>('localsend_get_status')
    },
    getDevices: async (): Promise<import('@/types').LocalSendDevice[]> => {
      if (!isTauriRuntime()) return []
      return invoke<import('@/types').LocalSendDevice[]>('localsend_get_devices')
    },
    scanNetwork: async (): Promise<void> => {
      if (!isTauriRuntime()) return
      return invoke<void>('localsend_scan_network')
    },
    sendText: async (targetIp: string, targetPort: number, text: string): Promise<string> => {
      assertTauriRuntime()
      return invoke<string>('localsend_send_text', { targetIp, targetPort, text })
    },
    sendFile: async (targetIp: string, targetPort: number, filePath: string): Promise<string> => {
      assertTauriRuntime()
      return invoke<string>('localsend_send_file', { targetIp, targetPort, filePath })
    },
    getReceivedFiles: async (): Promise<import('@/types').ReceivedFileRecord[]> => {
      if (!isTauriRuntime()) return []
      return invoke<import('@/types').ReceivedFileRecord[]>('localsend_get_received_files')
    },
    openDownloadFolder: async (): Promise<void> => {
      if (!isTauriRuntime()) return
      return invoke<void>('localsend_open_download_folder')
    },
    setAutoAccept: async (enabled: boolean): Promise<boolean> => {
      if (!isTauriRuntime()) return enabled
      return invoke<boolean>('localsend_set_auto_accept', { enabled })
    },
    addManualDevice: async (targetIp: string, targetPort?: number): Promise<import('@/types').LocalSendDevice> => {
      assertTauriRuntime()
      return invoke<import('@/types').LocalSendDevice>('localsend_add_manual_device', { targetIp, targetPort: targetPort ?? null })
    },
    onDeviceDiscovered: (callback: (device: import('@/types').LocalSendDevice) => void) => {
      if (!isTauriRuntime()) return () => undefined
      return listenWithoutBlocking<import('@/types').LocalSendDevice>('localsend:device-discovered', callback)
    },
    onFileReceived: (callback: (file: import('@/types').ReceivedFileRecord) => void) => {
      if (!isTauriRuntime()) return () => undefined
      return listenWithoutBlocking<import('@/types').ReceivedFileRecord>('localsend:file-received', callback)
    },
  },
  vault: {
    selectFolder: async (): Promise<string | null> => {
      if (!isTauriRuntime()) return '/mock/vault'
      return invoke<string | null>('vault_select_folder')
    },
    getDefaultPath: async (): Promise<string> => {
      if (!isTauriRuntime()) return '/mock/vault'
      return invoke<string>('vault_get_default_path')
    },
    listEntries: async (vaultPath: string): Promise<import('@/features/notes/types').VaultFileEntry[]> => {
      if (!isTauriRuntime()) return []
      return invoke<import('@/features/notes/types').VaultFileEntry[]>('vault_list_entries', { vaultPath })
    },
    readFile: async (vaultPath: string, relPath: string): Promise<string> => {
      if (!isTauriRuntime()) return ''
      return invoke<string>('vault_read_file', { vaultPath, relPath })
    },
    writeFile: async (vaultPath: string, relPath: string, content: string): Promise<void> => {
      assertTauriRuntime()
      return invoke<void>('vault_write_file', { vaultPath, relPath, content })
    },
    createFile: async (vaultPath: string, relPath: string, initialContent?: string): Promise<void> => {
      assertTauriRuntime()
      return invoke<void>('vault_create_file', { vaultPath, relPath, initialContent: initialContent ?? null })
    },
    createFolder: async (vaultPath: string, relPath: string): Promise<void> => {
      assertTauriRuntime()
      return invoke<void>('vault_create_folder', { vaultPath, relPath })
    },
    renameEntry: async (vaultPath: string, oldRelPath: string, newRelPath: string): Promise<void> => {
      assertTauriRuntime()
      return invoke<void>('vault_rename_entry', { vaultPath, oldRelPath, newRelPath })
    },
    deleteEntry: async (vaultPath: string, relPath: string): Promise<void> => {
      assertTauriRuntime()
      return invoke<void>('vault_delete_entry', { vaultPath, relPath })
    },
    revealInExplorer: async (vaultPath: string, relPath?: string): Promise<void> => {
      if (!isTauriRuntime()) return
      return invoke<void>('vault_reveal_in_explorer', { vaultPath, relPath: relPath ?? null })
    },
    startWatcher: async (vaultPath: string): Promise<void> => {
      if (!isTauriRuntime()) return
      return invoke<void>('vault_start_watcher', { vaultPath })
    },
    stopWatcher: async (): Promise<void> => {
      if (!isTauriRuntime()) return
      return invoke<void>('vault_stop_watcher')
    },
    setWindowMode: async (mode: 'notes' | 'compact'): Promise<void> => {
      if (!isTauriRuntime()) return
      return invoke<void>('vault_set_window_mode', { mode })
    },
    onFsChange: (callback: (payload: { kind: string; path: string }) => void) => {
      if (!isTauriRuntime()) return () => undefined
      return listenWithoutBlocking<{ kind: string; path: string }>('vault:fs-change', callback)
    },
  },
}

