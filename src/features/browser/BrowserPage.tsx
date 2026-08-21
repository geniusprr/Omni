import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left.js'
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right.js'
import Bookmark from 'lucide-react/dist/esm/icons/bookmark.js'
import Check from 'lucide-react/dist/esm/icons/check.js'
import Copy from 'lucide-react/dist/esm/icons/copy.js'
import Download from 'lucide-react/dist/esm/icons/download.js'
import EyeOff from 'lucide-react/dist/esm/icons/eye-off.js'
import Globe2 from 'lucide-react/dist/esm/icons/globe-2.js'
import History from 'lucide-react/dist/esm/icons/history.js'
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle.js'
import Lock from 'lucide-react/dist/esm/icons/lock.js'
import Pin from 'lucide-react/dist/esm/icons/pin.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js'
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check.js'
import Sparkles from 'lucide-react/dist/esm/icons/sparkles.js'
import Star from 'lucide-react/dist/esm/icons/star.js'
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js'
import Volume2 from 'lucide-react/dist/esm/icons/volume-2.js'
import VolumeX from 'lucide-react/dist/esm/icons/volume-x.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import {
  BROWSER_EVENTS,
  desktop,
  isElectronRuntime,
  type BrowserBounds,
  type BrowserDownloadItem,
  type BrowserHistoryItem,
  type BrowserMediaProjection,
  type BrowserPermissionRequest,
  type BrowserTabProjection,
} from '@/lib/desktop'
import {
  addRecentlyClosed,
  BROWSER_DATA_EVENT,
  BROWSER_NAVIGATION_EVENT,
  consumeBrowserNavigation,
  hostnameFromUrl,
  loadFavorites,
  loadRecentlyClosed,
  normalizeBrowserInput,
  relativeTime,
  saveFavorites,
  saveRecentlyClosed,
  type BrowserFavorite,
} from './browserData'
import {
  applyTabProjectionState,
  closeOtherTabsState,
  closeTabsToTheRightState,
  closeTabState,
  DEFAULT_BROWSER_HOME_URL,
  EMPTY_BROWSER_STATE,
  faviconForUrl,
  makeTab,
  migrateBrowserState,
  nativeRestoreTasks,
  nativeViewAction,
  prepareNewTabNavigation,
  resolveOptimisticClose,
  selectTabState,
  serializeBrowserState,
  type BrowserState,
} from './browserState'

interface BrowserPageProps {
  isVisible: boolean
  theme?: 'light' | 'dark'
  emptyTabContent?: ReactNode
  onEnterBrowser?: () => void
  onNoTabs?: () => void
  onExecuteCommand?: (query: string) => void
}

type BrowserPanel = 'history' | 'downloads' | null

interface TabContextMenuState {
  tabId: string
  x: number
  y: number
}

const TABS_KEY = 'minios_browser_tabs_v2'
const ACTIVE_KEY = 'minios_browser_active_tab_v2'
const SHOW_FAVORITES_BAR_KEY = 'minios_browser_show_favorites_bar_v1'

function loadState(): BrowserState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TABS_KEY) || '[]')
    const migrated = migrateBrowserState(parsed, localStorage.getItem(ACTIVE_KEY))
    if (migrated.tabs.length === 0) {
      const initialTab = makeTab()
      return {
        tabs: [initialTab],
        activeTabId: initialTab.id,
        mediaByTabId: {},
      }
    }
    return migrated
  } catch {
    const initialTab = makeTab()
    return { tabs: [initialTab], activeTabId: initialTab.id, mediaByTabId: {} }
  }
}

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
}

function errorMessage(cause: unknown, fallback: string): string {
  if (typeof cause === 'string' && cause.trim()) return cause
  if (cause instanceof Error && cause.message) return cause.message
  if (typeof cause === 'object' && cause !== null && 'message' in cause && typeof cause.message === 'string' && cause.message.trim()) {
    return cause.message
  }
  return fallback
}

function isMissingBrowserTab(cause: unknown) {
  return errorMessage(cause, '').includes('sekmesi bulunamadı')
}

function persist(state: BrowserState) {
  const snapshot = serializeBrowserState(state)
  localStorage.setItem(TABS_KEY, JSON.stringify(snapshot.tabs))
  localStorage.setItem(ACTIVE_KEY, snapshot.activeTabId ?? '')
}

function sessionSnapshot(state: BrowserState) {
  return {
    tabs: state.tabs
      .filter((tab) => !tab.incognito)
      .map((tab) => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        favicon: tab.favicon,
        pinned: tab.pinned === true,
        muted: tab.muted === true,
      })),
    activeTabId: state.activeTabId,
  }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, bytes)} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

