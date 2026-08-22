import { BrowserView, session, type BrowserWindow } from 'electron'
import type { BrowserBounds } from '../shared/contracts.js'

const ZERO_BOUNDS = { x: 0, y: 0, width: 1, height: 1 }

/** Native presentation surface for the official LibreChat client. */
export class LibreChatView {
  private readonly window: BrowserWindow
  private view: BrowserView | null = null
  private attached = false
  private bounds: BrowserBounds = ZERO_BOUNDS

  constructor(window: BrowserWindow) {
    this.window = window
  }

  async activate(url: string, bounds: BrowserBounds) {
    if (!/^https?:\/\//i.test(url)) throw new Error('LibreChat yerel adresi geçersiz.')
    const baseUrl = url.replace(/\/+$/, '')
    this.bounds = normalizeBounds(bounds)
    if (!this.view) {
      this.view = new BrowserView({
        webPreferences: {
          session: session.fromPartition('persist:kapanis-librechat'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webviewTag: false,
          spellcheck: true,
        },
      })
      // LibreChat's embedded shell is light on first load. A white native
      // surface prevents the empty conversation pane from flashing black
      // while the client mounts its landing route.
      this.view.setBackgroundColor('#ffffff')
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
    }
    this.view.setBounds(this.bounds)
    this.window.setTopBrowserView(this.view)
  }

  setBounds(bounds: BrowserBounds) {
    this.bounds = normalizeBounds(bounds)
    this.view?.setBounds(this.bounds)
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
