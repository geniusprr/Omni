import {
  BrowserWindow,
  Menu,
  clipboard,
  shell,
  type WebContents,
} from 'electron'
import {
  BROWSER_EVENTS,
  type BrowserBounds,
  type BrowserPermissionRequest,
  type BrowserSessionSnapshot,
  type BrowserTabProjection,
  type PermissionSetInput,
} from '../shared/contracts.js'
import { DownloadManager } from './DownloadManager.js'
import { MediaManager } from './MediaManager.js'
import { PermissionManager } from './PermissionManager.js'
import { SessionManager } from './SessionManager.js'
import { TabManager } from './TabManager.js'
import { WindowManager } from './WindowManager.js'

const WEB_PROTOCOLS = new Set(['http:', 'https:'])
const EXTERNAL_PROTOCOLS = new Set(['mailto:', 'tel:'])

export class BrowserManager {
  readonly sessions: SessionManager
  readonly permissions: PermissionManager
  readonly downloads: DownloadManager
  readonly media: MediaManager
  readonly tabs: TabManager
  private readonly windows: WindowManager
  private activeId: string | null = null

  constructor(windows: WindowManager, mainWindow: BrowserWindow) {
    this.windows = windows
    this.sessions = new SessionManager()
    this.permissions = new PermissionManager(this.sessions.dataDir)
    this.downloads = new DownloadManager(this.sessions.dataDir)
    this.media = new MediaManager((projection) => {
      this.send(BROWSER_EVENTS.mediaUpdated, projection)
      const tab = this.tabs.get(projection.tabId)
      if (tab) this.send(BROWSER_EVENTS.tabUpdated, tab.projection)
    })
    this.tabs = new TabManager(mainWindow, this.sessions, {
      onProjection: (projection) => this.onProjection(projection),
      onDestroyed: (projection) => this.onDestroyed(projection),
      onOpenRequest: (url, sourceTabId) => this.onOpenRequest(url, sourceTabId),
      onHistory: (projection) => this.onHistory(projection),
      onRendererFailure: (projection, reason) => this.send(BROWSER_EVENTS.rendererFailed, { projection, reason }),
      onFullscreen: (tabId, fullscreen) => {
        if (fullscreen) this.windows.setFullscreen(true)
        else this.windows.setFullscreen(false)
        this.send(BROWSER_EVENTS.fullscreenChanged, { tabId, fullscreen })
      },
      onContextMenu: (tabId, params) => this.showPageContextMenu(tabId, params),
      onBeforeClose: async (tabId, webContents) => {
        try { webContents.setAudioMuted(true) } catch { /* best effort */ }
        await Promise.race([
          this.media.stop(tabId),
          new Promise<void>((resolve) => setTimeout(resolve, 750)),
        ])
        this.media.unregister(tabId)
      },
    })
    const browserSession = this.sessions.getBrowserSession()
    this.permissions.attach(browserSession, (request) => this.send(BROWSER_EVENTS.permissionRequest, request))
    this.downloads.attach(browserSession, (webContents) => this.tabIdFor(webContents), (item) => this.send(BROWSER_EVENTS.downloadUpdated, item))
  }

  createTab(id: string, url: string, bounds: BrowserBounds, options?: { incognito?: boolean }) {
    const projection = this.tabs.create(id, url, bounds, options)
    this.media.register(id, this.tabs.get(id)?.webContents as WebContents)
    return projection
  }

  activateTab(id: string, visible: boolean) {
    this.activeId = id
    this.tabs.activate(id, visible)
  }

  async closeTab(id: string) {
    const closed = await this.tabs.close(id)
    if (this.activeId === id) this.activeId = null
    return closed
  }

  navigate(id: string, url: string) {
    this.tabs.navigate(id, url)
  }

  reload(id: string) { this.tabs.reload(id) }
  back(id: string) { this.tabs.back(id) }
  forward(id: string) { this.tabs.forward(id) }

  setVisible(visible: boolean) {
    this.tabs.setVisible(visible, this.activeId)
  }

