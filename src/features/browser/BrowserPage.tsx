import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left.js'
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right.js'
import Bookmark from 'lucide-react/dist/esm/icons/bookmark.js'
import Check from 'lucide-react/dist/esm/icons/check.js'
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left.js'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.js'
import Copy from 'lucide-react/dist/esm/icons/copy.js'
import Download from 'lucide-react/dist/esm/icons/download.js'
import EyeOff from 'lucide-react/dist/esm/icons/eye-off.js'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js'
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open.js'
import Globe2 from 'lucide-react/dist/esm/icons/globe-2.js'
import History from 'lucide-react/dist/esm/icons/history.js'
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle.js'
import Lock from 'lucide-react/dist/esm/icons/lock.js'
import Pin from 'lucide-react/dist/esm/icons/pin.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import Puzzle from 'lucide-react/dist/esm/icons/puzzle.js'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js'
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check.js'
import Settings2 from 'lucide-react/dist/esm/icons/settings-2.js'
import Sparkles from 'lucide-react/dist/esm/icons/sparkles.js'
import Star from 'lucide-react/dist/esm/icons/star.js'
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js'
import Volume2 from 'lucide-react/dist/esm/icons/volume-2.js'
import VolumeX from 'lucide-react/dist/esm/icons/volume-x.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  BROWSER_EVENTS,
  desktop,
  isElectronRuntime,
  type BrowserBounds,
  type BrowserDownloadItem,
  type BrowserHistoryItem,
  type BrowserFeatureState,
  type BrowserMediaProjection,
  type BrowserPermissionRecord,
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
  reorderTabState,
  selectTabState,
  serializeBrowserState,
  type TabDropPosition,
  type BrowserState,
} from './browserState'

interface BrowserPageProps {
  isVisible: boolean
  theme?: 'light' | 'dark'
  emptyTabContent?: ReactNode
  onEnterBrowser?: () => void
  onExitBrowser?: () => void
  onExecuteCommand?: (query: string) => void
}

type BrowserPanel = 'history' | 'downloads' | 'settings' | 'permissions' | 'extensions' | null

const BROWSER_INTERNAL_URLS: Record<Exclude<BrowserPanel, null>, string> = {
  settings: 'omni://settings',
  history: 'omni://history',
  downloads: 'omni://downloads',
  permissions: 'omni://permissions',
  extensions: 'omni://extensions',
}

function browserPanelFromUrl(value: string): Exclude<BrowserPanel, null> | null {
  const normalized = value.trim().replace(/\/+$/, '').toLowerCase()
  const match = (Object.entries(BROWSER_INTERNAL_URLS) as Array<[Exclude<BrowserPanel, null>, string]>)
    .find(([, url]) => url === normalized)
  return match?.[0] ?? null
}

type BrowserSearchEngine = 'google' | 'duckduckgo' | 'brave' | 'bing'

interface BrowserPreferences {
  searchEngine: BrowserSearchEngine
  homePage: string
  defaultZoom: number
}

interface TabContextMenuState {
  tabId: string
  x: number
  y: number
}

interface TabDropTarget {
  tabId: string
  position: TabDropPosition
}

interface TabDragSession {
  tabId: string
  pointerId: number
  startX: number
  startY: number
  started: boolean
  dropTarget: TabDropTarget | null
  origin: HTMLElement
  ghost: HTMLElement | null
  pointerOffsetX: number
  pointerOffsetY: number
  moveHandler: (event: globalThis.PointerEvent) => void
  upHandler: (event: globalThis.PointerEvent) => void
  cancelHandler: (event: globalThis.PointerEvent) => void
}

interface BrowserTooltipProps {
  label: string
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}

const TABS_KEY = 'minios_browser_tabs_v2'
const ACTIVE_KEY = 'minios_browser_active_tab_v2'
const SHOW_FAVORITES_BAR_KEY = 'minios_browser_show_favorites_bar_v1'
const BROWSER_PREFERENCES_KEY = 'minios_browser_preferences_v1'

const DEFAULT_BROWSER_PREFERENCES: BrowserPreferences = {
  searchEngine: 'google',
  homePage: DEFAULT_BROWSER_HOME_URL,
  defaultZoom: 1,
}

function loadBrowserPreferences(): BrowserPreferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(BROWSER_PREFERENCES_KEY) || '{}') as Partial<BrowserPreferences>
    const searchEngine: BrowserSearchEngine = ['google', 'duckduckgo', 'brave', 'bing'].includes(parsed.searchEngine || '')
      ? parsed.searchEngine as BrowserSearchEngine
      : DEFAULT_BROWSER_PREFERENCES.searchEngine
    const homePage = typeof parsed.homePage === 'string' && /^https?:\/\//i.test(parsed.homePage)
      ? parsed.homePage
      : DEFAULT_BROWSER_PREFERENCES.homePage
    const defaultZoom = typeof parsed.defaultZoom === 'number' && parsed.defaultZoom >= 0.5 && parsed.defaultZoom <= 2
      ? parsed.defaultZoom
      : DEFAULT_BROWSER_PREFERENCES.defaultZoom
    return { searchEngine, homePage, defaultZoom }
  } catch {
    return DEFAULT_BROWSER_PREFERENCES
  }
}

function persistBrowserPreferences(preferences: BrowserPreferences) {
  localStorage.setItem(BROWSER_PREFERENCES_KEY, JSON.stringify(preferences))
}

function BrowserTooltip({ label, children, side = 'bottom' }: BrowserTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="edge-browser__chrome-tooltip" side={side} sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  )
}