export function BrowserPage({
  isVisible,
  theme = 'light',
  emptyTabContent,
  onEnterBrowser,
  onNoTabs,
  onExecuteCommand,
}: BrowserPageProps) {
  const [state, setState] = useState(loadState)
  const [address, setAddress] = useState('')
  const [favorites, setFavorites] = useState<BrowserFavorite[]>(loadFavorites)
  const [showFavoritesBar, setShowFavoritesBar] = useState(() => {
    try {
      return localStorage.getItem(SHOW_FAVORITES_BAR_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<BrowserPanel>(null)
  const [history, setHistory] = useState<BrowserHistoryItem[]>([])
  const [historySearch, setHistorySearch] = useState('')
  const [clearingHistory, setClearingHistory] = useState(false)
  const [downloads, setDownloads] = useState<BrowserDownloadItem[]>([])
  const [permissionRequest, setPermissionRequest] = useState<BrowserPermissionRequest | null>(null)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [tabContextMenu, setTabContextMenu] = useState<TabContextMenuState | null>(null)
  const [nativeRestoreReady, setNativeRestoreReady] = useState(!isElectronRuntime())

  const chromeRef = useRef<HTMLDivElement>(null)
  const nativeSurfaceRef = useRef<HTMLDivElement>(null)
  const tabScrollRef = useRef<HTMLDivElement>(null)
  const addressInputRef = useRef<HTMLInputElement>(null)
  const stateRef = useRef(state)
  const liveTabIdsRef = useRef(new Set<string>())
  const openingUrlsRef = useRef(new Set<string>())
  const pendingOpenRef = useRef<{ url: string; incognito: boolean } | null>(null)
  const closePendingRef = useRef(false)
  const restoreStarted = useRef(false)
  const sessionHydrated = useRef(!isElectronRuntime())
  const surfaceSyncVersionRef = useRef(0)
  const wasBrowserSurfaceVisibleRef = useRef(isVisible)

  stateRef.current = state
  const active = state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0] ?? null

  /**
   * Electron child views are positioned in window-content coordinates, not in
   * the React layout tree. Measuring the real viewport avoids guessing about
   * dock width, chrome height, browser zoom, or responsive CSS changes.
   */
  const calculateLiveBounds = useCallback((): BrowserBounds | null => {
    const surface = nativeSurfaceRef.current
    if (!surface) return null
    const rect = surface.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return null

    // Round both edges as a pair. Rounding x/y and width/height separately
    // can make the native BrowserView end one pixel before or after its React
    // host, which is especially visible where it meets the browser chrome.
    const left = Math.max(0, Math.round(rect.left))
    const top = Math.max(0, Math.round(rect.top))
    const right = Math.max(left + 1, Math.round(rect.right))
    const bottom = Math.max(top + 1, Math.round(rect.bottom))

    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    }
  }, [])

  const syncTabBounds = useCallback(
    async (tabId?: string) => {
      const targetId = tabId || stateRef.current.activeTabId
      if (!targetId || !isElectronRuntime()) return false
      const bounds = calculateLiveBounds()
      if (!bounds) return false
      await desktop.browser.setBounds(targetId, bounds)
      return true
    },
    [calculateLiveBounds],
  )

  const project = useCallback((projection: BrowserTabProjection) => {
    const next = applyTabProjectionState(stateRef.current, projection)
    stateRef.current = next
    setState(next)
  }, [])

  const createBrowserTab = useCallback(
    async (id: string, url: string, incognito = false) => {
      let bounds = calculateLiveBounds()
      for (let attempt = 0; !bounds && attempt < 60; attempt += 1) {
        await nextFrame()
        bounds = calculateLiveBounds()
      }
      if (!bounds) return false
      const projection = await desktop.browser.create(id, url, bounds, { incognito })
      liveTabIdsRef.current.add(id)
      project(projection)
      return true
    },
    [calculateLiveBounds, project],
  )

  const synchronizeBrowserSurface = useCallback(
    async (nextState: BrowserState) => {
      if (!isElectronRuntime()) return
      const version = ++surfaceSyncVersionRef.current
      const action = nativeViewAction(nextState)
      const canShowNativeSurface = isVisible
        && panel === null
        && permissionRequest === null
        && tabContextMenu === null

      if (!canShowNativeSurface || action.type !== 'activate') {
        await desktop.browser.deactivate()
        return
      }

      const targetTab = nextState.tabs.find((tab) => tab.id === action.tabId)
      if (!targetTab?.url) {
        await desktop.browser.deactivate()
        return
      }

      if (!liveTabIdsRef.current.has(action.tabId)) {
        const created = await createBrowserTab(action.tabId, targetTab.url, targetTab.incognito)
        if (!created || version !== surfaceSyncVersionRef.current) return
      }

      const measured = await syncTabBounds(action.tabId)
      if (!measured || version !== surfaceSyncVersionRef.current) return
      await desktop.browser.activate(action.tabId, true)
    },
    [createBrowserTab, isVisible, panel, permissionRequest, syncTabBounds, tabContextMenu],
  )

  const navigateTab = useCallback(
    async (id: string, input: string) => {
      const url = normalizeBrowserInput(input)
      const tab = stateRef.current.tabs.find((item) => item.id === id)
      if (!tab) {
        setError('Sekme bulunamadı.')
        return false
      }
      if (url === 'about:blank') {
        setError('Bir adres veya arama metni girin.')
        return false
      }
      onEnterBrowser?.()
      try {
        if (!isElectronRuntime()) {
          project({
            id,
            url,
            title: hostnameFromUrl(url),
            favicon: faviconForUrl(url),
            loading: false,
            canGoBack: false,
            canGoForward: false,
            error: null,
            label: `browser-${id}`,
            muted: tab.muted === true,
            pinned: tab.pinned === true,
            incognito: tab.incognito === true,
          })
          return true
        }
        if (!liveTabIdsRef.current.has(id)) {
          const created = await createBrowserTab(id, url, tab.incognito)
          if (!created) throw new Error('Tarayıcı görünüm alanı henüz hazır değil.')
        } else {
          try {
            await desktop.browser.navigate(id, url)
          } catch (cause) {
            if (!isMissingBrowserTab(cause)) throw cause
            liveTabIdsRef.current.delete(id)
            const created = await createBrowserTab(id, url, tab.incognito)
            if (!created) throw new Error('Tarayıcı görünüm alanı henüz hazır değil.')
          }
        }
        await syncTabBounds(id)
        await desktop.browser.activate(id, true)
        setError(null)
        return true
      } catch (cause) {
        setError(errorMessage(cause, 'Sayfa açılamadı.'))
        return false
      }
    },
    [createBrowserTab, onEnterBrowser, project, syncTabBounds],
  )

  const openTab = useCallback(
    async (url?: string, incognito = false) => {
      const normalizedUrl = normalizeBrowserInput(url ?? DEFAULT_BROWSER_HOME_URL)
      // Shortcuts can be triggered from the app home while the browser surface
      // is still hidden. Keep the requested URL until its measured viewport is
      // available, rather than creating a blank tab that needs a second click.
      if (normalizedUrl && (!isVisible || !nativeRestoreReady)) {
        pendingOpenRef.current = { url: normalizedUrl, incognito }
        onEnterBrowser?.()
        return
      }
      if (normalizedUrl && openingUrlsRef.current.has(normalizedUrl)) return
      if (normalizedUrl) openingUrlsRef.current.add(normalizedUrl)

      try {
        onEnterBrowser?.()
        const tab = makeTab(normalizedUrl, incognito)
        const previous = stateRef.current
        const prepared = prepareNewTabNavigation(previous, tab, normalizedUrl)
        stateRef.current = prepared.state
        persist(prepared.state)
        setState(prepared.state)
        const created = await navigateTab(prepared.tabId, prepared.url)
        if (!created) {
          const restoredState = resolveOptimisticClose(previous, prepared.state, false)
          stateRef.current = restoredState
          persist(restoredState)
          setState(restoredState)
          await synchronizeBrowserSurface(restoredState).catch(() => undefined)
        }
      } finally {
        if (normalizedUrl) openingUrlsRef.current.delete(normalizedUrl)
      }
    },
    [isVisible, navigateTab, nativeRestoreReady, onEnterBrowser, synchronizeBrowserSurface],
  )

  // Closing every tab returns to the dashboard. If the browser is opened again,
  // start a fresh Google tab instead of leaving an empty browser surface.
  useEffect(() => {
    const wasVisible = wasBrowserSurfaceVisibleRef.current
    wasBrowserSurfaceVisibleRef.current = isVisible
    // A dashboard shortcut may already be waiting for the browser surface to
    // become measurable. Do not create the default tab first, otherwise the
    // requested URL opens beside it as a second tab.
    if (isVisible && !wasVisible && stateRef.current.tabs.length === 0 && !pendingOpenRef.current) void openTab()
  }, [isVisible, openTab])

  const select = useCallback(
    async (id: string) => {
      const next = selectTabState(stateRef.current, id)
      if (next === stateRef.current) return
      stateRef.current = next
      setState(next)
      await synchronizeBrowserSurface(next).catch(() => undefined)
    },
    [synchronizeBrowserSurface],
  )

  const close = useCallback(
    async (id: string) => {
      const tab = stateRef.current.tabs.find((item) => item.id === id)
      if (!tab) return
      closePendingRef.current = true
      const live = liveTabIdsRef.current.has(id)
      const previous = stateRef.current
      const next = closeTabState(previous, id)

      persist(next)
      stateRef.current = next
      setState(next)

      const closingLastTab = next.tabs.length === 0
      if (closingLastTab) {
        // Do not keep the browser chrome on screen while native tab cleanup
        // waits for media teardown. Detach any BrowserView and leave browser
        // mode before awaiting that cleanup, so the dashboard commits in this
        // same interaction.
        surfaceSyncVersionRef.current += 1
        void desktop.browser.deactivate().catch(() => undefined)
        onNoTabs?.()
      }

      if (live) {
        try {
          await desktop.browser.close(id)
          liveTabIdsRef.current.delete(id)
        } catch {
          /* ignore */
        }
      }
      if (tab.url && !tab.incognito) addRecentlyClosed(tab.title, tab.url, tab.favicon)
      closePendingRef.current = false

      if (closingLastTab) return

      await synchronizeBrowserSurface(next).catch(() => undefined)
    },
    [onNoTabs, synchronizeBrowserSurface],
  )

  const toggleFavorite = useCallback(() => {
    if (!active?.url) return
    const found = favorites.find((item) => item.url === active.url)
    const next = found
      ? favorites.filter((item) => item.id !== found.id)
      : [
          ...favorites,
          {
            id: crypto.randomUUID(),
            name: active.title,
            url: active.url,
            color: 'var(--color-browser-blue)',
            iconText: active.title.slice(0, 2).toUpperCase(),
            favicon: active.favicon,
          },
        ]
    saveFavorites(next)
    setFavorites(next)
  }, [active?.favicon, active?.title, active?.url, favorites])

  const togglePanel = useCallback(
    async (next: Exclude<BrowserPanel, null>) => {
      onEnterBrowser?.()
      if (panel === next) {
        setPanel(null)
        return
      }
      setPanel(next)
      if (next === 'history') setHistory(await desktop.browser.listHistory().catch(() => []))
      else if (next === 'downloads') setDownloads(await desktop.browser.listDownloads().catch(() => []))
    },
    [onEnterBrowser, panel],
  )

  const togglePin = useCallback(
    async (id: string) => {
      const tab = stateRef.current.tabs.find((t) => t.id === id)
      if (!tab) return
      const nextPinned = !tab.pinned
      if (isElectronRuntime()) await desktop.browser.setPinned(id, nextPinned).catch(() => undefined)
      project({
        id: tab.id,
        url: tab.url || 'about:blank',
        title: tab.title,
        favicon: tab.favicon,
        loading: tab.loading,
        canGoBack: tab.canGoBack,
        canGoForward: tab.canGoForward,
        error: tab.error,
        label: `browser-${tab.id}`,
        pinned: nextPinned,
        muted: tab.muted,
        incognito: tab.incognito,
      })
    },
    [project],
  )

  const toggleMute = useCallback(
    async (id: string) => {
      const tab = stateRef.current.tabs.find((t) => t.id === id)
      if (!tab) return
      const nextMuted = !tab.muted
      if (isElectronRuntime()) await desktop.browser.setMuted(id, nextMuted).catch(() => undefined)
      project({
        id: tab.id,
        url: tab.url || 'about:blank',
        title: tab.title,
        favicon: tab.favicon,
        loading: tab.loading,
        canGoBack: tab.canGoBack,
        canGoForward: tab.canGoForward,
        error: tab.error,
        label: `browser-${tab.id}`,
        pinned: tab.pinned,
        muted: nextMuted,
        incognito: tab.incognito,
      })
    },
    [project],
  )

  const closeOtherTabs = useCallback(
    async (keepId: string) => {
      const next = closeOtherTabsState(stateRef.current, keepId)
      const closedTabs = stateRef.current.tabs.filter((t) => !next.tabs.some((nt) => nt.id === t.id))
      persist(next)
      stateRef.current = next
      setState(next)
      for (const t of closedTabs) {
        if (liveTabIdsRef.current.has(t.id)) {
          liveTabIdsRef.current.delete(t.id)
          void desktop.browser.close(t.id).catch(() => undefined)
        }
        if (t.url && !t.incognito) addRecentlyClosed(t.title, t.url, t.favicon)
      }
      await synchronizeBrowserSurface(next).catch(() => undefined)
    },
    [synchronizeBrowserSurface],
  )

  const closeTabsToTheRight = useCallback(
    async (targetId: string) => {
      const next = closeTabsToTheRightState(stateRef.current, targetId)
      const closedTabs = stateRef.current.tabs.filter((t) => !next.tabs.some((nt) => nt.id === t.id))
      persist(next)
      stateRef.current = next
      setState(next)
      for (const t of closedTabs) {
        if (liveTabIdsRef.current.has(t.id)) {
          liveTabIdsRef.current.delete(t.id)
          void desktop.browser.close(t.id).catch(() => undefined)
        }
        if (t.url && !t.incognito) addRecentlyClosed(t.title, t.url, t.favicon)
      }
      await synchronizeBrowserSurface(next).catch(() => undefined)
    },
    [synchronizeBrowserSurface],
  )

  const reopenLastClosed = useCallback(() => {
    const recents = loadRecentlyClosed()
    if (recents.length > 0) {
      const [mostRecent, ...remaining] = recents
      saveRecentlyClosed(remaining)
      void openTab(mostRecent.url)
    }
  }, [openTab])

  // Keep the native child aligned with the actual React viewport. A polling
  // loop here used stale estimates during layout transitions and could leave a
  // WebContentsView over the browser chrome.
  useEffect(() => {
    let frame = 0
    const handleSync = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        void syncTabBounds().catch(() => undefined)
      })
    }
    const observer = new ResizeObserver(handleSync)
    if (nativeSurfaceRef.current) observer.observe(nativeSurfaceRef.current)
    window.addEventListener('resize', handleSync)
    handleSync()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', handleSync)
      window.cancelAnimationFrame(frame)
    }
  }, [active?.id, syncTabBounds])

  // Global Keyboard Shortcuts
  useEffect(() => {
    if (!isVisible) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey
      const activeTab = stateRef.current.tabs.find((t) => t.id === stateRef.current.activeTabId)
      const target = e.target as HTMLElement | null
      const isAddressInput = target === addressInputRef.current

      // Ctrl+Shift+N: New Incognito Tab
      if (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        void openTab(undefined, true)
        return
      }

      // Ctrl+Shift+T: Reopen closed tab
      if (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault()
        reopenLastClosed()
        return
      }

      // Ctrl+T: New Tab
      if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault()
        void openTab()
        return
      }

      // Ctrl+W: Close active tab
      if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        if (activeTab) void close(activeTab.id)
        return
      }

      // Ctrl+R / F5: Reload active tab
      if ((isCtrlOrCmd && e.key.toLowerCase() === 'r') || e.key === 'F5') {
        e.preventDefault()
        if (activeTab?.id) {
          if (isElectronRuntime()) void desktop.browser.reload(activeTab.id)
          else if (activeTab.url) void navigateTab(activeTab.id, activeTab.url)
        }
        return
      }

      // Ctrl+L / Alt+D: Focus address bar
      if ((isCtrlOrCmd && e.key.toLowerCase() === 'l') || (e.altKey && e.key.toLowerCase() === 'd')) {
        e.preventDefault()
        addressInputRef.current?.focus()
        addressInputRef.current?.select()
        return
      }

      // Alt+Left / Alt+ArrowLeft: Back
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'Left')) {
        e.preventDefault()
        if (activeTab?.canGoBack) void desktop.browser.back(activeTab.id)
        return
      }

      // Alt+Right / Alt+ArrowRight: Forward
      if (e.altKey && (e.key === 'ArrowRight' || e.key === 'Right')) {
        e.preventDefault()
        if (activeTab?.canGoForward) void desktop.browser.forward(activeTab.id)
        return
      }

      // Ctrl+H: History panel
      if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        void togglePanel('history')
        return
      }

      // Ctrl+J: Downloads panel
      if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        void togglePanel('downloads')
        return
      }

      // Ctrl+D: Bookmark / Favorite
      if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        toggleFavorite()
        return
      }

      // Ctrl+M: Mute / unmute active tab
      if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        if (activeTab) void toggleMute(activeTab.id)
        return
      }

      // Ctrl+Tab / Ctrl+Shift+Tab: Switch tabs
      if (isCtrlOrCmd && e.key === 'Tab') {
        e.preventDefault()
        const currentTabs = stateRef.current.tabs
        if (currentTabs.length > 1) {
          const currentIndex = currentTabs.findIndex((t) => t.id === stateRef.current.activeTabId)
          const nextIndex = e.shiftKey
            ? (currentIndex - 1 + currentTabs.length) % currentTabs.length
            : (currentIndex + 1) % currentTabs.length
          void select(currentTabs[nextIndex].id)
        }
        return
      }

      // Ctrl+1 through Ctrl+9: Jump to specific tab
      if (isCtrlOrCmd && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault()
        const num = parseInt(e.key, 10)
        const currentTabs = stateRef.current.tabs
        if (num === 9 && currentTabs.length > 0) {
          void select(currentTabs[currentTabs.length - 1].id)
        } else if (num <= currentTabs.length) {
          void select(currentTabs[num - 1].id)
        }
        return
      }

      // Escape: Close panels & context menu & blur address input
      if (e.key === 'Escape') {
        setPanel(null)
        setTabContextMenu(null)
        if (isAddressInput) addressInputRef.current?.blur()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [close, isVisible, navigateTab, openTab, reopenLastClosed, select, toggleFavorite, toggleMute, togglePanel])

  // Native Session Restore
  useEffect(() => {
    if (!isVisible || restoreStarted.current) return
    setNativeRestoreReady(false)
    let cancelled = false
    void (async () => {
      await nextFrame()
      if (cancelled) return
      let nextState = stateRef.current
      if (isElectronRuntime()) {
        const stored = await desktop.browser.getSession().catch(() => ({ tabs: [], activeTabId: null }))
        if (stored.tabs && stored.tabs.length > 0) {
          nextState = migrateBrowserState(stored, stored.activeTabId)
        } else if (pendingOpenRef.current) {
          // `loadState` has a fallback Google tab so opening the browser on its
          // own is useful. A dashboard shortcut is a more specific intent:
          // discard that fallback and let the pending URL become the first tab.
          nextState = { ...EMPTY_BROWSER_STATE, mediaByTabId: {} }
        }
      }
      if (cancelled) return
      sessionHydrated.current = true
      restoreStarted.current = true
      stateRef.current = nextState
      setState(nextState)
      persist(nextState)
      for (const task of nativeRestoreTasks(nextState)) {
        if (cancelled) return
        await navigateTab(task.tabId, task.url)
      }
      if (cancelled) return
      await synchronizeBrowserSurface(stateRef.current).catch(() => undefined)
      if (!cancelled) setNativeRestoreReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [isVisible, navigateTab, synchronizeBrowserSurface])

  useEffect(() => {
    if (!isVisible || !nativeRestoreReady) return
    const pending = pendingOpenRef.current
    if (!pending) return
    const frame = window.requestAnimationFrame(() => {
      if (pendingOpenRef.current !== pending) return
      pendingOpenRef.current = null
      void openTab(pending.url, pending.incognito)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isVisible, nativeRestoreReady, openTab])

  useEffect(() => {
    if (!sessionHydrated.current) return
    persist(state)
    if (isElectronRuntime()) void desktop.browser.saveSession(sessionSnapshot(state)).catch(() => undefined)
  }, [state])

  useEffect(() => setAddress(active?.url ?? ''), [active?.id, active?.url])

  useEffect(() => {
    const created = (projection: BrowserTabProjection) => {
      liveTabIdsRef.current.add(projection.id)
      project(projection)
      void syncTabBounds(projection.id).catch(() => undefined)
    }
    const destroyed = (projection: BrowserTabProjection) => {
      liveTabIdsRef.current.delete(projection.id)
      const next = closeTabState(stateRef.current, projection.id)
      stateRef.current = next
      setState(next)
    }
    const mediaUpdated = (media: BrowserMediaProjection) =>
      setState((current) => ({
        ...current,
        mediaByTabId: { ...current.mediaByTabId, [media.tabId]: media },
      }))
    const openRequest = (payload: { url?: string } | string) => {
      const url = typeof payload === 'string' ? payload : payload?.url
      if (url) void openTab(url)
    }
    const rendererFailed = (payload: { projection?: BrowserTabProjection; reason?: string }) => {
      if (payload?.projection) project(payload.projection)
      if (payload?.projection?.id === stateRef.current.activeTabId) {
        setError(payload.reason || payload.projection.error || 'Sekme işlemi sonlandı.')
      }
    }
    const permission = (request: BrowserPermissionRequest) => setPermissionRequest(request)
    const download = (item: BrowserDownloadItem) =>
      setDownloads((current) => [item, ...current.filter((entry) => entry.id !== item.id)])
    const historyUpdate = (item: BrowserHistoryItem | null) => {
      if (!item) {
        setHistory([])
        return
      }
      setHistory((current) => [item, ...current.filter((entry) => entry.url !== item.url)])
    }

    const stops = [
      desktop.browser.on<BrowserTabProjection>(BROWSER_EVENTS.tabCreated, created),
      desktop.browser.on<BrowserTabProjection>(BROWSER_EVENTS.tabUpdated, project),
      desktop.browser.on<BrowserTabProjection>(BROWSER_EVENTS.tabDestroyed, destroyed),
      desktop.browser.on<BrowserMediaProjection>(BROWSER_EVENTS.mediaUpdated, mediaUpdated),
      desktop.browser.on<{ url?: string } | string>(BROWSER_EVENTS.openRequest, openRequest),
      desktop.browser.on<{ projection?: BrowserTabProjection; reason?: string }>(
        BROWSER_EVENTS.rendererFailed,
        rendererFailed,
      ),
      desktop.browser.on<BrowserPermissionRequest>(BROWSER_EVENTS.permissionRequest, permission),
      desktop.browser.on<BrowserDownloadItem>(BROWSER_EVENTS.downloadUpdated, download),
      desktop.browser.on<BrowserHistoryItem | null>(BROWSER_EVENTS.historyUpdated, historyUpdate),
    ]
    return () => stops.forEach((stop) => stop())
  }, [openTab, project, syncTabBounds])

  useEffect(() => {
    const sync = () => setFavorites(loadFavorites())
    const requested = (event: Event) => {
      const url = (event as CustomEvent<{ url?: string }>).detail?.url
      if (!url) return
      consumeBrowserNavigation()
      void openTab(url)
    }
    window.addEventListener(BROWSER_DATA_EVENT, sync)
    window.addEventListener(BROWSER_NAVIGATION_EVENT, requested)
    const pending = consumeBrowserNavigation()
    if (pending) void openTab(pending)
    return () => {
      window.removeEventListener(BROWSER_DATA_EVENT, sync)
      window.removeEventListener(BROWSER_NAVIGATION_EVENT, requested)
    }
  }, [openTab])

  // This is the sole owner of native view visibility. Keeping this separate
  // from navigation avoids two asynchronous create/activate sequences racing
  // each other and exposing a stale view over the application controls.
  useEffect(() => {
    void synchronizeBrowserSurface(stateRef.current).catch(() => undefined)
  }, [
    active?.id,
    active?.incognito,
    active?.url,
    isVisible,
    panel,
    permissionRequest,
    synchronizeBrowserSurface,
    tabContextMenu,
  ])

  useEffect(() => {
    void desktop.browser.setTheme(theme).catch(() => undefined)
  }, [theme])

  useEffect(() => {
    if (!isElectronRuntime()) return
    void desktop.browser.syncMetadata().catch(() => undefined)
    const timer = window.setInterval(() => void desktop.browser.syncMetadata().catch(() => undefined), 1_500)
    return () => window.clearInterval(timer)
  }, [])

  // Close custom context menu on outside click
  useEffect(() => {
    if (!tabContextMenu) return
    const handleClick = () => setTabContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [tabContextMenu])

  function submit(event: FormEvent) {
    event.preventDefault()
    const query = address.trim()
    if (!query) return
    const lower = query.toLocaleLowerCase('tr-TR')
    const isCommand =
      lower.startsWith('/') ||
      lower.startsWith('kapat') ||
      lower.startsWith('alarm') ||
      lower.startsWith('not') ||
      lower.startsWith('paylas') ||
      lower.startsWith('paylaş')
    if (isCommand && onExecuteCommand) {
      setAddress('')
      onExecuteCommand(query)
      return
    }
    if (active) void navigateTab(active.id, query)
    else void openTab(query)
  }

  function handleCopyUrl() {
    if (!active?.url) return
    void navigator.clipboard.writeText(active.url)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 1500)
  }

  function handleTabMiddleClick(event: MouseEvent, id: string) {
    if (event.button === 1) {
      event.preventDefault()
      event.stopPropagation()
      void close(id)
    }
  }

  function handleTabContextMenu(event: MouseEvent, id: string) {
    event.preventDefault()
    event.stopPropagation()
    setTabContextMenu({
      tabId: id,
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 300),
    })
  }

  function handleTabScrollWheel(event: React.WheelEvent) {
    if (event.deltaY !== 0 && tabScrollRef.current) {
      tabScrollRef.current.scrollBy({ left: event.deltaY, behavior: 'smooth' })
    }
  }

  function toggleFavoritesBarVisibility() {
    const next = !showFavoritesBar
    setShowFavoritesBar(next)
    try {
      localStorage.setItem(SHOW_FAVORITES_BAR_KEY, String(next))
    } catch {
      /* ignore */
    }
    window.setTimeout(() => void syncTabBounds().catch(() => undefined), 50)
  }

  async function clearHistory() {
    if (clearingHistory) return
    setClearingHistory(true)
    try {
      await desktop.browser.clearHistory()
      setHistory([])
    } catch (cause) {
      setError(errorMessage(cause, 'Geçmiş temizlenemedi.'))
    } finally {
      setClearingHistory(false)
    }
  }

  async function decidePermission(decision: 'allow' | 'deny') {
    if (!permissionRequest) return
    await desktop.browser
      .setPermission({
        origin: permissionRequest.origin,
        permission: permissionRequest.permission,
        decision,
        requestId: permissionRequest.requestId,
      })
      .catch(() => undefined)
    setPermissionRequest(null)
  }

  const isFavorite = Boolean(active?.url && favorites.some((item) => item.url === active.url))
  const isHttps = Boolean(active?.url && /^https:\/\//i.test(active.url))
  const isIncognito = Boolean(active?.incognito)
  const browserThemeClass = theme === 'dark' ? 'edge-browser--dark' : 'edge-browser--light'

  const filteredHistory = historySearch.trim()
    ? history.filter(
        (h) =>
          h.title.toLowerCase().includes(historySearch.toLowerCase()) ||
          h.url.toLowerCase().includes(historySearch.toLowerCase()),
      )
    : history

  const isBlankActiveTab = !active?.url

  return (
    <section
      className={`edge-browser ${browserThemeClass}`}
      style={{ colorScheme: theme }}
      aria-label="Gömülü tarayıcı"
    >
      {/* Floating Curved Acrylic Browser Chrome Bar */}
      <div ref={chromeRef} className="edge-browser__chrome" data-window-drag>
        {/* Upper Tab Strip Row */}
        <div className="edge-browser__tabs" role="tablist" aria-label="Tarayıcı sekmeleri" data-window-drag>
          {/* Scrollable Tabs */}
          <div
            ref={tabScrollRef}
            className="edge-browser__tab-scroll"
            onWheel={handleTabScrollWheel}
            data-window-drag
          >
            {state.tabs.map((tab) => {
              const media = state.mediaByTabId[tab.id]
              const isMuted = tab.muted === true
              const isSelected = tab.id === active?.id
              const isTabIncognito = tab.incognito === true

              return (
                <div
                  key={tab.id}
                  role="tab"
                  tabIndex={0}
                  aria-selected={isSelected}
                  className={`edge-browser__tab ${isSelected ? 'edge-browser__tab--active' : ''} ${tab.pinned ? 'edge-browser__tab--pinned' : ''} ${isTabIncognito ? 'edge-browser__tab--incognito' : ''}`}
                  onClick={() => void select(tab.id)}
                  onAuxClick={(event) => handleTabMiddleClick(event, tab.id)}
                  onMouseDown={(event) => handleTabMiddleClick(event, tab.id)}
                  onContextMenu={(event) => handleTabContextMenu(event, tab.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      void select(tab.id)
                    }
                  }}
                  title={`${tab.title}${isTabIncognito ? ' (Gizli Sekme)' : ''}`}
                >
                  {/* Tab Icon / Favicon / Incognito mask */}
                  <div className="edge-browser__tab-icon">
                    {isTabIncognito ? (
                      <EyeOff size={13} className="edge-browser__tab-incognito-icon" aria-label="Gizli Sekme" />
                    ) : tab.favicon ? (
                      <img src={tab.favicon} alt="" onError={(e) => { (e.target as HTMLElement).style.display = 'none' }} />
                    ) : (
                      <Globe2 size={13} />
                    )}
                  </div>

                  {/* Tab Title (hidden for pinned tabs) */}
                  {!tab.pinned && <span className="edge-browser__tab-title">{tab.title}</span>}

                  {/* Pinned Tab Badge */}
                  {tab.pinned && <Pin size={11} className="edge-browser__tab-pin-badge" aria-label="Sabitlenmiş" />}

                  {/* Audio / Media Playing Indicator */}
                  {media?.playing && (
                    <button
                      type="button"
                      className={`edge-browser__tab-media-btn ${isMuted ? 'edge-browser__tab-media-btn--muted' : ''}`}
                      title={isMuted ? 'Sekme sesi kapalı (Sesi aç)' : 'Medya çalıyor (Sessize al)'}
                      onClick={(event) => {
                        event.stopPropagation()
                        void toggleMute(tab.id)
                      }}
                      aria-label={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
                    >
                      {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                    </button>
                  )}

                  {/* Loading Spinner */}
                  {tab.loading && <LoaderCircle className="edge-browser__spinner" size={12} />}

                  {/* Tab Close Button */}
                  {!tab.pinned && (
                    <button
                      type="button"
                      className="edge-browser__tab-close-btn"
                      aria-label={`${tab.title} sekmesini kapat (Orta tık veya Ctrl+W)`}
                      title="Sekmeyi kapat (Orta tık / Ctrl+W)"
                      onClick={(event) => {
                        event.stopPropagation()
                        void close(tab.id)
                      }}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Tab Strip Action Buttons: New Tab & New Incognito Tab */}
          <div className="edge-browser__tabs-actions" data-window-drag>
            <button
              type="button"
              className="edge-browser__icon-button edge-browser__new-tab"
              onClick={() => void openTab()}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault()
                  void openTab()
                }
              }}
              title="Yeni sekme (Ctrl+T)"
              aria-label="Yeni sekme"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              className="edge-browser__icon-button edge-browser__new-incognito"
              onClick={() => void openTab(undefined, true)}
              title="Yeni gizli sekme (Ctrl+Shift+N)"
              aria-label="Yeni gizli sekme"
            >
              <EyeOff size={14} />
            </button>
          </div>
        </div>

        {/* Lower Navigation & Address Bar Toolbar */}
        <div className="edge-browser__toolbar" data-window-drag>
          {/* Navigation History Group (Back / Forward / Reload) */}
          <div className="edge-browser__navigation-group">
            <button
              type="button"
              className="edge-browser__tool-btn"
              disabled={!active?.canGoBack}
              onClick={() => active && void desktop.browser.back(active.id)}
              title="Geri (Alt+←)"
              aria-label="Geri"
            >
              <ArrowLeft size={15} />
            </button>
            <button
              type="button"
              className="edge-browser__tool-btn"
              disabled={!active?.canGoForward}
              onClick={() => active && void desktop.browser.forward(active.id)}
              title="İleri (Alt+→)"
              aria-label="İleri"
            >
              <ArrowRight size={15} />
            </button>
            <button
              type="button"
              className="edge-browser__tool-btn"
              disabled={!active?.id || !active?.url}
              onClick={() => {
                if (!active) return
                if (isElectronRuntime()) void desktop.browser.reload(active.id)
                else if (active.url) void navigateTab(active.id, active.url)
              }}
              title="Yenile (Ctrl+R / F5)"
              aria-label="Yenile"
            >
              {active?.loading ? <LoaderCircle className="edge-browser__spinner" size={14} /> : <RefreshCw size={14} />}
            </button>
          </div>

          {/* Omnibox / Search & Address Input */}
          <form className="edge-browser__address-bar" onSubmit={submit}>
            {/* Security / Privacy Indicator */}
            <div className="edge-browser__security-badge" title={isIncognito ? 'Gizli Tarama Modu' : isHttps ? 'Bağlantı güvenli (HTTPS)' : 'Web Adresi veya Arama'}>
              {isIncognito ? (
                <span className="edge-browser__incognito-badge">
                  <EyeOff size={12} />
                  <small>Gizli</small>
                </span>
              ) : isHttps ? (
                <Lock size={13} className="edge-browser__lock-secure" />
              ) : (
                <Search size={13} className="edge-browser__search-icon" />
              )}
            </div>

            <input
              ref={addressInputRef}
              className="edge-browser__address-input"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Web'de ara veya adres yaz (Ctrl+L / Alt+D)..."
              aria-label="Web adresi veya arama terimi"
              spellCheck={false}
              autoComplete="off"
            />

            {/* Action Icons inside Address Bar */}
            <div className="edge-browser__address-actions">
              {address ? (
                <button
                  type="button"
                  className="edge-browser__address-action-btn"
                  onClick={() => {
                    setAddress('')
                    addressInputRef.current?.focus()
                  }}
                  title="Temizle"
                  aria-label="Adresi temizle"
                >
                  <X size={13} />
                </button>
              ) : null}

              {active?.url ? (
                <button
                  type="button"
                  className="edge-browser__address-action-btn"
                  onClick={handleCopyUrl}
                  title={copiedUrl ? 'Adres kopyalandı!' : 'Adresi Kopyala'}
                  aria-label="Adresi kopyala"
                >
                  {copiedUrl ? <Check size={13} className="edge-browser__copy-success" /> : <Copy size={13} />}
                </button>
              ) : null}

              {active?.url ? (
                <button
                  type="button"
                  className={`edge-browser__address-action-btn ${isFavorite ? 'edge-browser__favorite--active' : ''}`}
                  onClick={toggleFavorite}
                  title={isFavorite ? 'Favorilerden kaldır (Ctrl+D)' : 'Favorilere ekle (Ctrl+D)'}
                  aria-label={isFavorite ? 'Favorilerden kaldır' : 'Favorilere ekle'}
                >
                  <Star size={14} fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
              ) : null}
            </div>
          </form>

          {/* Right Toolbar Actions Group */}
          <div className="edge-browser__toolbar-actions">
            {/* Toggle Favorites Bar */}
            <button
              type="button"
              className={`edge-browser__tool-btn ${showFavoritesBar ? 'edge-browser__tool-btn--active' : ''}`}
              onClick={toggleFavoritesBarVisibility}
              title={showFavoritesBar ? 'Favoriler çubuğunu gizle' : 'Favoriler çubuğunu göster'}
              aria-label="Favoriler Çubuğu"
            >
              <Bookmark size={14} />
            </button>

            {/* History Panel Button */}
            <button
              type="button"
              className={`edge-browser__tool-btn ${panel === 'history' ? 'edge-browser__tool-btn--active' : ''}`}
              onClick={() => void togglePanel('history')}
              title="Geçmiş (Ctrl+H)"
              aria-label="Geçmiş"
            >
              <History size={14} />
            </button>

            {/* Downloads Panel Button */}
            <button
              type="button"
              className={`edge-browser__tool-btn ${panel === 'downloads' ? 'edge-browser__tool-btn--active' : ''}`}
              onClick={() => void togglePanel('downloads')}
              title="İndirmeler (Ctrl+J)"
              aria-label="İndirmeler"
            >
              <Download size={14} />
              {downloads.some((d) => d.state === 'progressing') && (
                <span className="edge-browser__download-badge" />
              )}
            </button>
          </div>
        </div>

        {/* Optional Favorites / Bookmarks Bar */}
        {showFavoritesBar && favorites.length > 0 && (
          <div className="edge-browser__favorites-bar" role="toolbar" aria-label="Sık Kullanılanlar">
            <div className="edge-browser__favorites-list">
              {favorites.map((fav) => (
                <button
                  key={fav.id}
                  type="button"
                  className="edge-browser__favorite-pill"
                  onClick={() => void (active ? navigateTab(active.id, fav.url) : openTab(fav.url))}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      e.preventDefault()
                      void openTab(fav.url)
                    }
                  }}
                  title={`${fav.name}\n${fav.url} (Yeni sekmede açmak için orta tık)`}
                >
                  {fav.favicon ? (
                    <img src={fav.favicon} alt="" onError={(e) => { (e.target as HTMLElement).style.display = 'none' }} />
                  ) : (
                    <Globe2 size={12} />
                  )}
                  <span>{fav.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {(error || active?.error) && (
        <div className="edge-browser__error" role="alert">
          <span>{error || active?.error}</span>
          <button
            type="button"
            onClick={() => active && void navigateTab(active.id, active.url || address)}
          >
            Yeniden dene
          </button>
        </div>
      )}

      {/* Site Permission Request Dialog */}
      {permissionRequest && (
        <div className="edge-browser__permission" role="dialog" aria-label="Site izni talebi">
          <ShieldCheck size={16} />
          <span>
            <strong>{hostnameFromUrl(permissionRequest.origin)}</strong> sizden {permissionRequest.permission} izni istiyor.
          </span>
          <button type="button" onClick={() => void decidePermission('deny')}>
            Reddet
          </button>
          <button type="button" onClick={() => void decidePermission('allow')}>
            İzin ver
          </button>
        </div>
      )}

      {/* Floating Acrylic History / Downloads Panels */}
      {panel && (
        <div
          className="edge-browser__browser-panel"
          role="dialog"
          aria-label={panel === 'history' ? 'Tarama Geçmişi' : 'İndirmeler'}
        >
          <div className="edge-browser__section-title">
            <div className="edge-browser__panel-header-left">
              <h2>{panel === 'history' ? 'Tarama Geçmişi' : 'İndirmeler'}</h2>
              {panel === 'history' && history.length > 0 && (
                <span className="edge-browser__panel-count">{filteredHistory.length} kayıt</span>
              )}
            </div>

            <div className="edge-browser__section-title-actions">
              {panel === 'history' && history.length > 0 && (
                <button
                  type="button"
                  className="edge-browser__clear-history"
                  onClick={() => void clearHistory()}
                  disabled={clearingHistory}
                  aria-label="Geçmişi temizle"
                  title="Geçmişi tamamen temizle"
                  aria-busy={clearingHistory}
                >
                  <Trash2 size={13} />
                  <span>{clearingHistory ? 'Temizleniyor…' : 'Temizle'}</span>
                </button>
              )}
              <button type="button" onClick={() => setPanel(null)} aria-label="Paneli kapat">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* History Panel Content */}
          {panel === 'history' && (
            <div className="edge-browser__history-container">
              {history.length > 3 && (
                <div className="edge-browser__panel-search">
                  <Search size={13} />
                  <input
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Geçmişte ara..."
                    autoFocus
                  />
                  {historySearch && (
                    <button type="button" onClick={() => setHistorySearch('')}>
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}

              <div className="edge-browser__history-list">
                {filteredHistory.length > 0 ? (
                  filteredHistory.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="edge-browser__recent-row"
                      onClick={() => {
                        void openTab(item.url)
                        setPanel(null)
                      }}
                      onAuxClick={(e) => {
                        if (e.button === 1) {
                          e.preventDefault()
                          void openTab(item.url)
                        }
                      }}
                      title={`${item.title}\n${item.url}\n(Yeni sekmede açmak için orta tık)`}
                    >
                      {item.favicon ? (
                        <img src={item.favicon} alt="" onError={(e) => { (e.target as HTMLElement).style.display = 'none' }} />
                      ) : (
                        <Globe2 size={14} />
                      )}
                      <span className="edge-browser__history-info">
                        <strong>{item.title}</strong>
                        <small>{hostnameFromUrl(item.url)}</small>
                      </span>
                      <time>{relativeTime(item.visitedAt)}</time>
                    </button>
                  ))
                ) : (
                  <p className="edge-browser__empty">
                    {historySearch ? 'Aramanıza uygun geçmiş kaydı bulunamadı.' : 'Henüz geçmiş kaydı yok.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Downloads Panel Content */}
          {panel === 'downloads' && (
            <div className="edge-browser__downloads-list">
              {downloads.length > 0 ? (
                downloads.map((item) => (
                  <div key={item.id} className="edge-browser__download-row">
                    <div className="edge-browser__download-details">
                      <strong>{item.filename}</strong>
                      <small>
                        {item.state === 'progressing'
                          ? `${formatBytes(item.receivedBytes)} / ${formatBytes(item.totalBytes)}`
                          : item.state === 'completed'
                            ? `Tamamlandı (${formatBytes(item.totalBytes)})`
                            : item.state}
                      </small>
                    </div>
                    <div className="edge-browser__download-actions">
                      <button
                        type="button"
                        onClick={() => void desktop.browser.openDownload(item.id)}
                        disabled={item.state !== 'completed'}
                      >
                        Aç
                      </button>
                      <button type="button" onClick={() => void desktop.browser.showDownload(item.id)}>
                        Klasör
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="edge-browser__empty">Henüz indirme yok.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab Right-Click Glass Context Menu */}
      {tabContextMenu && (
        <div
          className="edge-browser__context-menu"
          style={{ top: tabContextMenu.y, left: tabContextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="edge-browser__context-item"
            onClick={() => {
              setTabContextMenu(null)
              void openTab()
            }}
          >
            <Plus size={13} />
            <span>Yeni Sekme</span>
            <kbd>Ctrl+T</kbd>
          </button>

          <button
            type="button"
            className="edge-browser__context-item"
            onClick={() => {
              setTabContextMenu(null)
              void openTab(undefined, true)
            }}
          >
            <EyeOff size={13} />
            <span>Yeni Gizli Sekme</span>
            <kbd>Ctrl+Shift+N</kbd>
          </button>

          <div className="edge-browser__context-separator" />

          <button
            type="button"
            className="edge-browser__context-item"
            onClick={() => {
              const targetId = tabContextMenu.tabId
              setTabContextMenu(null)
              if (isElectronRuntime()) void desktop.browser.reload(targetId)
              else {
                const targetTab = state.tabs.find((t) => t.id === targetId)
                if (targetTab?.url) void navigateTab(targetId, targetTab.url)
              }
            }}
          >
            <RefreshCw size={13} />
            <span>Yenile</span>
            <kbd>Ctrl+R</kbd>
          </button>

          <button
            type="button"
            className="edge-browser__context-item"
            onClick={() => {
              const targetId = tabContextMenu.tabId
              setTabContextMenu(null)
              const targetTab = state.tabs.find((t) => t.id === targetId)
              if (targetTab?.url) void openTab(targetTab.url, targetTab.incognito)
              else void openTab(undefined, targetTab?.incognito)
            }}
          >
            <Sparkles size={13} />
            <span>Sekmeyi Çoğalt</span>
          </button>

          <button
            type="button"
            className="edge-browser__context-item"
            onClick={() => {
              const targetId = tabContextMenu.tabId
              setTabContextMenu(null)
              void togglePin(targetId)
            }}
          >
            <Pin size={13} />
            <span>
              {state.tabs.find((t) => t.id === tabContextMenu.tabId)?.pinned
                ? 'Sabitlemeyi Kaldır'
                : 'Sekmeyi Sabitle'}
            </span>
          </button>

          <button
            type="button"
            className="edge-browser__context-item"
            onClick={() => {
              const targetId = tabContextMenu.tabId
              setTabContextMenu(null)
              void toggleMute(targetId)
            }}
          >
            {state.tabs.find((t) => t.id === tabContextMenu.tabId)?.muted ? (
              <>
                <Volume2 size={13} />
                <span>Sekme Sesini Aç</span>
              </>
            ) : (
              <>
                <VolumeX size={13} />
                <span>Sekmeyi Sessize Al</span>
              </>
            )}
            <kbd>Ctrl+M</kbd>
          </button>

          <div className="edge-browser__context-separator" />

          <button
            type="button"
            className="edge-browser__context-item edge-browser__context-item--danger"
            onClick={() => {
              const targetId = tabContextMenu.tabId
              setTabContextMenu(null)
              void close(targetId)
            }}
          >
            <X size={13} />
            <span>Sekmeyi Kapat</span>
            <kbd>Orta Tık / Ctrl+W</kbd>
          </button>

          {state.tabs.length > 1 && (
            <>
              <button
                type="button"
                className="edge-browser__context-item"
                onClick={() => {
                  const targetId = tabContextMenu.tabId
                  setTabContextMenu(null)
                  void closeOtherTabs(targetId)
                }}
              >
                <X size={13} />
                <span>Diğer Sekmeleri Kapat</span>
              </button>

              <button
                type="button"
                className="edge-browser__context-item"
                onClick={() => {
                  const targetId = tabContextMenu.tabId
                  setTabContextMenu(null)
                  void closeTabsToTheRight(targetId)
                }}
              >
                <X size={13} />
                <span>Sağdaki Sekmeleri Kapat</span>
              </button>
            </>
          )}

          <div className="edge-browser__context-separator" />

          <button
            type="button"
            className="edge-browser__context-item"
            onClick={() => {
              setTabContextMenu(null)
              reopenLastClosed()
            }}
          >
            <RotateCcw size={13} />
            <span>Kapatılan Sekmeyi Aç</span>
            <kbd>Ctrl+Shift+T</kbd>
          </button>
        </div>
      )}

      {/* This element is the measured, renderer-side contract for the native
          WebContentsView. It deliberately stays in normal flex layout. */}
      <div ref={nativeSurfaceRef} className="edge-browser__content" data-browser-native-surface>
        {isBlankActiveTab && emptyTabContent ? (
          <div className="edge-browser__empty-tab-home" aria-label="Ana sayfa">
            {emptyTabContent}
          </div>
        ) : null}

        {/* Non-Electron Fallback */}
        {active?.url && !isElectronRuntime() && (
          <div className="edge-browser__web-fallback">
            <Globe2 size={32} />
            <p>Gömülü tarayıcı Electron masaüstü çalışma zamanında aktiftir.</p>
          </div>
        )}
      </div>
    </section>
  )
}
