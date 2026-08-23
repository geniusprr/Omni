import { BrowserView, session, type BrowserWindow } from 'electron'
import type { BrowserBounds } from '../shared/contracts.js'
import { buildLibreChatChromeScript, buildLibreChatSyncScript } from './LibreChatChrome.js'
import type { AgentToolActivity, OmniTheme } from './OmniAgent.js'

const ZERO_BOUNDS = { x: 0, y: 0, width: 1, height: 1 }
const LIBRECHAT_CORNER_RADIUS = 16

/** Native presentation surface for the official LibreChat client. */
export class LibreChatView {
  private readonly window: BrowserWindow
  private view: BrowserView | null = null
  private attached = false
  private bounds: BrowserBounds = ZERO_BOUNDS
  private sessionReady: Promise<void> | null = null
  private theme: OmniTheme = 'obsidian'
  private agentActivities: AgentToolActivity[] = []

  constructor(window: BrowserWindow) {
    this.window = window
  }

  async activate(url: string, bounds: BrowserBounds) {
    if (!/^https?:\/\//i.test(url)) throw new Error('LibreChat yerel adresi geçersiz.')
    const baseUrl = url.replace(/\/+$/, '')
    this.bounds = normalizeBounds(bounds)
    await this.prepareSession()
    if (!this.view) {
      const libreChatSession = session.fromPartition('persist:kapanis-librechat')
      this.view = new BrowserView({
        webPreferences: {
          session: libreChatSession,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webviewTag: false,
          spellcheck: true,
        },
      })
      // BrowserView is rectangular. Keep its backing surface transparent so
      // the clipped LibreChat document reveals the rounded host underneath.
      this.view.setBackgroundColor('#00000000')
      this.view.webContents.on('did-finish-load', () => { void this.installChrome() })
      this.view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    }
    this.view.setBounds(this.bounds)
    if (!this.attached) {
      this.window.addBrowserView(this.view)
      this.attached = true
      this.window.setTopBrowserView(this.view)
    }
    const currentUrl = this.view.webContents.getURL()
    // The root route renders the left navigation but leaves the conversation
    // pane in its uninitialised state. LibreChat's own New Chat action fixes
    // this by navigating to /c/new, so start there automatically while still
    // preserving an existing conversation when the user returns to the tab.
    if (shouldLoadNewChat(currentUrl, baseUrl)) {
      await this.view.webContents.loadURL(`${baseUrl}/c/new`)
    } else {
      await this.syncOmniChrome()
    }
    this.view.setBounds(this.bounds)
    this.window.setTopBrowserView(this.view)
  }

  setBounds(bounds: BrowserBounds) {
    this.bounds = normalizeBounds(bounds)
    this.view?.setBounds(this.bounds)
  }

  setTheme(theme: OmniTheme) {
    this.theme = theme
    void this.syncOmniChrome()
  }

  pushAgentActivity(activity: AgentToolActivity) {
    this.agentActivities = [activity, ...this.agentActivities.filter((item) => item.id !== activity.id)].slice(0, 8)
    void this.syncOmniChrome()
  }

  deactivate() {
    if (!this.view || !this.attached) return
    try { this.window.removeBrowserView(this.view) } catch { /* best effort */ }
    this.attached = false
  }

  destroy() {
    const view = this.view
    this.view = null
    if (!view) return
    try { this.window.removeBrowserView(view) } catch { /* best effort */ }
    try { view.webContents.close({ waitForBeforeUnload: false }) } catch { /* best effort */ }
    this.attached = false
  }

  private prepareSession() {
    if (this.sessionReady) return this.sessionReady
    const libreChatSession = session.fromPartition('persist:kapanis-librechat')
    this.sessionReady = Promise.all([
      libreChatSession.clearCache(),
      libreChatSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] }),
    ]).then(() => undefined).catch((error) => {
      console.warn('[librechat] Eski istemci önbelleği temizlenemedi', error)
    })
    return this.sessionReady
  }

  private async installChrome() {
    const view = this.view
    if (!view || view.webContents.isDestroyed()) return
    try {
      const result = await view.webContents.executeJavaScript(buildLibreChatChromeScript(this.theme, this.agentActivities, LIBRECHAT_CORNER_RADIUS), true) as { ok?: boolean; message?: string; stack?: string }
      if (!result?.ok) console.warn('[librechat] Pencere kontrolleri script hatası', result)
    } catch (error) {
      console.warn('[librechat] Pencere kontrolleri eklenemedi', error)
    }
  }

  private async syncOmniChrome() {
    const view = this.view
    if (!view || view.webContents.isDestroyed() || view.webContents.isLoadingMainFrame()) return
    try {
      await view.webContents.executeJavaScript(buildLibreChatSyncScript(this.theme, this.agentActivities), true)
    } catch {
      // did-finish-load installs the bridge after a navigation finishes.
    }
  }

}

function normalizeBounds(bounds: BrowserBounds): BrowserBounds {
  const x = Math.max(0, Math.round(Number(bounds.x)))
  const y = Math.max(0, Math.round(Number(bounds.y)))
  const width = Math.max(1, Math.round(Number(bounds.width)))
  const height = Math.max(1, Math.round(Number(bounds.height)))
  return { x, y, width, height }
}

function shouldLoadNewChat(currentUrl: string, baseUrl: string) {
  if (!currentUrl || currentUrl === 'about:blank') return true
  try {
    const current = new URL(currentUrl)
    const base = new URL(baseUrl)
    if (current.origin !== base.origin) return true
    return current.pathname === '/' || current.pathname === ''
  } catch {
    return true
  }
}
