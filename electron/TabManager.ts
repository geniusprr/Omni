import {
  BrowserWindow,
  Menu,
  WebContentsView,
  type WebContents,
} from 'electron'
import type {
  BrowserBounds,
  BrowserTabProjection,
} from '../shared/contracts.js'
import { SessionManager } from './SessionManager.js'

interface TabRecord {
  id: string
  view: WebContentsView
  webContents: WebContents
  projection: BrowserTabProjection
  removeListeners: () => void
}

interface TabManagerCallbacks {
  onProjection: (projection: BrowserTabProjection) => void
  onDestroyed: (projection: BrowserTabProjection) => void
  onOpenRequest: (url: string, sourceTabId: string | null) => void
  onHistory: (projection: BrowserTabProjection) => void
  onRendererFailure: (projection: BrowserTabProjection, reason: string) => void
  onFullscreen: (tabId: string, fullscreen: boolean) => void
  onContextMenu: (tabId: string, params: unknown) => void
  onBeforeClose: (tabId: string, webContents: WebContents) => void | Promise<void>
}

const MAX_BOUNDS = 20_000

export class TabManager {
  private readonly records = new Map<string, TabRecord>()
  private readonly closing = new Set<string>()
  private readonly window: BrowserWindow
  private readonly sessions: SessionManager
  private readonly callbacks: TabManagerCallbacks
  private theme: 'light' | 'dark' = 'light'

  constructor(window: BrowserWindow, sessions: SessionManager, callbacks: TabManagerCallbacks) {
    this.window = window
    this.sessions = sessions
    this.callbacks = callbacks
  }

