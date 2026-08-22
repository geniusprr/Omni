import { BrowserView, session, type BrowserWindow } from 'electron'
import type { BrowserBounds } from '../shared/contracts.js'

const ZERO_BOUNDS = { x: 0, y: 0, width: 1, height: 1 }
const LIBRECHAT_CORNER_RADIUS = 16
const LIBRECHAT_CHROME_SCRIPT = `
(() => {
  const styleId = 'kapanis-librechat-window-style';
  const cornerRadius = '${LIBRECHAT_CORNER_RADIUS}px';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = \`
      html,
      body,
      #root {
        border-radius: \${cornerRadius} 0 0 0 !important;
        clip-path: inset(0 round \${cornerRadius} 0 0 0) !important;
        -webkit-clip-path: inset(0 round \${cornerRadius} 0 0 0) !important;
      }
      html,
      body {
        overflow: hidden !important;
      }
      #root {
        min-height: 100% !important;
        overflow: hidden !important;
      }
      #export-menu-button,
      [data-testid="share-conversation-menu-item"] {
        display: none !important;
      }
      [data-kapanis-titlebar="true"] {
        padding-right: max(114px, env(titlebar-area-width, 0px)) !important;
        -webkit-app-region: drag !important;
      }
      [data-kapanis-titlebar="true"] button,
      [data-kapanis-titlebar="true"] input,
      [data-kapanis-titlebar="true"] textarea,
      [data-kapanis-titlebar="true"] a,
      [data-kapanis-titlebar="true"] [role="button"] {
        -webkit-app-region: no-drag !important;
      }
    \`;
    document.head.appendChild(style);
  }

  const decorate = () => {
    document.querySelectorAll('#export-menu-button, [data-testid="share-conversation-menu-item"]').forEach((element) => {
      element.setAttribute('data-kapanis-share-hidden', 'true');
    });
    const candidates = document.querySelectorAll('header, [class*="h-[52px]"]');
    for (const element of candidates) {
      const rect = element.getBoundingClientRect();
      if (rect.top <= 8 && rect.height >= 44 && rect.height <= 60 && rect.width >= 280) {
        element.setAttribute('data-kapanis-titlebar', 'true');
      }
    }
  };

  decorate();
  if (!window.__kapanisLibreChatChromeObserver) {
    window.__kapanisLibreChatChromeObserver = new MutationObserver(decorate);
    window.__kapanisLibreChatChromeObserver.observe(document.body, { childList: true, subtree: true });
  }
  if (location.pathname === '/c/new' && !window.__kapanisLibreChatNewChatTimer) {
    let attempts = 0;
    window.__kapanisLibreChatNewChatTimer = window.setInterval(() => {
      if (document.querySelector('[data-testid="model-selector-button"]')) {
        clearInterval(window.__kapanisLibreChatNewChatTimer);
        window.__kapanisLibreChatNewChatTimer = 0;
        return;
      }
      const trigger = document.querySelector('[data-testid="nav-new-chat-fab"], [data-testid="header-new-chat-button"], [data-testid="new-chat-button"]');
      if (trigger instanceof HTMLElement) trigger.click();
      attempts += 1;
      if (attempts >= 8) {
        clearInterval(window.__kapanisLibreChatNewChatTimer);
        window.__kapanisLibreChatNewChatTimer = 0;
      }
    }, 350);
  }
})();`

/** Native presentation surface for the official LibreChat client. */
export class LibreChatView {
  private readonly window: BrowserWindow
  private view: BrowserView | null = null
  private attached = false
  private bounds: BrowserBounds = ZERO_BOUNDS
  private sessionReady: Promise<void> | null = null

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
      const result = await view.webContents.executeJavaScript(`(() => {
        try {
          ${LIBRECHAT_CHROME_SCRIPT}
          return { ok: true };
        } catch (error) {
          return { ok: false, message: String(error), stack: error?.stack || '' };
        }
      })()`, true) as { ok?: boolean; message?: string; stack?: string }
      if (!result?.ok) console.warn('[librechat] Pencere kontrolleri script hatası', result)
    } catch (error) {
      console.warn('[librechat] Pencere kontrolleri eklenemedi', error)
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