  deactivate() {
    this.tabs.deactivate()
    this.activeId = null
  }

  setBounds(id: string, bounds: BrowserBounds) { this.tabs.setBounds(id, bounds) }

  async syncMetadata() { await this.media.syncAll() }

  async toggleMedia(id: string) { await this.media.toggle(id) }
  async controlMedia(id: string, action: 'toggle-play' | 'next' | 'previous' | 'toggle-mute') {
    await this.media.control(id, action)
  }
  async setMediaVolume(id: string, volume: number) { await this.media.setVolume(id, volume) }

  setTheme(theme: 'light' | 'dark') { this.tabs.setTheme(theme) }

  getDebugSnapshot() {
    const snapshot = this.tabs.snapshot()
    return {
      ...snapshot,
      activeId: this.activeId,
      mediaIds: this.media.snapshot().map((item) => item.tabId),
    }
  }

  getSession() { return this.sessions.getSnapshot() }
  saveSession(snapshot: BrowserSessionSnapshot) {
    this.sessions.saveSnapshot(snapshot)
  }

  duplicateTab(id: string, newId: string, bounds: BrowserBounds) {
    const projection = this.tabs.duplicate(id, newId, bounds)
    this.media.register(newId, this.tabs.get(newId)?.webContents as WebContents)
    return projection
  }

  setPinned(id: string, pinned: boolean) { this.tabs.setPinned(id, pinned) }
  setMuted(id: string, muted: boolean) { this.tabs.setMuted(id, muted) }
  showTabMenu(id: string) { this.tabs.showTabMenu(id) }

  listHistory(limit?: number) { return this.sessions.listHistory(limit) }
  clearHistory() {
    this.sessions.clearHistory()
    this.tabs.clearNavigationHistory()
    this.send(BROWSER_EVENTS.historyUpdated, null)
  }

  listDownloads() { return this.downloads.list() }
  openDownload(id: string) { return this.downloads.open(id) }
  showDownload(id: string) { this.downloads.showInFolder(id) }
  cancelDownload(id: string) { return this.downloads.cancel(id) }
  removeDownload(id: string) { return this.downloads.remove(id) }

  listPermissions() { return this.permissions.list() }
  setPermission(input: PermissionSetInput) { this.permissions.setDecision(input) }
  clearPermission(origin?: string, permission?: string) { this.permissions.clear(origin, permission) }

  currentMedia() { return this.media.toSystemSession() }

  async controlCurrentMedia(action: 'toggle-play-pause' | 'next' | 'previous') {
    const current = this.media.current()
    if (!current) return false
    if (action === 'toggle-play-pause') await this.media.toggle(current.tabId)
    else await this.media.control(current.tabId, action)
    return true
  }

  async youtubeControl(action: 'toggle-play' | 'next' | 'previous' | 'toggle-mute') {
    const match = this.findYouTubeMusicTab()
    if (!match) throw new Error('YouTube Music sekmesi açık değil.')
    await this.media.control(match, action)
  }

  async youtubeSetVolume(volume: number) {
    const match = this.findYouTubeMusicTab()
    if (!match) throw new Error('YouTube Music sekmesi açık değil.')
    await this.media.setVolume(match, volume)
  }

  async youtubeSyncState() {
    const result = await this.media.getYouTubeMusicState()
    if (result) this.send('youtube-music-state', result.state)
    return result?.state ?? null
  }

  async destroyAll() {
    this.permissions.cancelPending()
    await this.tabs.closeAll()
    this.media.destroyAll()
    this.sessions.flush()
  }

  private onProjection(projection: BrowserTabProjection) {
    this.send(BROWSER_EVENTS.tabUpdated, projection)
    if (projection.incognito) return
    const snapshot = this.sessions.getSnapshot()
    const tab = snapshot.tabs.find((item) => item.id === projection.id)
    const nextTabs = tab
      ? snapshot.tabs.map((item) => item.id === projection.id
        ? { ...item, url: projection.url, title: projection.title, favicon: projection.favicon, pinned: projection.pinned === true, muted: projection.muted === true }
        : item)
      : [...snapshot.tabs, {
        id: projection.id,
        url: projection.url,
        title: projection.title,
        favicon: projection.favicon,
        pinned: projection.pinned === true,
        muted: projection.muted === true,
      }]
    this.sessions.saveSnapshot({ tabs: nextTabs, activeTabId: snapshot.activeTabId || projection.id })
  }