  static validateId(id: string) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('Geçersiz sekme kimliği.')
  }

  static parseUrl(value: string) {
    let url: URL
    try { url = new URL(value.trim()) } catch { throw new Error('Geçerli bir web adresi girin.') }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Tarayıcı yalnızca http ve https adreslerini açabilir.')
    return url.toString()
  }

  create(id: string, rawUrl: string, bounds: BrowserBounds) {
    TabManager.validateId(id)
    const url = TabManager.parseUrl(rawUrl)
    validateBounds(bounds)
    const existing = this.records.get(id)
    if (existing) return { ...existing.projection }

    const restored = this.sessions.getSnapshot().tabs.find((tab) => tab.id === id)
    const view = new WebContentsView({
      webPreferences: {
        session: this.sessions.getBrowserSession(),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webviewTag: false,
        spellcheck: true,
      },
    })
    const webContents = view.webContents
    const projection: BrowserTabProjection = {
      id,
      url,
      title: restored?.title || hostname(url),
      favicon: restored?.favicon || domainFavicon(url),
      loading: true,
      canGoBack: false,
      canGoForward: false,
      error: null,
      label: `browser-${id}`,
      muted: restored?.muted === true,
      pinned: restored?.pinned === true,
    }
    const record: TabRecord = {
      id,
      view,
      webContents,
      projection,
      removeListeners: () => undefined,
    }
    ;(webContents as WebContents & { kapanisTabId?: string }).kapanisTabId = id
    record.removeListeners = this.bindEvents(record)
    this.records.set(id, record)
    this.window.contentView.addChildView(view)
    view.setBounds(bounds)
    view.setVisible(false)
    if (projection.muted) webContents.setAudioMuted(true)
    void webContents.loadURL(url).catch((error) => {
      if (this.closing.has(id)) return
      this.update(id, { loading: false, error: error instanceof Error ? error.message : 'Sayfa açılamadı.' })
    })
    this.callbacks.onProjection({ ...projection })
    return { ...projection }
  }

  get(id: string) {
    return this.records.get(id) ?? null
  }

  list() {
    return [...this.records.values()].map((record) => ({ ...record.projection }))
  }

  activate(id: string, visible: boolean) {
    const target = this.require(id)
    for (const [otherId, record] of this.records) {
      record.view.setVisible(visible && otherId === id)
    }
    target.view.setVisible(visible)
    if (visible) target.webContents.focus()
  }

  setVisible(visible: boolean, activeId: string | null) {
    for (const [id, record] of this.records) record.view.setVisible(visible && id === activeId)
  }

  deactivate() {
    for (const record of this.records.values()) record.view.setVisible(false)
  }

  navigate(id: string, rawUrl: string) {
    const url = TabManager.parseUrl(rawUrl)
    const record = this.require(id)
    record.projection.url = url
    record.projection.title = hostname(url)
    record.projection.favicon = domainFavicon(url)
    record.projection.loading = true
    record.projection.error = null
    this.emit(record)
    void record.webContents.loadURL(url).catch((error) => {
      if (this.closing.has(id)) return
      this.update(id, { loading: false, error: error instanceof Error ? error.message : 'Sayfa açılamadı.' })
    })
  }

  reload(id: string) {
    const record = this.require(id)
    record.projection.loading = true
    record.projection.error = null
    this.emit(record)
    record.webContents.reload()
  }

  back(id: string) {
    const record = this.require(id)
    if (safeCanGoBack(record.webContents)) record.webContents.navigationHistory.goBack()
  }

  forward(id: string) {
    const record = this.require(id)
    if (safeCanGoForward(record.webContents)) record.webContents.navigationHistory.goForward()
  }

  clearNavigationHistory() {
    for (const record of this.records.values()) {
      try {
        record.webContents.navigationHistory.clear()
        this.update(record.id, {
          canGoBack: false,
          canGoForward: false,
        })
      } catch {
        // A tab can be destroyed while the history is being cleared.
      }
    }
  }

  setBounds(id: string, bounds: BrowserBounds) {
    validateBounds(bounds)
    this.require(id).view.setBounds(bounds)
  }

  setTheme(theme: 'light' | 'dark') {
    this.theme = theme
    for (const record of this.records.values()) this.applyTheme(record)
  }

  setPinned(id: string, pinned: boolean) {
    const record = this.require(id)
    record.projection.pinned = pinned
    this.emit(record)
  }

  setMuted(id: string, muted: boolean) {
    const record = this.require(id)
    record.projection.muted = muted
    record.webContents.setAudioMuted(muted)
    this.emit(record)
  }

  duplicate(id: string, newId: string, bounds: BrowserBounds) {
    const record = this.require(id)
    const url = record.webContents.getURL() || record.projection.url
    const projection = this.create(newId, url, bounds)
    const duplicate = this.records.get(newId)
    if (duplicate) {
      duplicate.projection.pinned = record.projection.pinned
      duplicate.projection.muted = record.projection.muted
      if (duplicate.projection.muted) duplicate.webContents.setAudioMuted(true)
      this.emit(duplicate)
    }
    return { ...projection, pinned: record.projection.pinned, muted: record.projection.muted }
  }

  showTabMenu(id: string) {
    const record = this.require(id)
    const menu = Menu.buildFromTemplate([
      {
        label: record.projection.pinned ? 'Sabitlemeyi kaldır' : 'Sekmeyi sabitle',
        click: () => this.setPinned(id, !record.projection.pinned),
      },
      {
        label: record.projection.muted ? 'Sekme sesini aç' : 'Sekmeyi sessize al',
        click: () => this.setMuted(id, !record.projection.muted),
      },
      { type: 'separator' },
      { label: 'Sekmeyi çoğalt', click: () => this.callbacks.onOpenRequest(record.projection.url, id) },
      { label: 'Yenile', click: () => this.reload(id) },
      { label: 'Sekmeyi kapat', click: () => this.close(id) },
    ])
    menu.popup({ window: this.window })
  }

  async close(id: string) {
    TabManager.validateId(id)
    if (this.closing.has(id)) return true
    const record = this.records.get(id)
    if (!record) return true
    this.closing.add(id)
    this.records.delete(id)
    try {
      record.view.setVisible(false)
      this.window.contentView.removeChildView(record.view)
    } catch { /* the view may already have been detached */ }
    try {
      await this.callbacks.onBeforeClose(id, record.webContents)
    } catch (error) {
      console.error(`[browser] tab cleanup failed for ${id}`, error)
    }
    record.removeListeners()
    // `WebContentsView` does not own the renderer lifecycle. Explicitly close
    // it after detaching the view so a closed tab cannot keep audio or a process.
    try { record.webContents.removeAllListeners() } catch { /* best effort */ }
    try { record.webContents.close({ waitForBeforeUnload: false }) } catch { /* best effort */ }
    try {
      if (!record.webContents.isDestroyed()) (record.webContents as WebContents & { destroy?: () => void }).destroy?.()
    } catch { /* best effort */ }
    this.closing.delete(id)
    this.callbacks.onDestroyed({ ...record.projection, loading: false })
    return true
  }

  async closeAll() {
    for (const id of [...this.records.keys()]) await this.close(id)
    this.records.clear()
    this.closing.clear()
  }

  snapshot() {
    return {
      openTabIds: [...this.records.keys()],
      webContentsIds: [...this.records.values()].map((record) => record.webContents.id),
      activeId: null,
      mediaIds: [],
      closingIds: [...this.closing],
      listenerCount: [...this.records.values()].reduce((total, record) => total + record.webContents.listenerCount('did-navigate'), 0),
    }
  }

  private bindEvents(record: TabRecord) {
    const { id, webContents } = record
    const onStart = () => this.update(id, { loading: true, error: null })
    const onDomReady = () => this.applyTheme(record)
    const onStop = () => {
      const currentUrl = webContents.getURL() || record.projection.url
      this.update(id, {
        url: currentUrl,
        loading: false,
        canGoBack: safeCanGoBack(webContents),
        canGoForward: safeCanGoForward(webContents),
      })
      this.callbacks.onHistory({ ...record.projection })
    }
    const onNavigate = (_event: Electron.Event, url: string) => {
      this.update(id, {
        url,
        title: webContents.getTitle() || hostname(url),
        favicon: record.projection.favicon || domainFavicon(url),
        loading: false,
        error: null,
        canGoBack: safeCanGoBack(webContents),
        canGoForward: safeCanGoForward(webContents),
      })
      this.callbacks.onHistory({ ...record.projection })
    }
    const onInPageNavigate = (_event: Electron.Event, url: string) => {
      this.update(id, { url, canGoBack: safeCanGoBack(webContents), canGoForward: safeCanGoForward(webContents) })
    }
    const onTitle = (_event: Electron.Event, title: string) => this.update(id, { title: title || hostname(record.projection.url) })
    const onFavicon = (_event: Electron.Event, favicons: string[]) => {
      const favicon = favicons.find((value) => /^(?:https?:|data:image\/|blob:)/i.test(value)) || record.projection.favicon
      this.update(id, { favicon })
    }
    const onFail = (_event: Electron.Event, errorCode: number, description: string, validatedUrl: string, isMainFrame: boolean) => {
      if (!isMainFrame || errorCode === -3 || this.closing.has(id)) return
      const message = description || `Sayfa yüklenemedi (${errorCode}).`
      const projection = this.update(id, { url: validatedUrl || record.projection.url, loading: false, error: message })
      if (projection) this.callbacks.onRendererFailure(projection, message)
    }
    const onGone = (_event: Electron.Event, details: { reason?: string; exitCode?: number }) => {
      if (this.closing.has(id)) return
      const reason = `Sekme renderer'ı sonlandı (${details.reason || 'unknown'}${typeof details.exitCode === 'number' ? `, ${details.exitCode}` : ''}).`
      const projection = this.update(id, { loading: false, error: 'Sekme çöktü. Yenilemek için tekrar deneyin.' })
      if (projection) this.callbacks.onRendererFailure(projection, reason)
    }
    const onUnresponsive = () => {
      const projection = this.update(id, { loading: false, error: 'Sekme yanıt vermiyor. Yeniden yükleyin veya kapatın.' })
      if (projection) this.callbacks.onRendererFailure(projection, 'Sekme yanıt vermiyor.')
    }
    const onResponsive = () => {
      if (record.projection.error?.includes('yanıt vermiyor')) this.update(id, { error: null })
    }
    const onDestroyed = () => {
      if (this.closing.has(id)) return
      this.records.delete(id)
      try {
        record.view.setVisible(false)
        this.window.contentView.removeChildView(record.view)
      } catch { /* the renderer may already have detached the view */ }
      record.removeListeners()
      try { webContents.removeAllListeners() } catch { /* best effort */ }
      this.callbacks.onDestroyed({ ...record.projection, loading: false })
    }
    const onWillNavigate = (event: Electron.Event, url: string) => {
      if (isAllowedWebUrl(url)) return
      event.preventDefault()
      void this.callbacks.onOpenRequest(url, id)
    }
    const onWindowOpen = ({ url }: { url: string }) => {
      if (isAllowedWebUrl(url)) this.callbacks.onOpenRequest(url, id)
      else void this.callbacks.onOpenRequest(url, id)
      return { action: 'deny' as const }
    }
    const onContextMenu = (_event: Electron.Event, params: unknown) => this.callbacks.onContextMenu(id, params)
    const onEnterFullscreen = () => this.callbacks.onFullscreen(id, true)
    const onLeaveFullscreen = () => this.callbacks.onFullscreen(id, false)
    webContents.on('did-start-loading', onStart)
    webContents.on('dom-ready', onDomReady)
    webContents.on('did-stop-loading', onStop)
    webContents.on('did-navigate', onNavigate)
    webContents.on('did-navigate-in-page', onInPageNavigate)
    webContents.on('page-title-updated', onTitle)
    webContents.on('page-favicon-updated', onFavicon)
    webContents.on('did-fail-load', onFail)
    webContents.on('did-fail-provisional-load', onFail)
    webContents.on('render-process-gone', onGone)
    webContents.on('unresponsive', onUnresponsive)
    webContents.on('responsive', onResponsive)
    webContents.on('destroyed', onDestroyed)
    webContents.on('will-navigate', onWillNavigate)
    webContents.setWindowOpenHandler(onWindowOpen)
    webContents.on('context-menu', onContextMenu)
    webContents.on('enter-html-full-screen', onEnterFullscreen)
    webContents.on('leave-html-full-screen', onLeaveFullscreen)
    return () => {
      webContents.removeListener('did-start-loading', onStart)
      webContents.removeListener('dom-ready', onDomReady)
      webContents.removeListener('did-stop-loading', onStop)
      webContents.removeListener('did-navigate', onNavigate)
      webContents.removeListener('did-navigate-in-page', onInPageNavigate)
      webContents.removeListener('page-title-updated', onTitle)
      webContents.removeListener('page-favicon-updated', onFavicon)
      webContents.removeListener('did-fail-load', onFail)
      webContents.removeListener('did-fail-provisional-load', onFail)
      webContents.removeListener('render-process-gone', onGone)
      webContents.removeListener('unresponsive', onUnresponsive)
      webContents.removeListener('responsive', onResponsive)
      webContents.removeListener('destroyed', onDestroyed)
      webContents.removeListener('will-navigate', onWillNavigate)
      webContents.removeListener('context-menu', onContextMenu)
      webContents.removeListener('enter-html-full-screen', onEnterFullscreen)
      webContents.removeListener('leave-html-full-screen', onLeaveFullscreen)
    }
  }

  private update(id: string, patch: Partial<BrowserTabProjection>) {
    const record = this.records.get(id)
    if (!record || this.closing.has(id)) return null
    record.projection = { ...record.projection, ...patch }
    this.emit(record)
    return { ...record.projection }
  }

  private applyTheme(record: TabRecord) {
    if (record.webContents.isDestroyed()) return
    const value = JSON.stringify(this.theme)
    void record.webContents.executeJavaScript(
      `document.documentElement.style.setProperty('color-scheme', ${value}, 'important')`,
      true,
    ).catch(() => undefined)
  }

  private emit(record: TabRecord) {
    this.callbacks.onProjection({ ...record.projection })
  }

  private require(id: string) {
    TabManager.validateId(id)
    const record = this.records.get(id)
    if (!record) throw new Error('Tarayıcı sekmesi bulunamadı.')
    return record
  }
}

function validateBounds(bounds: BrowserBounds) {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    || bounds.x < 0 || bounds.y < 0
    || bounds.width < 1 || bounds.height < 1
    || bounds.width > MAX_BOUNDS || bounds.height > MAX_BOUNDS) {
    throw new Error('Geçersiz tarayıcı alanı.')
  }
}

function safeCanGoBack(webContents: WebContents) {
  try { return webContents.navigationHistory.canGoBack() } catch { return false }
}

function safeCanGoForward(webContents: WebContents) {
  try { return webContents.navigationHistory.canGoForward() } catch { return false }
}

function isAllowedWebUrl(value: string) {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !/[\s\u0000-\u001f]/.test(value)
  } catch {
    return false
  }
}

function domainFavicon(value: string) {
  try {
    const url = new URL(value)
    return `${url.origin}/favicon.ico`
  } catch {
    return null
  }
}

function hostname(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, '') } catch { return value }
}