function loadState(homePage = DEFAULT_BROWSER_HOME_URL): BrowserState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TABS_KEY) || '[]')
    const migrated = migrateBrowserState(parsed, localStorage.getItem(ACTIVE_KEY))
    if (migrated.tabs.length === 0) {
      const initialTab = makeTab(homePage)
      return {
        tabs: [initialTab],
        activeTabId: initialTab.id,
        mediaByTabId: {},
      }
    }
    return migrated
  } catch {
    const initialTab = makeTab(homePage)
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
  onExitBrowser,
  onExecuteCommand,
}: BrowserPageProps) {
  const [browserPreferences, setBrowserPreferences] = useState<BrowserPreferences>(loadBrowserPreferences)
  const [state, setState] = useState(() => loadState(browserPreferences.homePage))
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
  const [browserFeatures, setBrowserFeatures] = useState<BrowserFeatureState | null>(null)
  const [permissionRecords, setPermissionRecords] = useState<BrowserPermissionRecord[]>([])
  const [extensionStoreInput, setExtensionStoreInput] = useState('')
  const [browserAdminBusy, setBrowserAdminBusy] = useState<string | null>(null)
  const [permissionRequest, setPermissionRequest] = useState<BrowserPermissionRequest | null>(null)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [tabContextMenu, setTabContextMenu] = useState<TabContextMenuState | null>(null)
  const [nativeSurfaceSuppressed, setNativeSurfaceSuppressed] = useState(false)
  const [nativeRestoreReady, setNativeRestoreReady] = useState(!isElectronRuntime())
  const [nativeSurfaceActiveId, setNativeSurfaceActiveId] = useState<string | null>(null)
  const [zoomByTabId, setZoomByTabId] = useState<Record<string, number>>({})
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const [tabDropTarget, setTabDropTarget] = useState<TabDropTarget | null>(null)
  const [tabDragAnnouncement, setTabDragAnnouncement] = useState('')
  const [tabScrollState, setTabScrollState] = useState({ canScrollLeft: false, canScrollRight: false })

  const chromeRef = useRef<HTMLDivElement>(null)
  const nativeSurfaceRef = useRef<HTMLDivElement>(null)
  const tabScrollRef = useRef<HTMLDivElement>(null)
  const addressInputRef = useRef<HTMLInputElement>(null)
  const nativeSurfaceActiveIdRef = useRef<string | null>(null)
  const stateRef = useRef(state)
  const liveTabIdsRef = useRef(new Set<string>())
  const creatingNativeTabsRef = useRef(new Map<string, Promise<boolean>>())
  const openingUrlsRef = useRef(new Set<string>())
  const pendingOpenRef = useRef<{ url: string; incognito: boolean } | null>(null)
  const closePendingRef = useRef(false)
  const restoreStarted = useRef(false)
  const sessionHydrated = useRef(!isElectronRuntime())
  const surfaceSyncVersionRef = useRef(0)
  const wasBrowserSurfaceVisibleRef = useRef(isVisible)
  const tabDragRef = useRef<TabDragSession | null>(null)

  stateRef.current = state
  const active = state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0] ?? null
  const activeZoom = active?.id ? zoomByTabId[active.id] ?? browserPreferences.defaultZoom : browserPreferences.defaultZoom

  const updateNativeSurfaceActiveId = useCallback((id: string | null) => {
    nativeSurfaceActiveIdRef.current = id
    setNativeSurfaceActiveId(id)
  }, [])

  /**
   * BrowserView is a native child surface and therefore always composites above
   * React. Any renderer-owned browser UI (settings, extensions, history,
   * downloads, permission prompts and tab menus) must detach that native surface
   * before it is shown. Keeping this as an explicit mode also prevents a
   * deliberate detach from being mistaken for a page that is still loading.
   */
  const prepareRendererBrowserUi = useCallback(async () => {
    setNativeSurfaceSuppressed(true)
    surfaceSyncVersionRef.current += 1
    if (!isElectronRuntime()) return
    await desktop.browser.deactivate().catch(() => undefined)
    updateNativeSurfaceActiveId(null)
  }, [updateNativeSurfaceActiveId])

  const setActiveZoom = useCallback(
    (value: number) => {
      if (!active?.id) return
      const next = Math.min(2, Math.max(0.5, Number.isFinite(value) ? value : 1))
      setZoomByTabId((current) => ({ ...current, [active.id]: next }))
      void desktop.browser.setZoom(active.id, next).catch(() => undefined)
    },
    [active?.id],
  )

  useEffect(() => {
    if (!active?.id || !isElectronRuntime()) return
    void desktop.browser.setZoom(active.id, activeZoom).catch(() => undefined)
  }, [active?.id, activeZoom])

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

    // A native BrowserView is composited above the renderer. Refuse to give it
    // any part of the tab strip/toolbar or the window outside the real viewport
    // during a layout transition, even if a stale frame briefly reports an
    // oversized host.
    const chromeRect = chromeRef.current?.getBoundingClientRect()
    const viewportRight = Math.max(1, window.innerWidth)
    const visibleTop = Math.max(rect.top, chromeRect?.bottom ?? 0, 0)
    // The host is laid out directly above the dynamic bar. Do not clip this
    // measurement to a stale window.innerHeight value: that leaves a visible
    // seam between the native BrowserView and the bar during shell layout.
    const visibleBottom = rect.bottom
    const visibleLeft = Math.max(rect.left, 0)
    const visibleRight = Math.min(rect.right, viewportRight)
    if (visibleRight - visibleLeft < 1 || visibleBottom - visibleTop < 1) return null

    // Round both edges as a pair. Rounding x/y and width/height separately
    // can make the native BrowserView end one pixel before or after its React
    // host, which is especially visible where it meets the browser chrome.
    const left = Math.max(0, Math.round(visibleLeft))
    const top = Math.max(0, Math.round(visibleTop))
    const right = Math.max(left + 1, Math.round(visibleRight))
    const bottom = Math.max(top + 1, Math.round(visibleBottom))

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

  const setTabLoadState = useCallback((id: string, loading: boolean, loadError: string | null = null) => {
    const current = stateRef.current
    if (!current.tabs.some((tab) => tab.id === id)) return
    const next = {
      ...current,
      tabs: current.tabs.map((tab) => tab.id === id
        ? { ...tab, loading, error: loadError }
        : tab),
    }
    stateRef.current = next
    setState(next)
  }, [])

  const createBrowserTab = useCallback(
    async (id: string, url: string, incognito = false) => {
      const inFlight = creatingNativeTabsRef.current.get(id)
      if (inFlight) return inFlight

      const operation = (async () => {
        let bounds = calculateLiveBounds()
        for (let attempt = 0; !bounds && attempt < 60; attempt += 1) {
          await nextFrame()
          bounds = calculateLiveBounds()
        }
        if (!bounds) return false
        const projection = await desktop.browser.create(id, url, bounds, { incognito })

        // The tab may have been closed while the viewport was being measured
        // or while the IPC create call was in flight. Do not resurrect a
        // native child that no longer has a renderer tab to own it.
        if (!stateRef.current.tabs.some((tab) => tab.id === id)) {
          await desktop.browser.close(id).catch(() => undefined)
          return false
        }

        liveTabIdsRef.current.add(id)
        project(projection)
        return true
      })()
      creatingNativeTabsRef.current.set(id, operation)
      void operation.then(
        () => {
          if (creatingNativeTabsRef.current.get(id) === operation) creatingNativeTabsRef.current.delete(id)
        },
        () => {
          if (creatingNativeTabsRef.current.get(id) === operation) creatingNativeTabsRef.current.delete(id)
        },
      )
      return operation
    },
    [calculateLiveBounds, project],
  )

  const synchronizeBrowserSurface = useCallback(
    async (nextState: BrowserState) => {
      if (!isElectronRuntime()) return
      const version = ++surfaceSyncVersionRef.current

      // The initial renderer state can contain a local fallback tab while the
      // persisted Electron session is still being read. Creating it here would
      // begin a load that session restore immediately supersedes.
      if (!sessionHydrated.current) {
        updateNativeSurfaceActiveId(null)
        await desktop.browser.deactivate()
        return
      }
      const action = nativeViewAction(nextState)
      const canShowNativeSurface = isVisible
        && nativeRestoreReady
        && !closePendingRef.current
        && !nativeSurfaceSuppressed
        && panel === null
        && permissionRequest === null
        && tabContextMenu === null

      if (!canShowNativeSurface || action.type !== 'activate') {
        updateNativeSurfaceActiveId(null)
        await desktop.browser.deactivate()
        return
      }

      const targetTab = nextState.tabs.find((tab) => tab.id === action.tabId)
      if (!targetTab?.url) {
        updateNativeSurfaceActiveId(null)
        await desktop.browser.deactivate()
        return
      }

      try {
        if (!liveTabIdsRef.current.has(action.tabId)) {
          const created = await createBrowserTab(action.tabId, targetTab.url, targetTab.incognito)
          if (!created || version !== surfaceSyncVersionRef.current) return
        }

        // Do not tear down the currently painted native surface while the next
        // tab (or a navigation in the same tab) is still loading. Detaching the
        // BrowserView here exposes the renderer wallpaper for a few frames on
        // Windows. Keeping the last composited surface in place lets us swap to
        // the new page atomically as soon as Chromium reports it ready.
        if (version !== surfaceSyncVersionRef.current) return
        const currentTarget = stateRef.current.tabs.find((tab) => tab.id === action.tabId)
        if (!currentTarget) {
          updateNativeSurfaceActiveId(null)
          await desktop.browser.deactivate()
          return
        }
        if (currentTarget.loading && !currentTarget.error) {
          const paintedId = nativeSurfaceActiveIdRef.current
          if (paintedId && liveTabIdsRef.current.has(paintedId)) {
            await syncTabBounds(paintedId).catch(() => false)
            return
          }
          updateNativeSurfaceActiveId(null)
          await desktop.browser.deactivate()
          return
        }
        if (currentTarget.error) {
          updateNativeSurfaceActiveId(null)
          await desktop.browser.deactivate()
          return
        }

        const measured = await syncTabBounds(action.tabId)
        if (!measured || version !== surfaceSyncVersionRef.current) {
          if (version === surfaceSyncVersionRef.current) {
            updateNativeSurfaceActiveId(null)
            await desktop.browser.deactivate()
          }
          return
        }
        await desktop.browser.activate(action.tabId, true)
        if (version === surfaceSyncVersionRef.current) updateNativeSurfaceActiveId(action.tabId)
      } catch (cause) {
        if (version !== surfaceSyncVersionRef.current) return
        const message = errorMessage(cause, 'Sayfa açılamadı.')
        updateNativeSurfaceActiveId(null)
        setTabLoadState(action.tabId, false, message)
        setError(message)
        await desktop.browser.deactivate().catch(() => undefined)
      }
    },
    [createBrowserTab, isVisible, nativeRestoreReady, nativeSurfaceSuppressed, panel, permissionRequest, setTabLoadState, syncTabBounds, tabContextMenu, updateNativeSurfaceActiveId],
  )

  const navigateTab = useCallback(
    async (id: string, input: string) => {
      setPanel(null)
      const url = normalizeBrowserInput(input, browserPreferences.searchEngine)
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
        // Make the loading state synchronous with the user action. The native
        // IPC projection arrives on a later turn and must not leave one blank
        // renderer frame in the meantime.
        setTabLoadState(id, true, null)
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
        setError(null)
        return true
      } catch (cause) {
        const message = errorMessage(cause, 'Sayfa açılamadı.')
        setTabLoadState(id, false, message)
        setError(message)
        return false
      }
    },
    [browserPreferences.searchEngine, createBrowserTab, onEnterBrowser, project, setTabLoadState, syncTabBounds],
  )

  const openTab = useCallback(
    async (url?: string, incognito = false) => {
      setPanel(null)
      const normalizedUrl = normalizeBrowserInput(url ?? browserPreferences.homePage, browserPreferences.searchEngine)
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
        const tab = {
          ...makeTab(normalizedUrl, incognito),
          loading: isElectronRuntime(),
        }
        const previous = stateRef.current
        const prepared = prepareNewTabNavigation(previous, tab, normalizedUrl)
        stateRef.current = prepared.state
        persist(prepared.state)
        setState(prepared.state)
        const created = await navigateTab(prepared.tabId, prepared.url)
        // Never roll an empty browser back to an empty state. This path is
        // used by the automatic first-tab fallback as well as shortcuts that
        // open the browser from the dashboard.
        if (!created && previous.tabs.length > 0) {
          const restoredState = resolveOptimisticClose(previous, prepared.state, false)
          stateRef.current = restoredState
          persist(restoredState)
          setState(restoredState)
          await synchronizeBrowserSurface(restoredState).catch(() => undefined)
        } else if (!created) {
          const fallback = stateRef.current.tabs.find((item) => item.id === prepared.tabId)
          if (fallback && !fallback.error) setTabLoadState(prepared.tabId, false, 'Sayfa açılamadı.')
          await synchronizeBrowserSurface(stateRef.current).catch(() => undefined)
        }
      } finally {
        if (normalizedUrl) openingUrlsRef.current.delete(normalizedUrl)
      }
    },
    [browserPreferences.homePage, browserPreferences.searchEngine, isVisible, navigateTab, nativeRestoreReady, onEnterBrowser, setTabLoadState, synchronizeBrowserSurface],
  )

  // Re-entering the browser from another workspace starts a fresh tab only
  // when there is no restored/pending browser state to show.
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
      setPanel(null)
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
      // A second close click during native teardown must not replace the
      // replacement tab again or race the first close's fallback navigation.
      if (closePendingRef.current) return
      const tab = stateRef.current.tabs.find((item) => item.id === id)
      if (!tab) return
      closePendingRef.current = true
      const live = liveTabIdsRef.current.has(id)
      const previous = stateRef.current
      const next = closeTabState(previous, id)
      const closingLastTab = next.tabs.length === 0
      const nextState = next

      persist(nextState)
      stateRef.current = nextState
      setState(nextState)

      if (closingLastTab) {
        // Closing the final tab exits the browser workspace instead of creating
        // an uncloseable replacement tab.
        surfaceSyncVersionRef.current += 1
        await desktop.browser.deactivate().catch(() => undefined)
        setNativeSurfaceActiveId(null)
        onExitBrowser?.()
      }

      try {
        if (live) {
          await desktop.browser.close(id)
          liveTabIdsRef.current.delete(id)
        }
        if (tab.url && !tab.incognito) addRecentlyClosed(tab.title, tab.url, tab.favicon)
      } catch {
        /* Native teardown is best-effort; renderer state already owns the close. */
      } finally {
        closePendingRef.current = false
      }

      if (closingLastTab) return

      await synchronizeBrowserSurface(nextState).catch(() => undefined)
    },
    [onExitBrowser, synchronizeBrowserSurface],
  )

  const reorderTab = useCallback((draggedId: string, targetId: string, position: TabDropPosition) => {
    const current = stateRef.current
    const next = reorderTabState(current, draggedId, targetId, position)
    if (next === current) return false

    const previousPositions = new Map<string, number>()
    document.querySelectorAll<HTMLElement>('[data-browser-tab-id]').forEach((element) => {
      const id = element.dataset.browserTabId
      if (id) previousPositions.set(id, element.getBoundingClientRect().left)
    })

    stateRef.current = next
    setState(next)
    const nextIndex = next.tabs.findIndex((tab) => tab.id === draggedId)
    const movedTab = next.tabs[nextIndex]
    setTabDragAnnouncement(
      movedTab
        ? `${movedTab.title} sekmesi ${nextIndex + 1}. sıraya taşındı.`
        : 'Sekme sırası güncellendi.',
    )
    window.requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>('[data-browser-tab-id]').forEach((element) => {
        const id = element.dataset.browserTabId
        if (!id) return
        const previousLeft = previousPositions.get(id)
        if (previousLeft === undefined) return
        const deltaX = previousLeft - element.getBoundingClientRect().left
        if (Math.abs(deltaX) < 1) return
        element.animate(
          [
            { transform: `translateX(${deltaX}px)` },
            { transform: 'translateX(0)' },
          ],
          {
            duration: 240,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          },
        )
      })
      document.querySelector<HTMLElement>(`[data-browser-tab-id="${draggedId}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    })
    return true
  }, [])

  const updateTabScrollState = useCallback(() => {
    const scroller = tabScrollRef.current
    if (!scroller) return
    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
    const next = {
      canScrollLeft: scroller.scrollLeft > 2,
      canScrollRight: scroller.scrollLeft < maxScrollLeft - 2,
    }
    setTabScrollState((current) => (
      current.canScrollLeft === next.canScrollLeft && current.canScrollRight === next.canScrollRight
        ? current
        : next
    ))
  }, [])

  const scrollTabs = useCallback((direction: -1 | 1) => {
    const scroller = tabScrollRef.current
    if (!scroller) return
    const distance = Math.max(180, Math.min(420, scroller.clientWidth * 0.58))
    scroller.scrollBy({ left: direction * distance, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const scroller = tabScrollRef.current
    if (!scroller) return
    const sync = () => updateTabScrollState()
    const observer = new ResizeObserver(sync)
    observer.observe(scroller)
    scroller.addEventListener('scroll', sync, { passive: true })
    const frame = window.requestAnimationFrame(sync)
    return () => {
      observer.disconnect()
      scroller.removeEventListener('scroll', sync)
      window.cancelAnimationFrame(frame)
    }
  }, [state.tabs.length, updateTabScrollState])

  useEffect(() => {
    if (!active?.id) return
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-browser-tab-id="${active.id}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
      updateTabScrollState()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [active?.id, updateTabScrollState])

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

  const refreshBrowserAdministration = useCallback(async () => {
    const [features, permissions] = await Promise.all([
      desktop.browser.getFeatures().catch(() => null),
      desktop.browser.listPermissions().catch(() => []),
    ])
    if (features) setBrowserFeatures(features)
    setPermissionRecords(permissions)
    return features
  }, [])

  const refreshInternalPanelData = useCallback(async (target: Exclude<BrowserPanel, null>) => {
    if (target === 'history') {
      setHistory(await desktop.browser.listHistory().catch(() => []))
      return
    }
    if (target === 'downloads') {
      setDownloads(await desktop.browser.listDownloads().catch(() => []))
      return
    }
    await refreshBrowserAdministration()
  }, [refreshBrowserAdministration])

  const togglePanel = useCallback(
    async (next: Exclude<BrowserPanel, null>) => {
      onEnterBrowser?.()
      if (panel === next) {
        setPanel(null)
        return
      }
      await prepareRendererBrowserUi()
      setPanel(next)
      await refreshInternalPanelData(next)
    },
    [onEnterBrowser, panel, prepareRendererBrowserUi, refreshInternalPanelData],
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
        if (isVisible) void synchronizeBrowserSurface(stateRef.current).catch(() => undefined)
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
  }, [active?.id, isVisible, syncTabBounds, synchronizeBrowserSurface])

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
        if (panel) {
          void refreshInternalPanelData(panel)
          return
        }
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
        if (panel) {
          setPanel(null)
          return
        }
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
  }, [close, isVisible, navigateTab, openTab, panel, refreshInternalPanelData, reopenLastClosed, select, toggleFavorite, toggleMute, togglePanel])

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

  useEffect(() => {
    setAddress(panel ? BROWSER_INTERNAL_URLS[panel] : active?.url ?? '')
  }, [active?.id, active?.url, panel])

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
      // Renderer/native lifecycles can still end outside the explicit close
      // button (crash, process shutdown, or a compositor teardown). Recover
      // the browser immediately instead of leaving its chrome with no tab.
      if (next.tabs.length === 0 && isVisible && !closePendingRef.current) {
        void openTab()
      }
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
    const permission = (request: BrowserPermissionRequest) => {
      void prepareRendererBrowserUi().then(() => setPermissionRequest(request))
    }
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
  }, [isVisible, openTab, prepareRendererBrowserUi, project, syncTabBounds])

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
    active?.loading,
    active?.error,
    active?.url,
    isVisible,
    nativeRestoreReady,
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

  useEffect(() => {
    if (!isVisible || browserFeatures) return
    void refreshBrowserAdministration()
  }, [browserFeatures, isVisible, refreshBrowserAdministration])

  // Keep native Chromium detached for the entire lifetime of renderer-owned
  // browser UI. Restore it one animation frame after the last overlay closes so
  // the closing panel is painted out before the native child is composited back.
  useEffect(() => {
    if (panel !== null || permissionRequest !== null || tabContextMenu !== null) {
      setNativeSurfaceSuppressed(true)
      return
    }
    const frame = window.requestAnimationFrame(() => setNativeSurfaceSuppressed(false))
    return () => window.cancelAnimationFrame(frame)
  }, [panel, permissionRequest, tabContextMenu])

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
    const internalPanel = browserPanelFromUrl(query)
    if (internalPanel) {
      if (panel === internalPanel) void refreshInternalPanelData(internalPanel)
      else void togglePanel(internalPanel)
      return
    }
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
    setPanel(null)
    if (active) void navigateTab(active.id, query)
    else void openTab(query)
  }

  function handleCopyUrl() {
    const value = panel ? BROWSER_INTERNAL_URLS[panel] : active?.url
    if (!value) return
    void navigator.clipboard.writeText(value)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 1500)
  }

  const finishTabDrag = useCallback((cancelled = false) => {
    const session = tabDragRef.current
    if (!session) return

    window.removeEventListener('pointermove', session.moveHandler)
    window.removeEventListener('pointerup', session.upHandler)
    window.removeEventListener('pointercancel', session.cancelHandler)
    try {
      if (session.origin.hasPointerCapture(session.pointerId)) session.origin.releasePointerCapture(session.pointerId)
    } catch {
      /* the originating tab may have been closed during the drag */
    }

    session.ghost?.remove()

    tabDragRef.current = null
    document.body.classList.remove('is-browser-tab-dragging')
    const dropTarget = session.dropTarget
    setDraggingTabId(null)
    setTabDropTarget(null)

    if (!cancelled && session.started && dropTarget) {
      reorderTab(session.tabId, dropTarget.tabId, dropTarget.position)
    }
  }, [reorderTab])

  const updateTabDrag = useCallback((event: globalThis.PointerEvent) => {
    const session = tabDragRef.current
    if (!session || event.pointerId !== session.pointerId) return

    if (!session.started) {
      if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < 6) return
      session.started = true
      const rect = session.origin.getBoundingClientRect()
      const ghost = session.origin.cloneNode(true) as HTMLElement
      ghost.removeAttribute('role')
      ghost.removeAttribute('tabindex')
      ghost.removeAttribute('aria-selected')
      ghost.removeAttribute('aria-posinset')
      ghost.removeAttribute('aria-setsize')
      ghost.removeAttribute('aria-grabbed')
      ghost.removeAttribute('data-browser-tab-id')
      ghost.setAttribute('aria-hidden', 'true')
      ghost.classList.remove('edge-browser__tab--dragging', 'edge-browser__tab--drop-before', 'edge-browser__tab--drop-after')
      ghost.classList.add('edge-browser__tab-drag-preview')
      ghost.style.width = `${rect.width}px`
      ghost.style.height = `${rect.height}px`
      session.pointerOffsetX = session.startX - rect.left
      session.pointerOffsetY = session.startY - rect.top
      session.ghost = ghost
      document.body.appendChild(ghost)
      setDraggingTabId(session.tabId)
      document.body.classList.add('is-browser-tab-dragging')
    }
    if (event.cancelable) event.preventDefault()

    if (session.ghost) {
      session.ghost.style.left = `${event.clientX - session.pointerOffsetX}px`
      session.ghost.style.top = `${event.clientY - session.pointerOffsetY}px`
    }

    const scroller = tabScrollRef.current
    if (scroller) {
      const scrollRect = scroller.getBoundingClientRect()
      const edgeSize = Math.min(54, Math.max(32, scrollRect.width * 0.08))
      if (event.clientX < scrollRect.left + edgeSize) {
        scroller.scrollLeft -= 18
      } else if (event.clientX > scrollRect.right - edgeSize) {
        scroller.scrollLeft += 18
      }
    }

    const elementAtPoint = document.elementFromPoint(event.clientX, event.clientY)
    const tabElement = elementAtPoint instanceof Element
      ? elementAtPoint.closest<HTMLElement>('[data-browser-tab-id]')
      : null
    const targetId = tabElement?.dataset.browserTabId
    const sourceTab = stateRef.current.tabs.find((tab) => tab.id === session.tabId)
    const targetTab = targetId ? stateRef.current.tabs.find((tab) => tab.id === targetId) : null

    if (!tabElement || !targetId || targetId === session.tabId || !sourceTab || !targetTab
      || (sourceTab.pinned === true) !== (targetTab.pinned === true)) {
      session.dropTarget = null
      setTabDropTarget(null)
      return
    }

    const rect = tabElement.getBoundingClientRect()
    const nextDropTarget: TabDropTarget = {
      tabId: targetId,
      position: event.clientX < rect.left + rect.width / 2 ? 'before' : 'after',
    }
    session.dropTarget = nextDropTarget
    setTabDropTarget((current) => (
      current?.tabId === nextDropTarget.tabId && current.position === nextDropTarget.position
        ? current
        : nextDropTarget
    ))
  }, [])

  function handleTabPointerDown(event: ReactPointerEvent<HTMLDivElement>, id: string) {
    if (event.button !== 0 || event.isPrimary === false) return
    const eventTarget = event.target instanceof Element ? event.target : null
    if (eventTarget?.closest('button, a, input, [data-tab-action]')) return

    finishTabDrag(true)
    const origin = event.currentTarget
    const moveHandler = (pointerEvent: globalThis.PointerEvent) => updateTabDrag(pointerEvent)
    const upHandler = (pointerEvent: globalThis.PointerEvent) => {
      if (pointerEvent.pointerId !== event.pointerId) return
      if (pointerEvent.cancelable && tabDragRef.current?.started) pointerEvent.preventDefault()
      finishTabDrag(false)
    }
    const cancelHandler = (pointerEvent: globalThis.PointerEvent) => {
      if (pointerEvent.pointerId === event.pointerId) finishTabDrag(true)
    }
    tabDragRef.current = {
      tabId: id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      dropTarget: null,
      origin,
      ghost: null,
      pointerOffsetX: 0,
      pointerOffsetY: 0,
      moveHandler,
      upHandler,
      cancelHandler,
    }
    window.addEventListener('pointermove', moveHandler, { passive: false })
    window.addEventListener('pointerup', upHandler, { passive: false })
    window.addEventListener('pointercancel', cancelHandler, { passive: false })
    try {
      origin.setPointerCapture(event.pointerId)
    } catch {
      /* pointer capture is optional on older Chromium builds */
    }
  }

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, id: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void select(id)
      return
    }

    const isArrow = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
    const usesReorderShortcut = isArrow && (
      (event.altKey && !event.ctrlKey && !event.metaKey) ||
      (event.ctrlKey && event.shiftKey && !event.altKey)
    )
    if (!usesReorderShortcut) return

    const current = stateRef.current
    const index = current.tabs.findIndex((tab) => tab.id === id)
    const direction = event.key === 'ArrowLeft' ? -1 : 1
    const target = current.tabs[index + direction]
    if (!target) return

    event.preventDefault()
    event.stopPropagation()
    const changed = reorderTab(id, target.id, direction < 0 ? 'before' : 'after')
    if (changed) {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-browser-tab-id="${id}"]`)?.focus()
      })
    }
  }

  useEffect(() => () => finishTabDrag(true), [finishTabDrag])

  function handleTabMiddleClick(event: MouseEvent, id: string) {
    if (event.button !== 1) return
    event.preventDefault()
    event.stopPropagation()
    void close(id)
  }

  function handleTabContextMenu(event: MouseEvent, id: string) {
    event.preventDefault()
    event.stopPropagation()
    const nextMenu = {
      tabId: id,
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 300),
    }
    void prepareRendererBrowserUi().then(() => setTabContextMenu(nextMenu))
  }

  function handleTabScrollWheel(event: React.WheelEvent) {
    const scroller = tabScrollRef.current
    if (!scroller) return
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (delta === 0) return
    if (event.cancelable) event.preventDefault()
    scroller.scrollBy({ left: delta, behavior: 'smooth' })
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

  function updateBrowserPreferences(patch: Partial<BrowserPreferences>) {
    const next = { ...browserPreferences, ...patch }
    setBrowserPreferences(next)
    persistBrowserPreferences(next)
  }

  async function toggleAdBlock() {
    if (browserAdminBusy) return
    setBrowserAdminBusy('adblock')
    try {
      const current = browserFeatures ?? await desktop.browser.getFeatures()
      const next = await desktop.browser.setAdBlock(!current.adBlockEnabled)
      setBrowserFeatures(next)
    } catch (cause) {
      setError(errorMessage(cause, 'Reklam engelleme ayarı değiştirilemedi.'))
    } finally {
      setBrowserAdminBusy(null)
    }
  }

  async function installStoreExtension() {
    const value = extensionStoreInput.trim()
    if (!value || browserAdminBusy) return
    setBrowserAdminBusy('extension-store')
    try {
      await desktop.browser.installExtensionFromStore(value)
      setExtensionStoreInput('')
      await refreshBrowserAdministration()
      setError(null)
    } catch (cause) {
      setError(errorMessage(cause, 'Chrome eklentisi yüklenemedi.'))
    } finally {
      setBrowserAdminBusy(null)
    }
  }

  async function installUnpackedExtension() {
    if (browserAdminBusy) return
    setBrowserAdminBusy('extension-unpacked')
    try {
      await desktop.browser.installUnpackedExtension()
      await refreshBrowserAdministration()
      setError(null)
    } catch (cause) {
      setError(errorMessage(cause, 'Paketlenmemiş eklenti yüklenemedi.'))
    } finally {
      setBrowserAdminBusy(null)
    }
  }

  async function setManagedExtensionEnabled(id: string, enabled: boolean) {
    if (browserAdminBusy) return
    setBrowserAdminBusy(`extension-${id}`)
    try {
      setBrowserFeatures(await desktop.browser.setExtensionEnabled(id, enabled))
      setError(null)
    } catch (cause) {
      setError(errorMessage(cause, 'Eklenti durumu değiştirilemedi.'))
    } finally {
      setBrowserAdminBusy(null)
    }
  }

  async function removeManagedExtension(id: string) {
    if (browserAdminBusy) return
    setBrowserAdminBusy(`extension-${id}`)
    try {
      setBrowserFeatures(await desktop.browser.removeExtension(id))
      setError(null)
    } catch (cause) {
      setError(errorMessage(cause, 'Eklenti kaldırılamadı.'))
    } finally {
      setBrowserAdminBusy(null)
    }
  }

  async function clearBrowserStorage(scope: 'cache' | 'cookies' | 'all') {
    if (browserAdminBusy) return
    setBrowserAdminBusy(`clear-${scope}`)
    try {
      await desktop.browser.clearBrowsingData(scope)
      setError(null)
    } catch (cause) {
      setError(errorMessage(cause, 'Tarama verileri temizlenemedi.'))
    } finally {
      setBrowserAdminBusy(null)
    }
  }

  async function clearAllPermissions() {
    if (browserAdminBusy) return
    setBrowserAdminBusy('permissions')
    try {
      await desktop.browser.clearPermission()
      setPermissionRecords([])
      setError(null)
    } catch (cause) {
      setError(errorMessage(cause, 'Site izinleri temizlenemedi.'))
    } finally {
      setBrowserAdminBusy(null)
    }
  }

  async function clearPermissionRecord(record: BrowserPermissionRecord) {
    if (browserAdminBusy) return
    setBrowserAdminBusy(`permission-${record.origin}-${record.permission}`)
    try {
      await desktop.browser.clearPermission(record.origin, record.permission)
      setPermissionRecords((current) => current.filter((item) =>
        item.origin !== record.origin || item.permission !== record.permission,
      ))
      setError(null)
    } catch (cause) {
      setError(errorMessage(cause, 'Site izni sıfırlanamadı.'))
    } finally {
      setBrowserAdminBusy(null)
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
  const panelTitle = panel === 'history'
    ? 'Tarama Geçmişi'
    : panel === 'downloads'
      ? 'İndirmeler'
      : panel === 'extensions'
        ? 'Eklentiler'
        : panel === 'permissions'
          ? 'Site İzinleri'
        : 'Tarayıcı Ayarları'

  const isBlankActiveTab = !active?.url
  const rendererBrowserUiActive = nativeSurfaceSuppressed
    || panel !== null
    || permissionRequest !== null
    || tabContextMenu !== null
  const nativeSurfaceLoading = Boolean(
    isElectronRuntime()
      && isVisible
      && !rendererBrowserUiActive
      && active
      && active.url
      && (
        !nativeRestoreReady
        || active.loading
        || !liveTabIdsRef.current.has(active.id)
        || nativeSurfaceActiveId !== active.id
      ),
  )
  const nativeSurfaceError = Boolean(
    isElectronRuntime()
      && isVisible
      && !rendererBrowserUiActive
      && active?.url
      && active.error
      && !active.loading,
  )

  return (
    <TooltipProvider delayDuration={400} skipDelayDuration={150}>
      <section
        className={`edge-browser ${browserThemeClass} ${showFavoritesBar && favorites.length > 0 ? 'edge-browser--favorites-visible' : ''}`}
        style={{ colorScheme: theme }}
        aria-label="Gömülü tarayıcı"
      >
        <output className="edge-browser__tab-drag-announcement" aria-live="polite">
          {tabDragAnnouncement}
        </output>
        <div ref={chromeRef} className="edge-browser__chrome" data-window-drag>
          {/* The browser tab strip stays in its original top position. */}
          <div className="edge-browser__tabs" role="tablist" aria-label="Tarayıcı sekmeleri" data-window-drag>
            <div
              className={`edge-browser__tabs-viewport ${tabScrollState.canScrollLeft ? 'edge-browser__tabs-viewport--left' : ''} ${tabScrollState.canScrollRight ? 'edge-browser__tabs-viewport--right' : ''}`}
              data-window-drag
            >
              <BrowserTooltip label="Sekmeleri sola kaydır" side="bottom">
                <Button
                  type="button"
                  variant="icon"
                  size="compact"
                  className={`edge-browser__tab-scroll-button edge-browser__tab-scroll-button--left ${tabScrollState.canScrollLeft ? 'is-visible' : ''}`}
                  onClick={() => scrollTabs(-1)}
                  disabled={!tabScrollState.canScrollLeft}
                  aria-label="Sekmeleri sola kaydır"
                  data-tab-action
                >
                  <ChevronLeft size={14} />
                </Button>
              </BrowserTooltip>

              <div
                ref={tabScrollRef}
                className="edge-browser__tab-scroll"
                onWheel={handleTabScrollWheel}
                data-window-drag
              >
                {state.tabs.map((tab, tabIndex) => {
                const media = state.mediaByTabId[tab.id]
                const isMuted = tab.muted === true
                const isSelected = tab.id === active?.id
                const isTabIncognito = tab.incognito === true
                const isDragging = draggingTabId === tab.id
                const isDropBefore = tabDropTarget?.tabId === tab.id && tabDropTarget.position === 'before'
                const isDropAfter = tabDropTarget?.tabId === tab.id && tabDropTarget.position === 'after'
                const displayedTabTitle = isSelected && panel ? panelTitle : tab.title
                const internalTabIcon = isSelected && panel
                  ? panel === 'history'
                    ? <History size={13} />
                    : panel === 'downloads'
                      ? <Download size={13} />
                      : panel === 'permissions'
                        ? <ShieldCheck size={13} />
                        : panel === 'extensions'
                          ? <Puzzle size={13} />
                          : <Settings2 size={13} />
                  : null

                return (
                  <BrowserTooltip
                    key={tab.id}
                    label={`${displayedTabTitle}${isTabIncognito ? ' (Gizli Sekme)' : ''}`}
                    side="bottom"
                  >
                    <div
                      role="tab"
                      tabIndex={0}
                      aria-label={`${displayedTabTitle}${isTabIncognito ? ' (Gizli Sekme)' : ''}`}
                      aria-selected={isSelected}
                      aria-posinset={tabIndex + 1}
                      aria-setsize={state.tabs.length}
                      aria-grabbed={isDragging}
                      data-browser-tab-id={tab.id}
                      className={`edge-browser__tab ${isSelected ? 'edge-browser__tab--active' : ''} ${tab.pinned ? 'edge-browser__tab--pinned' : ''} ${isTabIncognito ? 'edge-browser__tab--incognito' : ''} ${isDragging ? 'edge-browser__tab--dragging' : ''} ${isDropBefore ? 'edge-browser__tab--drop-before' : ''} ${isDropAfter ? 'edge-browser__tab--drop-after' : ''}`}
                      onClick={() => void select(tab.id)}
                      onAuxClick={(event) => handleTabMiddleClick(event, tab.id)}
                      onPointerDown={(event) => handleTabPointerDown(event, tab.id)}
                      onContextMenu={(event) => handleTabContextMenu(event, tab.id)}
                      onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                    >
                      <div className="edge-browser__tab-icon">
                        {internalTabIcon ?? (isTabIncognito ? (
                          <EyeOff size={13} className="edge-browser__tab-incognito-icon" aria-label="Gizli Sekme" />
                        ) : tab.favicon ? (
                          <img src={tab.favicon} alt="" onError={(event) => { (event.target as HTMLElement).style.display = 'none' }} />
                        ) : (
                          <Globe2 size={13} />
                        ))}
                      </div>

                      {!tab.pinned && <span className="edge-browser__tab-title">{displayedTabTitle}</span>}
                      {tab.pinned && <Pin size={11} className="edge-browser__tab-pin-badge" aria-label="Sabitlenmiş" />}

                      {media?.playing && (
                        <BrowserTooltip
                          label={isMuted ? 'Sekme sesi kapalı (Sesi aç)' : 'Medya çalıyor (Sessize al)'}
                          side="bottom"
                        >
                          <button
                            type="button"
                            className={`edge-browser__tab-media-btn ${isMuted ? 'edge-browser__tab-media-btn--muted' : ''}`}
                            data-tab-action
                            onClick={(event) => {
                              event.stopPropagation()
                              void toggleMute(tab.id)
                            }}
                            aria-label={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
                          >
                            {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                          </button>
                        </BrowserTooltip>
                      )}

                      {tab.loading && <LoaderCircle className="edge-browser__spinner" size={12} />}

                      {!tab.pinned && (
                        <BrowserTooltip label="Sekmeyi kapat (Orta tık / Ctrl+W)" side="bottom">
                          <button
                            type="button"
                            className="edge-browser__tab-close-btn"
                            data-tab-action
                            aria-label={`${tab.title} sekmesini kapat (Orta tık veya Ctrl+W)`}
                            onClick={(event) => {
                              event.stopPropagation()
                              void close(tab.id)
                            }}
                          >
                            <X size={11} />
                          </button>
                        </BrowserTooltip>
                      )}
                    </div>
                  </BrowserTooltip>
                )
                })}
              </div>

              <BrowserTooltip label="Sekmeleri sağa kaydır" side="bottom">
                <Button
                  type="button"
                  variant="icon"
                  size="compact"
                  className={`edge-browser__tab-scroll-button edge-browser__tab-scroll-button--right ${tabScrollState.canScrollRight ? 'is-visible' : ''}`}
                  onClick={() => scrollTabs(1)}
                  disabled={!tabScrollState.canScrollRight}
                  aria-label="Sekmeleri sağa kaydır"
                  data-tab-action
                >
                  <ChevronRight size={14} />
                </Button>
              </BrowserTooltip>
            </div>

            <div className="edge-browser__tabs-actions" data-window-drag>
              <BrowserTooltip label="Yeni sekme (Ctrl+T)" side="bottom">
                <Button
                  type="button"
                  variant="icon"
                  size="compact"
                  className="edge-browser__icon-button edge-browser__new-tab"
                  onClick={() => void openTab()}
                  onAuxClick={(event) => {
                    if (event.button === 1) {
                      event.preventDefault()
                      void openTab()
                    }
                  }}
                  aria-label="Yeni sekme"
                >
                  <Plus size={14} />
                </Button>
              </BrowserTooltip>
              <BrowserTooltip label="Yeni gizli sekme (Ctrl+Shift+N)" side="bottom">
                <Button
                  type="button"
                  variant="icon"
                  size="compact"
                  className="edge-browser__icon-button edge-browser__new-incognito"
                  onClick={() => void openTab(undefined, true)}
                  aria-label="Yeni gizli sekme"
                >
                  <EyeOff size={14} />
                </Button>
              </BrowserTooltip>
            </div>
          </div>

          {/* Navigation and address toolbar; the window controls stay aligned
              with the top tab row at the app level. */}
        <div className="edge-browser__toolbar" data-window-drag>
          {/* Navigation History Group (Back / Forward / Reload) */}
          <div className="edge-browser__navigation-group">
            <button
              type="button"
              className="edge-browser__tool-btn"
              disabled={!panel && !active?.canGoBack}
              onClick={() => {
                if (panel) {
                  setPanel(null)
                  return
                }
                if (active) void desktop.browser.back(active.id)
              }}
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
              disabled={!panel && (!active?.id || !active?.url)}
              onClick={() => {
                if (panel) {
                  void refreshInternalPanelData(panel)
                  return
                }
                if (!active) return
                if (isElectronRuntime()) void desktop.browser.reload(active.id)
                else if (active.url) void navigateTab(active.id, active.url)
              }}
              title="Yenile (Ctrl+R / F5)"
              aria-label="Yenile"
            >
              {!panel && active?.loading ? <LoaderCircle className="edge-browser__spinner" size={14} /> : <RefreshCw size={14} />}
            </button>
          </div>

          {/* Omnibox / Search & Address Input */}
          <form className="edge-browser__address-bar" onSubmit={submit}>
            {/* Security / Privacy Indicator */}
            <div className="edge-browser__security-badge" title={panel ? 'Eon dahili sayfası' : isIncognito ? 'Gizli Tarama Modu' : isHttps ? 'Bağlantı güvenli (HTTPS)' : 'Web Adresi veya Arama'}>
              {panel ? (
                <Settings2 size={13} />
              ) : isIncognito ? (
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

            <Input
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

              {panel || active?.url ? (
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

              {!panel && active?.url ? (
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

            <button
              type="button"
              className={`edge-browser__tool-btn ${browserFeatures?.adBlockEnabled ? 'edge-browser__tool-btn--protected' : ''} ${panel === 'settings' ? 'edge-browser__tool-btn--active' : ''}`}
              onClick={() => void togglePanel('settings')}
              title={browserFeatures?.adBlockEnabled ? 'Reklam engelleme açık · Gizlilik ayarları' : 'Gizlilik ve reklam engelleme ayarları'}
              aria-label="Gizlilik ve reklam engelleme"
            >
              <ShieldCheck size={14} />
            </button>

            <button
              type="button"
              className={`edge-browser__tool-btn edge-browser__extensions-button ${panel === 'extensions' ? 'edge-browser__tool-btn--active' : ''}`}
              onClick={() => void togglePanel('extensions')}
              title="Eklentiler"
              aria-label="Eklentiler"
            >
              <Puzzle size={14} />
              {(browserFeatures?.extensionCount ?? 0) > 0 && (
                <span className="edge-browser__extension-count">{browserFeatures?.extensionCount}</span>
              )}
            </button>

            <button
              type="button"
              className={`edge-browser__tool-btn ${panel === 'settings' ? 'edge-browser__tool-btn--active' : ''}`}
              onClick={() => void togglePanel('settings')}
              title="Tarayıcı ayarları"
              aria-label="Tarayıcı ayarları"
            >
              <Settings2 size={14} />
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

      {/* Browser-owned internal surfaces. These replace the old floating
          panels and behave like chrome:// pages inside the browser viewport. */}
      {panel && (
        <div
          className="edge-browser__browser-panel edge-browser__internal-surface"
          role="document"
          aria-label={panelTitle}
          data-internal-url={BROWSER_INTERNAL_URLS[panel]}
        >
          <aside className="edge-browser__internal-sidebar" aria-label="Tarayıcı dahili sayfaları">
            <div className="edge-browser__internal-sidebar-heading">
              <Globe2 size={17} />
              <span>
                <strong>Eon</strong>
                <small>Dahili sayfalar</small>
              </span>
            </div>
            <nav className="edge-browser__internal-nav">
              <button
                type="button"
                className={panel === 'settings' ? 'is-active' : ''}
                onClick={() => { if (panel !== 'settings') void togglePanel('settings') }}
              >
                <Settings2 size={15} />
                <span>Ayarlar</span>
              </button>
              <button
                type="button"
                className={panel === 'history' ? 'is-active' : ''}
                onClick={() => { if (panel !== 'history') void togglePanel('history') }}
              >
                <History size={15} />
                <span>Geçmiş</span>
              </button>
              <button
                type="button"
                className={panel === 'downloads' ? 'is-active' : ''}
                onClick={() => { if (panel !== 'downloads') void togglePanel('downloads') }}
              >
                <Download size={15} />
                <span>İndirmeler</span>
              </button>
              <button
                type="button"
                className={panel === 'permissions' ? 'is-active' : ''}
                onClick={() => { if (panel !== 'permissions') void togglePanel('permissions') }}
              >
                <ShieldCheck size={15} />
                <span>Site izinleri</span>
              </button>
              <button
                type="button"
                className={panel === 'extensions' ? 'is-active' : ''}
                onClick={() => { if (panel !== 'extensions') void togglePanel('extensions') }}
              >
                <Puzzle size={15} />
                <span>Eklentiler</span>
                {(browserFeatures?.extensionCount ?? 0) > 0 && <small>{browserFeatures?.extensionCount}</small>}
              </button>
            </nav>
          </aside>

          <main className="edge-browser__internal-page">
          <div className="edge-browser__section-title">
            <div className="edge-browser__panel-header-left">
              <h2>{panelTitle}</h2>
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
              <button type="button" onClick={() => setPanel(null)} aria-label="Dahili sayfayı kapat">
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

          {panel === 'settings' && (
            <div className="edge-browser__settings-panel">
              <section className="edge-browser__settings-card edge-browser__settings-card--featured">
                <div className="edge-browser__settings-card-icon">
                  <ShieldCheck size={18} />
                </div>
                <div className="edge-browser__settings-card-copy">
                  <strong>Reklam ve izleyici engelleme</strong>
                  <small>
                    {browserFeatures?.adBlockEngine || 'Ghostery · uBlock/EasyList uyumlu'}
                    {browserFeatures?.adBlockEnabled && !browserFeatures?.adBlockReady ? ' · filtreler hazırlanıyor' : ''}
                  </small>
                </div>
                <button
                  type="button"
                  className={`edge-browser__switch ${browserFeatures?.adBlockEnabled ? 'is-on' : ''}`}
                  onClick={() => void toggleAdBlock()}
                  disabled={browserAdminBusy === 'adblock'}
                  role="switch"
                  aria-checked={browserFeatures?.adBlockEnabled === true}
                  aria-label="Reklam engellemeyi aç veya kapat"
                >
                  <span />
                </button>
              </section>

              <section className="edge-browser__settings-group">
                <div className="edge-browser__settings-group-heading">
                  <strong>Başlangıç ve arama</strong>
                  <small>Adres çubuğu ve yeni sekme davranışı</small>
                </div>
                <label className="edge-browser__settings-field">
                  <span>Varsayılan arama motoru</span>
                  <select
                    value={browserPreferences.searchEngine}
                    onChange={(event) => updateBrowserPreferences({ searchEngine: event.target.value as BrowserSearchEngine })}
                  >
                    <option value="google">Google</option>
                    <option value="duckduckgo">DuckDuckGo</option>
                    <option value="brave">Brave Search</option>
                    <option value="bing">Bing</option>
                  </select>
                </label>
                <label className="edge-browser__settings-field">
                  <span>Ana sayfa</span>
                  <input
                    type="url"
                    defaultValue={browserPreferences.homePage}
                    placeholder="https://www.google.com/"
                    onBlur={(event) => {
                      const normalized = normalizeBrowserInput(event.currentTarget.value || DEFAULT_BROWSER_HOME_URL, browserPreferences.searchEngine)
                      updateBrowserPreferences({ homePage: normalized })
                      event.currentTarget.value = normalized
                    }}
                  />
                </label>
                <label className="edge-browser__settings-field">
                  <span>Varsayılan yakınlaştırma</span>
                  <select
                    value={browserPreferences.defaultZoom}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      updateBrowserPreferences({ defaultZoom: next })
                      setActiveZoom(next)
                    }}
                  >
                    <option value={0.75}>%75</option>
                    <option value={0.9}>%90</option>
                    <option value={1}>%100</option>
                    <option value={1.1}>%110</option>
                    <option value={1.25}>%125</option>
                    <option value={1.5}>%150</option>
                  </select>
                </label>
              </section>

              <section className="edge-browser__settings-group">
                <div className="edge-browser__settings-group-heading">
                  <strong>Gizlilik ve site verileri</strong>
                  <small>{permissionRecords.length} kayıtlı site izni</small>
                </div>
                <div className="edge-browser__settings-actions-grid">
                  <button type="button" onClick={() => void clearBrowserStorage('cache')} disabled={browserAdminBusy !== null}>
                    Önbelleği temizle
                  </button>
                  <button type="button" onClick={() => void clearBrowserStorage('cookies')} disabled={browserAdminBusy !== null}>
                    Çerezleri temizle
                  </button>
                  <button type="button" onClick={() => void clearBrowserStorage('all')} disabled={browserAdminBusy !== null}>
                    Tüm site verileri
                  </button>
                  <button type="button" onClick={() => void clearAllPermissions()} disabled={browserAdminBusy !== null || permissionRecords.length === 0}>
                    Site izinlerini sıfırla
                  </button>
                </div>
              </section>

              <button
                type="button"
                className="edge-browser__settings-link-row"
                onClick={() => void togglePanel('extensions')}
              >
                <Puzzle size={16} />
                <span>
                  <strong>Eklentileri yönet</strong>
                  <small>{browserFeatures?.extensionCount ?? 0} etkin Chrome eklentisi</small>
                </span>
                <ChevronRight size={15} />
              </button>

              <button
                type="button"
                className="edge-browser__settings-link-row"
                onClick={() => void togglePanel('permissions')}
              >
                <ShieldCheck size={16} />
                <span>
                  <strong>Site izinlerini yönet</strong>
                  <small>{permissionRecords.length} kayıtlı karar</small>
                </span>
                <ChevronRight size={15} />
              </button>
            </div>
          )}

          {panel === 'permissions' && (
            <div className="edge-browser__permissions-panel">
              <section className="edge-browser__settings-group edge-browser__permissions-summary">
                <div className="edge-browser__settings-group-heading">
                  <strong>Site izinleri</strong>
                  <small>Kamera, mikrofon, bildirim, konum ve diğer site izinleri burada yönetilir.</small>
                </div>
                <button
                  type="button"
                  className="edge-browser__permissions-clear-all"
                  onClick={() => void clearAllPermissions()}
                  disabled={browserAdminBusy !== null || permissionRecords.length === 0}
                >
                  <Trash2 size={14} />
                  Tüm kararları sıfırla
                </button>
              </section>

              <div className="edge-browser__permissions-list">
                {permissionRecords.length > 0 ? permissionRecords.map((record) => (
                  <article key={`${record.origin}:${record.permission}`} className="edge-browser__permission-row">
                    <div className="edge-browser__permission-row-icon">
                      <ShieldCheck size={16} />
                    </div>
                    <div className="edge-browser__permission-row-copy">
                      <strong>{hostnameFromUrl(record.origin)}</strong>
                      <small>{record.origin}</small>
                      <span>{record.permission}</span>
                    </div>
                    <span className={`edge-browser__permission-decision edge-browser__permission-decision--${record.decision}`}>
                      {record.decision === 'allow' ? 'İzin verildi' : 'Engellendi'}
                    </span>
                    <button
                      type="button"
                      className="edge-browser__permission-reset"
                      onClick={() => void clearPermissionRecord(record)}
                      disabled={browserAdminBusy !== null}
                    >
                      Sıfırla
                    </button>
                  </article>
                )) : (
                  <div className="edge-browser__extension-empty">
                    <ShieldCheck size={20} />
                    <strong>Kayıtlı site izni yok</strong>
                    <span>Bir site izin istediğinde verdiğiniz kararlar burada görünecek.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {panel === 'extensions' && (
            <div className="edge-browser__extensions-panel">
              <section className="edge-browser__extension-install-card">
                <div className="edge-browser__settings-group-heading">
                  <strong>Chrome Web Mağazası'ndan yükle</strong>
                  <small>Mağaza bağlantısını veya 32 karakterli eklenti kimliğini yapıştırın.</small>
                </div>
                <div className="edge-browser__extension-install-row">
                  <input
                    value={extensionStoreInput}
                    onChange={(event) => setExtensionStoreInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void installStoreExtension()
                    }}
                    placeholder="chromewebstore.google.com/... veya eklenti kimliği"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => void installStoreExtension()}
                    disabled={!extensionStoreInput.trim() || browserAdminBusy !== null}
                  >
                    Yükle
                  </button>
                </div>
                <div className="edge-browser__extension-secondary-actions">
                  <button type="button" onClick={() => void installUnpackedExtension()} disabled={browserAdminBusy !== null}>
                    <FolderOpen size={14} />
                    Paketlenmemiş eklenti
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPanel(null)
                      void openTab('https://chromewebstore.google.com/')
                    }}
                  >
                    <ExternalLink size={14} />
                    Chrome Web Mağazası
                  </button>
                </div>
                <p className="edge-browser__extension-note">
                  Eon Chromium tabanlıdır. Electron yalnızca Chrome Extension API'lerinin desteklediği bölümünü sağlar; bazı eklentiler Chrome'daki tüm özellikleriyle çalışmayabilir.
                </p>
              </section>

              <div className="edge-browser__extensions-list">
                {(browserFeatures?.extensions.length ?? 0) > 0 ? browserFeatures?.extensions.map((extension) => (
                  <article key={extension.id} className="edge-browser__extension-row">
                    <div className="edge-browser__extension-icon">
                      <Puzzle size={16} />
                    </div>
                    <div className="edge-browser__extension-copy">
                      <strong>{extension.name}</strong>
                      <small>
                        v{extension.version || '—'} · {extension.source === 'store' ? 'Chrome Web Mağazası' : 'Yerel'}
                      </small>
                      {extension.description ? <p>{extension.description}</p> : null}
                    </div>
                    <div className="edge-browser__extension-actions">
                      {extension.hasOptions && extension.enabled && (
                        <button
                          type="button"
                          onClick={() => void desktop.browser.openExtensionOptions(extension.id).catch((cause) => setError(errorMessage(cause, 'Eklenti ayarları açılamadı.')))}
                        >
                          Ayarlar
                        </button>
                      )}
                      <button
                        type="button"
                        className={`edge-browser__switch edge-browser__switch--compact ${extension.enabled ? 'is-on' : ''}`}
                        role="switch"
                        aria-checked={extension.enabled}
                        aria-label={`${extension.name} eklentisini ${extension.enabled ? 'kapat' : 'aç'}`}
                        onClick={() => void setManagedExtensionEnabled(extension.id, !extension.enabled)}
                        disabled={browserAdminBusy !== null}
                      >
                        <span />
                      </button>
                      <button
                        type="button"
                        className="edge-browser__extension-remove"
                        onClick={() => void removeManagedExtension(extension.id)}
                        disabled={browserAdminBusy !== null}
                        aria-label={`${extension.name} eklentisini kaldır`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                )) : (
                  <div className="edge-browser__extension-empty">
                    <Puzzle size={20} />
                    <strong>Henüz eklenti yok</strong>
                    <span>Chrome Web Mağazası bağlantısıyla veya yerel bir eklenti klasörüyle başlayabilirsiniz.</span>
                  </div>
                )}
              </div>
            </div>
          )}
          </main>
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

      {/* The measured native surface keeps the original full-width layout. */}
      <div ref={nativeSurfaceRef} className="edge-browser__content" data-browser-native-surface>
        {nativeSurfaceError && active?.url ? (
          <div className="edge-browser__load-state edge-browser__load-state--error" role="alert">
            <div className="edge-browser__load-state-icon" aria-hidden="true">
              <Globe2 size={22} />
            </div>
            <strong>Sayfa açılamadı</strong>
            <span>{active.error}</span>
            <button
              type="button"
              onClick={() => void navigateTab(active.id, active.url || address)}
            >
              Yeniden dene
            </button>
          </div>
        ) : nativeSurfaceLoading ? (
          <div className="edge-browser__load-state" role="status" aria-live="polite">
            <div className="edge-browser__load-state-icon" aria-hidden="true">
              <LoaderCircle className="edge-browser__load-state-spinner" size={22} />
            </div>
            <strong>{nativeRestoreReady ? 'Sayfa yükleniyor' : 'Tarayıcı hazırlanıyor'}</strong>
            <span>{active?.url ? hostnameFromUrl(active.url) : 'Güvenli görünüm hazırlanıyor'}</span>
          </div>
        ) : null}

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
    </TooltipProvider>
  )
}
