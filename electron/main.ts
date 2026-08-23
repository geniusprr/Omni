import { app, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { APP_EVENTS, BROWSER_EVENTS, type AiProviderConfigInput, type AiProviderId, type AiSendInput, type BrowserBounds, type BrowserSessionSnapshot, type PermissionSetInput } from '../shared/contracts.js'
import { AiStore } from './AiStore.js'
import { LibreChatServer } from './LibreChatServer.js'
import { LibreChatView } from './LibreChatView.js'
import { AlarmManager } from './AlarmManager.js'
import { BrowserManager } from './BrowserManager.js'
import { ContentManager } from './ContentManager.js'
import { LocalSendManager } from './LocalSendManager.js'
import { NotificationListenerManager } from './NotificationListenerManager.js'
import { RemoteDesktopManager } from './RemoteDesktopManager.js'
import { SystemManager } from './SystemManager.js'
import { WindowManager } from './WindowManager.js'
import { runBrowserLifecycleSmoke } from './browser-smoke.js'
import { runLibreChatLifecycleSmoke } from './librechat-smoke.js'

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
const isBrowserSmokeTest = process.env.KAPANIS_SMOKE_TEST === '1'

// The smoke runner always uses an isolated profile. It must be able to start
// beside a user's running app so the lifecycle and visual checks cannot turn
// into a false success merely because the normal single-instance lock won.
if (!isBrowserSmokeTest && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let windows: WindowManager
  let browser: BrowserManager
  let alarms: AlarmManager
  let system: SystemManager
  let content: ContentManager
  let localSend: LocalSendManager
  let notifications: NotificationListenerManager
  let aiStore: AiStore
  let libreChatServer: LibreChatServer
  let libreChatView: LibreChatView
  let remoteDesktop: RemoteDesktopManager
  let quitting = false
  let requestedExitCode = 0

  app.on('second-instance', (_event, commandLine) => {
    windows?.showMain()
    const url = commandLine.find((value) => /^https?:\/\//i.test(value))
    if (url) send(BROWSER_EVENTS.openRequest, { url, sourceTabId: null })
  })

  app.on('web-contents-created', (_event, webContents) => {
    webContents.on('will-attach-webview', (event) => event.preventDefault())
  })

  app.whenReady().then(async () => {
    const devServer = process.env.ELECTRON_START_URL || (app.isPackaged ? null : 'http://127.0.0.1:5173')
    const rendererTarget = devServer || pathToFileURL(path.join(app.getAppPath(), 'dist', 'index.html')).toString()
    const splashTarget = devServer || pathToFileURL(path.join(app.getAppPath(), 'dist', 'splash.html')).toString()
    windows = new WindowManager(path.join(moduleDirectory, 'preload.cjs'))
    windows.createSplash(splashTarget)
    const mainWindow = windows.createMainWindow(rendererTarget)
    windows.configureTray(() => windows.quit())

    browser = new BrowserManager(windows, mainWindow)
    system = new SystemManager(browser.sessions.dataDir)
    content = new ContentManager(browser.sessions.dataDir, windows)
    alarms = new AlarmManager(browser.sessions.dataDir, windows, send)
    localSend = new LocalSendManager(
      browser.sessions.dataDir,
      (device) => send('localsend:device-discovered', device),
      (file) => {
        send('localsend:file-received', file)
        content.addTransfer({
          id: file.id,
          filename: file.fileName,
          path: file.localPath,
          size: file.size,
          mimeType: file.isText ? 'text/plain' : 'application/octet-stream',
          createdAt: file.receivedAt,
          isImage: /\\.(png|jpe?g|gif|webp)$/i.test(file.fileName),
        })
      },
      { system, alarms, content, emit: send },
    )
    remoteDesktop = new RemoteDesktopManager({
      getSettings: () => system.getSettings(),
      authorize: (request, url) => localSend.authorizeRequest(request, url),
      revokeTrustedDevice: (id) => localSend.revokeTrustedDevice(id),
      preloadPath: path.join(moduleDirectory, 'remote-capture-preload.cjs'),
      captureUrl: `http://127.0.0.1:${localSend.port}/api/remote/capture`,
      emit: (status) => send(APP_EVENTS.remoteDesktopState, status),
    })
    localSend.setRemoteDesktopHandlers({
      handleRequest: (request, response, url) => remoteDesktop.handleRequest(request, response, url),
      handleUpgrade: (request, socket, head) => remoteDesktop.handleUpgrade(request, socket, head),
    })
    notifications = new NotificationListenerManager({
      dataDir: browser.sessions.dataDir,
      onNotification: (notif) => {
        send('notification:mirrored', notif)
        localSend.broadcastNotification(notif)
      },
    })
    // AI is an in-process local client. It opens one SQLite file under the
    // app data directory and serves the bundled LibreChat shell only on a
    // loopback port; no external server, Docker stack, or login flow is used.
    aiStore = new AiStore(browser.sessions.dataDir, (snapshot) => send('ai:updated', { type: 'snapshot', snapshot }))
    void aiStore.ready().then((snapshot) => send('ai:updated', { type: 'snapshot', snapshot }))
    const libreChatStaticRoot = app.isPackaged
      ? path.join(process.resourcesPath, 'librechat-client')
      : path.join(app.getAppPath(), 'vendor', 'librechat-client')
    libreChatServer = new LibreChatServer(libreChatStaticRoot, aiStore)
    await libreChatServer.start()
    libreChatView = new LibreChatView(mainWindow)
    if (!isBrowserSmokeTest) {
      localSend.start()
      alarms.start()
      notifications.start()
      system.restoreTimer()
    }
    registerIpc(mainWindow.webContents)
    mainWindow.webContents.once('did-finish-load', () => windows.finishSplash())
    mainWindow.on('closed', () => { if (!quitting) app.quit() })
    if (isBrowserSmokeTest) {
      const startSmoke = () => {
        void runBrowserLifecycleSmoke(browser, mainWindow, process.env.KAPANIS_SMOKE_URL || 'http://127.0.0.1:4179')
          .then(() => runLibreChatLifecycleSmoke(aiStore, libreChatServer, libreChatView, mainWindow))
          .then(() => app.quit())
          .catch((error) => {
            requestedExitCode = 1
            console.error('[browser-smoke] failed', error)
            app.quit()
          })
      }
      mainWindow.webContents.once('did-finish-load', startSmoke)
    }
  }).catch((error) => {
    console.error('[startup] Omni could not start', error)
    app.quit()
  })

  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    windows?.allowCloseOnQuit()
    void (async () => {
      await browser?.destroyAll()
      alarms?.destroy()
      content?.stopWatcher()
      await remoteDesktop?.dispose()
      localSend?.stop()
      notifications?.stop()
      libreChatView?.destroy()
      await libreChatServer?.stop()
      aiStore?.close()
      app.exit(requestedExitCode)
    })().catch((error) => {
      console.error('[shutdown] cleanup failed', error)
      app.exit(1)
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'win32') app.quit()
  })

  app.on('activate', () => windows?.showMain())

  function registerIpc(mainWebContents: WebContents) {
    const handle = (channel: string, callback: (payload: any) => unknown | Promise<unknown>) => {
      ipcMain.handle(channel, async (event, payload) => {
        assertMainSender(event, mainWebContents)
        return callback(payload)
      })
    }

    handle('window:minimize', () => windows.minimize())
    handle('window:toggle-maximize', () => windows.toggleMaximize())
    handle('window:is-maximized', () => windows.isMaximized())
    handle('window:close', () => windows.close())
    handle('window:show', () => windows.showMain())
    handle('open-external', (payload) => windows.openExternal(readString(payload, 'url')))
    handle('launch-program', (payload) => windows.launchProgram(readString(payload, 'path')))
    handle('programs:list', (payload) => windows.listPrograms(Boolean(readObject(payload).refresh)))
    handle('programs:icon', (payload) => windows.getProgramIcon(readString(payload, 'path')))
    handle('programs:pick', () => windows.pickProgram())
    handle('website-icons:get', (payload) => windows.getWebsiteIcon(readString(payload, 'url')))

    handle('system:get-timer-status', () => system.getTimerStatus())
    handle('system:schedule-shutdown', (payload) => system.scheduleShutdown(readTimerAction(payload), readNumber(payload, 'seconds')))
    handle('system:cancel-shutdown', () => system.cancelShutdown())
    handle('system:get-info', () => system.getInfo())
    handle('system:get-autostart', () => system.getAutostart())
    handle('system:set-autostart', (payload) => system.setAutostart(Boolean(readObject(payload).enabled)))
    handle('settings:get', () => system.getSettings())
    handle('settings:save', (payload) => system.saveSettings(readObject(payload).settings))

    handle('alarms:list', () => alarms.list())
    handle('alarms:get-active', () => alarms.getActive())
    handle('alarms:create', (payload) => alarms.create(readObject(payload).input))
    handle('alarms:cancel', (payload) => alarms.cancel(readString(payload, 'id')))
    handle('alarms:stop-sound', () => alarms.stopSound())
    handle('media:get-current', () => browser.currentMedia())
    handle('media:control', (payload) => browser.controlCurrentMedia(readString(payload, 'action') as 'toggle-play-pause' | 'next' | 'previous'))

    handle('browser:create-tab', (payload) => {
      const obj = readObject(payload)
      return browser.createTab(readString(payload, 'id'), readString(payload, 'url'), readBounds(obj.bounds), { incognito: Boolean(obj.incognito) })
    })
    handle('browser:activate-tab', (payload) => browser.activateTab(readString(payload, 'id'), Boolean(readObject(payload).visible)))
    handle('browser:close-tab', (payload) => browser.closeTab(readString(payload, 'id')))
    handle('browser:navigate', (payload) => browser.navigate(readString(payload, 'id'), readString(payload, 'url')))
    handle('browser:stop', (payload) => browser.stop(readString(payload, 'id')))
    handle('browser:reload', (payload) => browser.reload(readString(payload, 'id')))
    handle('browser:back', (payload) => browser.back(readString(payload, 'id')))
    handle('browser:forward', (payload) => browser.forward(readString(payload, 'id')))
    handle('browser:set-visible', (payload) => browser.setVisible(Boolean(readObject(payload).visible)))
    handle('browser:deactivate', () => browser.deactivate())
    handle('browser:set-bounds', (payload) => browser.setBounds(readString(payload, 'id'), readBounds(readObject(payload).bounds)))
    handle('browser:set-zoom', (payload) => browser.setZoomFactor(readString(payload, 'id'), readNumber(payload, 'factor')))
    handle('browser:capture-page', (payload) => browser.capturePage(readString(payload, 'id')))
    handle('browser:sync-metadata', () => browser.syncMetadata())
    handle('browser:toggle-media', (payload) => browser.toggleMedia(readString(payload, 'id')))
    handle('browser:media-control', (payload) => browser.controlMedia(readString(payload, 'id'), readString(payload, 'action') as 'toggle-play' | 'next' | 'previous' | 'toggle-mute'))
    handle('browser:media-volume', (payload) => browser.setMediaVolume(readString(payload, 'id'), readNumber(payload, 'volume')))
    handle('browser:set-theme', (payload) => {
      const theme = readTheme(payload)
      windows.setTheme(theme)
      return browser.setTheme(theme)
    })
    handle('browser:debug-snapshot', () => browser.getDebugSnapshot())
    handle('browser:get-session', () => browser.getSession())
    handle('browser:save-session', (payload) => browser.saveSession(readObject(payload) as unknown as BrowserSessionSnapshot))
    handle('browser:duplicate-tab', (payload) => browser.duplicateTab(readString(payload, 'id'), readString(payload, 'newId'), readBounds(readObject(payload).bounds)))
    handle('browser:set-pinned', (payload) => browser.setPinned(readString(payload, 'id'), Boolean(readObject(payload).pinned)))
    handle('browser:set-muted', (payload) => browser.setMuted(readString(payload, 'id'), Boolean(readObject(payload).muted)))
    handle('browser:show-tab-menu', (payload) => browser.showTabMenu(readString(payload, 'id')))
    handle('browser:list-history', (payload) => browser.listHistory(readObject(payload).limit as number | undefined))
    handle('browser:clear-history', () => browser.clearHistory())
    handle('browser:list-downloads', () => browser.listDownloads())
    handle('browser:open-download', (payload) => browser.openDownload(readString(payload, 'id')))
    handle('browser:show-download', (payload) => browser.showDownload(readString(payload, 'id')))
    handle('browser:cancel-download', (payload) => browser.cancelDownload(readString(payload, 'id')))
    handle('browser:remove-download', (payload) => browser.removeDownload(readString(payload, 'id')))
    handle('browser:list-permissions', () => browser.listPermissions())
    handle('browser:set-permission', (payload) => browser.setPermission(readObject(payload) as unknown as PermissionSetInput))
    handle('browser:clear-permission', (payload) => {
      const item = readObject(payload)
      return browser.clearPermission(item.origin as string | undefined, item.permission as string | undefined)
    })

    handle('youtube-music:control', (payload) => browser.youtubeControl(readString(payload, 'action') as 'toggle-play' | 'next' | 'previous' | 'toggle-mute'))
    handle('youtube-music:set-volume', (payload) => browser.youtubeSetVolume(readNumber(payload, 'volume')))
    handle('youtube-music:sync-state', () => browser.youtubeSyncState())

    handle('notes:list', () => content.listNotes())
    handle('notes:save', (payload) => {
      const item = readObject(payload)
      return content.saveNote(readString(item, 'content'), item.id as string | undefined, item.pinned as boolean | undefined)
    })
    handle('notes:delete', (payload) => content.deleteNote(readString(payload, 'id')))
    handle('notes:toggle-pin', (payload) => content.toggleNotePin(readString(payload, 'id')))
    handle('transfers:list', () => content.listTransfers())
    handle('transfers:open', (payload) => content.openTransfer(readString(payload, 'path')))
    handle('transfers:show-in-folder', (payload) => content.showTransfer(readString(payload, 'path')))
    handle('transfers:delete', (payload) => content.deleteTransfer(readString(payload, 'id')))
    handle('transfers:clear', () => content.clearTransfers())
    handle('mobile:get-connection-info', () => localSend.getConnectionInfo())

    handle('localsend:get-status', () => localSend.getStatus())
    handle('localsend:get-devices', () => localSend.getDevices())
    handle('localsend:scan-network', () => localSend.scanNetwork())
    handle('localsend:send-text', (payload) => localSend.sendText(readString(payload, 'targetIp'), readNumber(payload, 'targetPort'), readString(payload, 'text')))
    handle('localsend:send-file', (payload) => localSend.sendFile(readString(payload, 'targetIp'), readNumber(payload, 'targetPort'), readString(payload, 'filePath')))
    handle('localsend:send-cloud-file', (payload) => localSend.sendCloudFile(readString(payload, 'filePath'), readString(payload, 'controllerId')))
    handle('localsend:get-received-files', () => localSend.getReceivedFiles())
    handle('localsend:open-download-folder', () => localSend.openDownloadFolder())
    handle('localsend:set-auto-accept', (payload) => localSend.setAutoAccept(Boolean(readObject(payload).enabled)))
    handle('localsend:add-manual-device', (payload) => {
      const item = readObject(payload)
      return localSend.addManualDevice(readString(item, 'targetIp'), (item.targetPort as number | undefined) || localSend.port)
    })
    handle('remote-desktop:get-status', () => remoteDesktop.getStatus())
    handle('remote-desktop:set-enabled', (payload) => {
      const enabled = Boolean(readObject(payload).enabled)
      const settings = system.getSettings()
      if (settings) system.saveSettings({ ...settings, remoteDesktopEnabled: enabled, lastSavedAt: Date.now() })
      return remoteDesktop.setEnabled(enabled)
    })
    handle('remote-desktop:stop-session', () => remoteDesktop.stopSession())
    handle('remote-desktop:list-trusted-devices', () => localSend.listTrustedDevices())
    handle('remote-desktop:revoke-trusted-device', (payload) => localSend.revokeTrustedDevice(readString(payload, 'id')))
    handle('remote-desktop:revoke-all-trusted-devices', () => localSend.revokeAllTrustedDevices())

    handle('vault:select-folder', () => content.selectVaultFolder())
    handle('vault:get-default-path', () => content.getDefaultVaultPath())
    handle('vault:list-entries', (payload) => content.listVaultEntries(readString(payload, 'vaultPath')))
    handle('vault:read-file', (payload) => content.readVaultFile(readString(payload, 'vaultPath'), readString(payload, 'relPath')))
    handle('vault:write-file', (payload) => content.writeVaultFile(readString(payload, 'vaultPath'), readString(payload, 'relPath'), readString(payload, 'content')))
    handle('vault:create-file', (payload) => {
      const item = readObject(payload)
      return content.createVaultFile(readString(item, 'vaultPath'), readString(item, 'relPath'), item.initialContent as string | undefined)
    })
    handle('vault:create-folder', (payload) => content.createVaultFolder(readString(payload, 'vaultPath'), readString(payload, 'relPath')))
    handle('vault:rename-entry', (payload) => content.renameVaultEntry(readString(payload, 'vaultPath'), readString(payload, 'oldRelPath'), readString(payload, 'newRelPath')))
    handle('vault:delete-entry', (payload) => content.deleteVaultEntry(readString(payload, 'vaultPath'), readString(payload, 'relPath')))
    handle('vault:reveal-in-explorer', (payload) => {
      const item = readObject(payload)
      return content.revealVaultEntry(readString(item, 'vaultPath'), item.relPath as string | undefined)
    })
    handle('vault:start-watcher', (payload) => content.startWatcher(readString(payload, 'vaultPath'), (event) => send('vault:fs-change', event)))
    handle('vault:stop-watcher', () => content.stopWatcher())
    handle('vault:set-window-mode', (payload) => content.setWindowMode(readString(payload, 'mode') as 'notes' | 'compact'))

    handle('notifications:get-history', () => notifications?.getHistory() || [])
    handle('notifications:clear-history', () => { notifications?.clearHistory(); return true })
    handle('notifications:get-status', () => notifications?.getStatus() || { running: false, accessGranted: false, historyCount: 0 })
    handle('notifications:test', (payload) => {
      const obj = payload && typeof payload === 'object' ? payload as any : {}
      const title = typeof obj.title === 'string' && obj.title ? obj.title : 'Omni Test Bildirimi'
      const body = typeof obj.body === 'string' && obj.body ? obj.body : 'Bilgisayarınızdan telefonunuza iletildi!'
      return notifications?.sendTestNotification(title, body)
    })

    handle('ai:get-state', () => aiStore.getSnapshot())
    handle('ai:get-messages', (payload) => aiStore.listMessages(readString(payload, 'conversationId')))
    handle('ai:create-conversation', (payload) => {
      const item = readObject(payload)
      return aiStore.createConversation(item.providerId as AiProviderId | undefined, item.model as string | undefined)
    })
    handle('ai:delete-conversation', (payload) => aiStore.deleteConversation(readString(payload, 'conversationId')))
    handle('ai:set-provider', (payload) => aiStore.setProvider(readObject(payload) as unknown as AiProviderConfigInput))
    handle('ai:send-message', (payload) => aiStore.sendMessage(readObject(payload) as unknown as AiSendInput))
    handle('ai:clear-cache', () => aiStore.clearCache())

    handle('librechat:activate', async (payload) => {
      const item = readObject(payload)
      const url = libreChatServer.getUrl() || await libreChatServer.start()
      await libreChatView.activate(url, readBounds(item.bounds))
      return { url }
    })
    handle('librechat:set-bounds', (payload) => libreChatView?.setBounds(readBounds(readObject(payload).bounds)))
    handle('librechat:deactivate', () => libreChatView?.deactivate())
  }

  function send(event: string, payload: unknown) {
    const window = windows?.getMainWindow()
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
    window.webContents.send(event, payload)
  }

  function assertMainSender(event: IpcMainInvokeEvent, mainWebContents: WebContents) {
    if (event.sender !== mainWebContents) throw new Error('Bu IPC çağrısı ana uygulama renderer\'ına ait değil.')
  }

  function readObject(value: unknown): Record<string, any> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Geçersiz IPC verisi.')
    return value as Record<string, any>
  }

  function readString(value: unknown, key: string) {
    const result = readObject(value)[key]
    if (typeof result !== 'string' || !result.trim()) throw new Error('Geçersiz IPC alanı: ' + key)
    return result.trim()
  }

  function readNumber(value: unknown, key: string) {
    const result = readObject(value)[key]
    if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error('Geçersiz IPC alanı: ' + key)
    return result
  }

  function readTimerAction(value: unknown) {
    const action = readString(value, 'action')
    if (action !== 'shutdown' && action !== 'restart') throw new Error('Geçersiz Windows işlemi seçildi.')
    return action as 'shutdown' | 'restart'
  }

  function readTheme(value: unknown): 'light' | 'dark' {
    const theme = readString(value, 'theme')
    if (theme !== 'light' && theme !== 'dark') throw new Error('Geçersiz tema.')
    return theme
  }

  function readBounds(value: unknown): BrowserBounds {
    const bounds = readObject(value)
    const result = { x: Number(bounds.x), y: Number(bounds.y), width: Number(bounds.width), height: Number(bounds.height) }
    if (!Object.values(result).every(Number.isFinite)) throw new Error('Geçersiz tarayıcı alanı.')
    return result
  }
}