  private onDestroyed(projection: BrowserTabProjection) {
    this.media.unregister(projection.id)
    this.permissions.cancelForTab(projection.id)
    this.send(BROWSER_EVENTS.tabDestroyed, projection)
    if (projection.incognito) return
    const snapshot = this.sessions.getSnapshot()
    this.sessions.saveSnapshot({
      tabs: snapshot.tabs.filter((tab) => tab.id !== projection.id),
      activeTabId: snapshot.activeTabId === projection.id ? null : snapshot.activeTabId,
    })
  }

  private onHistory(projection: BrowserTabProjection) {
    this.sessions.addHistory({ url: projection.url, title: projection.title, favicon: projection.favicon })
    this.send(BROWSER_EVENTS.historyUpdated, this.sessions.listHistory(1)[0] ?? null)
  }

  private onOpenRequest(rawUrl: string, sourceTabId: string | null) {
    let url: URL
    try { url = new URL(rawUrl) } catch { return }
    if (WEB_PROTOCOLS.has(url.protocol)) {
      this.send(BROWSER_EVENTS.openRequest, { url: url.toString(), sourceTabId })
      return
    }
    if (EXTERNAL_PROTOCOLS.has(url.protocol)) {
      void shell.openExternal(url.toString()).catch((error) => console.error('[browser] external URL failed', error))
    }
  }

  private showPageContextMenu(tabId: string, rawParams: unknown) {
    const record = this.tabs.get(tabId)
    if (!record) return
    const params = (rawParams && typeof rawParams === 'object' ? rawParams : {}) as {
      linkURL?: string
      selectionText?: string
      isEditable?: boolean
      mediaType?: string
      srcURL?: string
      x?: number
      y?: number
    }
    const template: Electron.MenuItemConstructorOptions[] = [
      { label: 'Geri', enabled: record.webContents.navigationHistory.canGoBack(), click: () => this.back(tabId) },
      { label: 'İleri', enabled: record.webContents.navigationHistory.canGoForward(), click: () => this.forward(tabId) },
      { label: 'Yenile', click: () => this.reload(tabId) },
      { type: 'separator' },
    ]
    if (params.linkURL) {
      template.push({ label: 'Bağlantıyı yeni sekmede aç', click: () => this.onOpenRequest(params.linkURL || '', tabId) })
      template.push({ label: 'Bağlantıyı kopyala', click: () => clipboard.writeText(params.linkURL || '') })
    }
    if (params.selectionText) template.push({ label: 'Seçimi kopyala', click: () => clipboard.writeText(params.selectionText || '') })
    if (params.mediaType === 'Image' && params.srcURL) template.push({ label: 'Görsel adresini kopyala', click: () => clipboard.writeText(params.srcURL || '') })
    if (params.isEditable) {
      template.push({ type: 'separator' })
      template.push({ role: 'undo' }, { role: 'redo' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' })
    }
    template.push({ type: 'separator' }, {
      label: 'Geliştirici araçlarını aç',
      click: () => record.webContents.inspectElement(params.x || 0, params.y || 0),
    })
    Menu.buildFromTemplate(template).popup({ window: this.windows.getMainWindow() || undefined })
  }

  private findYouTubeMusicTab() {
    return this.tabs.list().find((tab) => /music\.youtube\.com/i.test(tab.url))?.id ?? null
  }

  private tabIdFor(webContents: WebContents) {
    return (webContents as WebContents & { kapanisTabId?: string }).kapanisTabId ?? null
  }

  private send(event: string, payload: unknown) {
    const window = this.windows.getMainWindow()
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
    window.webContents.send(event, payload)
  }
}
