import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left.js'
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right.js'
import Download from 'lucide-react/dist/esm/icons/download.js'
import Globe2 from 'lucide-react/dist/esm/icons/globe-2.js'
import History from 'lucide-react/dist/esm/icons/history.js'
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle.js'
import Pin from 'lucide-react/dist/esm/icons/pin.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check.js'
import Star from 'lucide-react/dist/esm/icons/star.js'
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js'
import Volume2 from 'lucide-react/dist/esm/icons/volume-2.js'
import VolumeX from 'lucide-react/dist/esm/icons/volume-x.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { BROWSER_EVENTS, desktop, isElectronRuntime, type BrowserBounds, type BrowserDownloadItem, type BrowserHistoryItem, type BrowserMediaProjection, type BrowserPermissionRequest, type BrowserTabProjection } from '@/lib/desktop'
import { addRecentlyClosed, BROWSER_DATA_EVENT, BROWSER_NAVIGATION_EVENT, consumeBrowserNavigation, hostnameFromUrl, loadFavorites, normalizeBrowserInput, relativeTime, saveFavorites, type BrowserFavorite } from './browserData'
import { applyTabProjectionState, canStartNativeRestore, closeTabState, faviconForUrl, makeTab, migrateBrowserState, nativeRestoreTasks, nativeViewAction, openTabState, prepareNewTabNavigation, resolveOptimisticClose, selectTabState, serializeBrowserState, type BrowserState, type BrowserTab } from './browserState'

interface BrowserPageProps {
  isVisible: boolean
  theme?: 'light' | 'dark'
  chromeMode?: 'home' | 'browser'
  onEnterBrowser?: () => void
  onNoTabs?: () => void
  onExecuteCommand?: (query: string) => void
}
type BrowserPanel = 'history' | 'downloads' | null
const TABS_KEY = 'minios_browser_tabs_v2'
const ACTIVE_KEY = 'minios_browser_active_tab_v2'

function loadState(): BrowserState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TABS_KEY) || '[]')
    return migrateBrowserState(parsed, localStorage.getItem(ACTIVE_KEY))
  } catch {
    return { tabs: [], activeTabId: null, mediaByTabId: {} }
  }
}

function getBounds(node: HTMLElement | null): BrowserBounds | null {
  if (!node) return null
  const rect = node.getBoundingClientRect()
  return rect.width > 8 && rect.height > 8
    ? { x: Math.max(0, Math.round(rect.left)), y: Math.max(0, Math.round(rect.top)), width: Math.round(rect.width), height: Math.round(rect.height) }
    : null
}

function nextFrame() { return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())) }

async function waitForBounds(node: HTMLElement | null): Promise<BrowserBounds | null> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await nextFrame()
    const bounds = getBounds(node)
    if (bounds) return bounds
  }
  return null
}

function errorMessage(cause: unknown, fallback: string): string {
  if (typeof cause === 'string' && cause.trim()) return cause
  if (cause instanceof Error && cause.message) return cause.message
  if (typeof cause === 'object' && cause !== null && 'message' in cause && typeof cause.message === 'string' && cause.message.trim()) return cause.message
  return fallback
}

function isMissingBrowserTab(cause: unknown) { return errorMessage(cause, '').includes('sekmesi bulunamadı') }

function persist(state: BrowserState) {
  const snapshot = serializeBrowserState(state)
  localStorage.setItem(TABS_KEY, JSON.stringify(snapshot.tabs))
  localStorage.setItem(ACTIVE_KEY, snapshot.activeTabId ?? '')
}

function sessionSnapshot(state: BrowserState) {
  return {
    tabs: state.tabs.map((tab) => ({
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
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

export function BrowserPage({ isVisible, theme = 'light', chromeMode, onEnterBrowser, onNoTabs, onExecuteCommand }: BrowserPageProps) {
  const [state, setState] = useState(loadState)
  const [address, setAddress] = useState('')
  const [favorites, setFavorites] = useState<BrowserFavorite[]>(loadFavorites)
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<BrowserPanel>(null)
  const [history, setHistory] = useState<BrowserHistoryItem[]>([])
  const [clearingHistory, setClearingHistory] = useState(false)
  const [downloads, setDownloads] = useState<BrowserDownloadItem[]>([])
  const [permissionRequest, setPermissionRequest] = useState<BrowserPermissionRequest | null>(null)
  const [browserChromeHost, setBrowserChromeHost] = useState<HTMLElement | null>(null)
  const [nativeRestoreReady, setNativeRestoreReady] = useState(!isElectronRuntime())
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef(state)
  const liveTabIdsRef = useRef(new Set<string>())
  const pendingBrowserActionRef = useRef<{ tabId?: string; url?: string } | null>(null)
  const closePendingRef = useRef(false)
  const restoreStarted = useRef(false)
  const sessionHydrated = useRef(!isElectronRuntime())
  stateRef.current = state
  const active = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null

  const project = useCallback((projection: BrowserTabProjection) => {
    const next = applyTabProjectionState(stateRef.current, projection)
    stateRef.current = next
    setState(next)
  }, [])

  const synchronizeBrowserSurface = useCallback(async (nextState: BrowserState) => {
    if (!isElectronRuntime()) return
    const action = nativeViewAction(nextState)
    if (action.type === 'activate') await desktop.browser.activate(action.tabId, isVisible)
    else await desktop.browser.deactivate()
  }, [isVisible])

  const createBrowserTab = useCallback(async (id: string, url: string) => {
    const bounds = await waitForBounds(hostRef.current)
    if (!bounds) throw new Error('Tarayıcı alanı hazırlanamadı. Lütfen tekrar deneyin.')
    const projection = await desktop.browser.create(id, url, bounds)
    liveTabIdsRef.current.add(id)
    project(projection)
  }, [project])

  const requestBrowserMode = useCallback((action: { tabId?: string; url?: string }) => {
    if (chromeMode !== 'home' || !onEnterBrowser) return false
    pendingBrowserActionRef.current = action
    onEnterBrowser()
    return true
  }, [chromeMode, onEnterBrowser])

  const navigateTab = useCallback(async (id: string, input: string) => {
    const url = normalizeBrowserInput(input)
    const tab = stateRef.current.tabs.find((item) => item.id === id)
    if (!tab) { setError('Sekme bulunamadı.'); return false }
    if (url === 'about:blank') { setError('Bir adres veya arama metni girin.'); return false }
    if (requestBrowserMode({ tabId: id, url })) return true
    try {
      if (!isElectronRuntime()) {
        project({ id, url, title: hostnameFromUrl(url), favicon: faviconForUrl(url), loading: false, canGoBack: false, canGoForward: false, error: null, label: `browser-${id}`, muted: tab.muted === true, pinned: tab.pinned === true })
        return true
      }
      if (!liveTabIdsRef.current.has(id)) await createBrowserTab(id, url)
      else {
        try { await desktop.browser.navigate(id, url) }
        catch (cause) {
          if (!isMissingBrowserTab(cause)) throw cause
          liveTabIdsRef.current.delete(id)
          await createBrowserTab(id, url)
        }
      }
      await desktop.browser.activate(id, isVisible)
      setError(null)
      return true
    } catch (cause) {
      setError(errorMessage(cause, 'Sayfa açılamadı.'))
      return false
    }
  }, [createBrowserTab, isVisible, project, requestBrowserMode])

  const openTab = useCallback(async (url?: string) => {
    if (requestBrowserMode({ url })) return
    const tab = makeTab()
    const previous = stateRef.current
    const prepared = url
      ? prepareNewTabNavigation(previous, tab, normalizeBrowserInput(url))
      : { state: openTabState(previous, tab), tabId: tab.id, url: null }
    stateRef.current = prepared.state
    persist(prepared.state)
    setState(prepared.state)
    if (!prepared.url) {
      await synchronizeBrowserSurface(prepared.state).catch(() => undefined)
      return
    }
    const created = await navigateTab(prepared.tabId, prepared.url)
    if (!created) {
      const restoredState = resolveOptimisticClose(previous, prepared.state, false)
      stateRef.current = restoredState
      persist(restoredState)
      setState(restoredState)
      await synchronizeBrowserSurface(restoredState).catch(() => undefined)
    }
  }, [navigateTab, requestBrowserMode, synchronizeBrowserSurface])

  // Electron owns the persisted session. The localStorage copy is only a fast
  // renderer fallback for browser preview and is never used to create fake pages.
  useEffect(() => {
    if (!isVisible || restoreStarted.current) return
    setNativeRestoreReady(false)
    let cancelled = false
    void (async () => {
      const bounds = await waitForBounds(hostRef.current)
      if (cancelled || !canStartNativeRestore(isVisible, Boolean(bounds), restoreStarted.current)) return
      let nextState = stateRef.current
      if (isElectronRuntime()) {
        const stored = await desktop.browser.getSession().catch(() => ({ tabs: [], activeTabId: null }))
        if (stored.tabs.length) nextState = migrateBrowserState(stored, stored.activeTabId)
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
      setNativeRestoreReady(true)
      await synchronizeBrowserSurface(stateRef.current).catch(() => undefined)
    })()
    return () => { cancelled = true }
  }, [isVisible, navigateTab, synchronizeBrowserSurface])

  useEffect(() => {
    if (!isVisible || chromeMode !== 'browser' || !nativeRestoreReady) return
    const pending = pendingBrowserActionRef.current
    if (!pending) return
    const frame = window.requestAnimationFrame(() => {
      pendingBrowserActionRef.current = null
      if (pending.tabId && pending.url) void navigateTab(pending.tabId, pending.url)
      else if (pending.url) void openTab(pending.url)
      else void openTab()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [chromeMode, isVisible, navigateTab, nativeRestoreReady, openTab])

  // A browser surface without a real web tab is not a second home page. When
  // the last tab is gone, return ownership to the application home screen.
  useEffect(() => {
    if (chromeMode !== 'browser' || !nativeRestoreReady || !restoreStarted.current || closePendingRef.current || panel !== null) return
    if (state.tabs.length > 0) return
    onNoTabs?.()
  }, [chromeMode, nativeRestoreReady, onNoTabs, panel, state.tabs.length])

  useEffect(() => {
    if (!sessionHydrated.current) return
    persist(state)
    if (isElectronRuntime()) void desktop.browser.saveSession(sessionSnapshot(state)).catch(() => undefined)
  }, [state])

  useEffect(() => setAddress(active?.url ?? ''), [active?.id, active?.url])

  const chromeHostId = chromeMode === 'browser'
    ? 'browser-titlebar-slot'
    : chromeMode === 'home'
      ? 'browser-home-titlebar-slot'
      : null

  useEffect(() => {
    const hostId = chromeHostId
    if (!hostId || typeof document === 'undefined') {
      setBrowserChromeHost(null)
      return
    }

    let cancelled = false
    const frame = window.requestAnimationFrame(() => {
      if (!cancelled) setBrowserChromeHost(document.getElementById(hostId))
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
    }
  }, [chromeHostId])

  useEffect(() => {
    const created = (projection: BrowserTabProjection) => { liveTabIdsRef.current.add(projection.id); project(projection) }
    const destroyed = (projection: BrowserTabProjection) => {
      liveTabIdsRef.current.delete(projection.id)
      const next = closeTabState(stateRef.current, projection.id)
      stateRef.current = next
      setState(next)
    }
    const mediaUpdated = (media: BrowserMediaProjection) => setState((current) => ({ ...current, mediaByTabId: { ...current.mediaByTabId, [media.tabId]: media } }))
    const openRequest = (payload: { url?: string } | string) => {
      const url = typeof payload === 'string' ? payload : payload?.url
      if (url) void openTab(url)
    }
    const rendererFailed = (payload: { projection?: BrowserTabProjection; reason?: string }) => {
      if (payload?.projection) project(payload.projection)
      if (payload?.projection?.id === stateRef.current.activeTabId) setError(payload.reason || payload.projection.error || 'Sekme renderer işlemi başarısız oldu.')
    }
    const permission = (request: BrowserPermissionRequest) => setPermissionRequest(request)
    const download = (item: BrowserDownloadItem) => setDownloads((current) => [item, ...current.filter((entry) => entry.id !== item.id)])
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
      desktop.browser.on<{ projection?: BrowserTabProjection; reason?: string }>(BROWSER_EVENTS.rendererFailed, rendererFailed),
      desktop.browser.on<BrowserPermissionRequest>(BROWSER_EVENTS.permissionRequest, permission),
      desktop.browser.on<BrowserDownloadItem>(BROWSER_EVENTS.downloadUpdated, download),
      desktop.browser.on<BrowserHistoryItem | null>(BROWSER_EVENTS.historyUpdated, historyUpdate),
    ]
    return () => stops.forEach((stop) => stop())
  }, [openTab, project])

  useEffect(() => {
    const sync = () => setFavorites(loadFavorites())
    const requested = (event: Event) => { const url = (event as CustomEvent<{ url?: string }>).detail?.url; if (url) void openTab(url) }
    window.addEventListener(BROWSER_DATA_EVENT, sync)
    window.addEventListener(BROWSER_NAVIGATION_EVENT, requested)
    const pending = consumeBrowserNavigation()
    if (pending) void openTab(pending)
    return () => { window.removeEventListener(BROWSER_DATA_EVENT, sync); window.removeEventListener(BROWSER_NAVIGATION_EVENT, requested) }
  }, [openTab])

  useEffect(() => {
    const update = () => {
      const bounds = getBounds(hostRef.current)
      if (bounds && active?.url && liveTabIdsRef.current.has(active.id)) void desktop.browser.setBounds(active.id, bounds).catch(() => undefined)
    }
    const observer = new ResizeObserver(update)
    if (hostRef.current) observer.observe(hostRef.current)
    window.addEventListener('resize', update)
    return () => { observer.disconnect(); window.removeEventListener('resize', update) }
  }, [active?.id, active?.url])

  useEffect(() => { void desktop.browser.setVisible(isVisible && panel === null).catch(() => undefined) }, [isVisible, panel])
  useEffect(() => { void desktop.browser.setTheme(theme).catch(() => undefined) }, [theme])
  useEffect(() => {
    if (!isElectronRuntime()) return
    void desktop.browser.syncMetadata().catch(() => undefined)
    const timer = window.setInterval(() => void desktop.browser.syncMetadata().catch(() => undefined), 1_500)
    return () => window.clearInterval(timer)
  }, [])

  async function select(id: string) {
    const next = selectTabState(stateRef.current, id)
    if (next === stateRef.current) return
    stateRef.current = next
    setState(next)
    await synchronizeBrowserSurface(next).catch(() => undefined)
  }

  async function close(id: string) {
    const tab = stateRef.current.tabs.find((item) => item.id === id)
    if (!tab) return
    closePendingRef.current = true
    const live = liveTabIdsRef.current.has(id)
    const previous = stateRef.current
    const next = closeTabState(previous, id)
    persist(next)
    stateRef.current = next
    setState(next)
    if (!live) {
      addRecentlyClosed(tab.title, tab.url || '', tab.favicon)
      closePendingRef.current = false
      if (next.tabs.length === 0 && chromeMode === 'browser') onNoTabs?.()
      await synchronizeBrowserSurface(next).catch(() => undefined)
      return
    }
    try {
      await desktop.browser.close(id)
      liveTabIdsRef.current.delete(id)
      if (tab.url) addRecentlyClosed(tab.title, tab.url, tab.favicon)
      closePendingRef.current = false
      if (next.tabs.length === 0 && chromeMode === 'browser') onNoTabs?.()
      await synchronizeBrowserSurface(next).catch(() => undefined)
    } catch (cause) {
      closePendingRef.current = false
      const restoredState = resolveOptimisticClose(previous, next, false)
      stateRef.current = restoredState
      persist(restoredState)
      setState(restoredState)
      setError(errorMessage(cause, 'Sekme kapatılamadı.'))
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const query = address.trim()
    if (!query) return
    const lower = query.toLocaleLowerCase('tr-TR')
    const isCommand = lower.startsWith('/')
      || lower.startsWith('kapat')
      || lower.startsWith('alarm')
      || lower.startsWith('not')
      || lower.startsWith('paylas')
      || lower.startsWith('paylaş')
    if (isCommand && onExecuteCommand) {
      setAddress('')
      onExecuteCommand(query)
      return
    }
    if (active) void navigateTab(active.id, query)
    else void openTab(query)
  }

  function toggleFavorite() {
    if (!active?.url) return
    const found = favorites.find((item) => item.url === active.url)
    const next = found
      ? favorites.filter((item) => item.id !== found.id)
      : [...favorites, { id: crypto.randomUUID(), name: active.title, url: active.url, color: 'var(--color-browser-blue)', iconText: active.title.slice(0, 2).toUpperCase(), favicon: active.favicon }]
    saveFavorites(next)
    setFavorites(next)
  }

  async function togglePanel(next: Exclude<BrowserPanel, null>) {
    if (chromeMode === 'home' && onEnterBrowser) onEnterBrowser()
    if (panel === next) { setPanel(null); return }
    setPanel(next)
    if (next === 'history') setHistory(await desktop.browser.listHistory().catch(() => []))
    else setDownloads(await desktop.browser.listDownloads().catch(() => []))
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
    await desktop.browser.setPermission({ origin: permissionRequest.origin, permission: permissionRequest.permission, decision, requestId: permissionRequest.requestId }).catch(() => undefined)
    setPermissionRequest(null)
  }

  const isFavorite = Boolean(active?.url && favorites.some((item) => item.url === active.url))
  const browserThemeClass = theme === 'dark' ? 'edge-browser--dark' : 'edge-browser--light'
  const shouldPortalChrome = chromeHostId !== null && browserChromeHost?.id === chromeHostId

  const browserChrome = (
    <div className={`edge-browser__chrome ${browserThemeClass} ${shouldPortalChrome ? 'edge-browser__chrome--titlebar' : ''}`} style={{ colorScheme: theme }}>
      <div className="edge-browser__tabs" role="tablist" aria-label="Tarayıcı sekmeleri">
        <div className="edge-browser__tab-scroll">
          {state.tabs.map((tab) => {
            const media = state.mediaByTabId[tab.id]
            const isMuted = tab.muted === true
            return <button key={tab.id} type="button" role="tab" aria-selected={tab.id === active?.id} className={`edge-browser__tab ${tab.id === active?.id ? 'edge-browser__tab--active' : ''}`} onClick={() => void select(tab.id)} onContextMenu={(event) => { event.preventDefault(); void desktop.browser.showTabMenu(tab.id) }}>
              {tab.favicon ? <img src={tab.favicon} alt="" /> : <Globe2 size={12} />}
              <span>{tab.title}</span>
              {tab.pinned ? <Pin size={11} aria-label="Sabitlenmiş sekme" /> : null}
              {media?.playing ? <span className="edge-browser__tab-media" title={isMuted ? 'Sessiz medya' : 'Medya oynatılıyor'} onClick={(event) => { event.stopPropagation(); void desktop.browser.setMuted(tab.id, !isMuted) }}>{isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}</span> : null}
              {tab.loading ? <LoaderCircle className="edge-browser__spinner" size={11} /> : null}
              <span role="button" tabIndex={0} className="edge-browser__tab-close" aria-label={`${tab.title} sekmesini kapat`} onClick={(event) => { event.stopPropagation(); void close(tab.id) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void close(tab.id) } }}><X size={11} /></span>
            </button>
          })}
        </div>
        <button type="button" className="edge-browser__new-tab" onClick={() => void openTab()} aria-label="Yeni sekme"><Plus size={14} /></button>
      </div>
      <div className="edge-browser__toolbar">
        <div className="edge-browser__navigation-tools">
          <button type="button" className="edge-browser__tool" disabled={!active?.canGoBack} onClick={() => active && void desktop.browser.back(active.id)} aria-label="Geri"><ArrowLeft size={15} /></button>
          <button type="button" className="edge-browser__tool" disabled={!active?.canGoForward} onClick={() => active && void desktop.browser.forward(active.id)} aria-label="İleri"><ArrowRight size={15} /></button>
          <button type="button" className="edge-browser__tool" disabled={!active?.url} onClick={() => active && void desktop.browser.reload(active.id)} aria-label="Yenile"><RefreshCw size={14} /></button>
        </div>
        <form className="edge-browser__address" onSubmit={submit}><Search size={14} /><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Web'de ara veya adres yaz" aria-label="Adres ve arama" /><button type="button" onClick={toggleFavorite} className={isFavorite ? 'edge-browser__favorite--active' : ''} aria-label={isFavorite ? 'Favorilerden kaldır' : 'Favorilere ekle'}><Star size={14} fill={isFavorite ? 'currentColor' : 'none'} /></button></form>
        <div className="edge-browser__toolbar-actions">
          <button type="button" className={`edge-browser__tool ${panel === 'history' ? 'edge-browser__tool--active' : ''}`} onClick={() => void togglePanel('history')} aria-label="Geçmiş"><History size={14} /></button>
          <button type="button" className={`edge-browser__tool ${panel === 'downloads' ? 'edge-browser__tool--active' : ''}`} onClick={() => void togglePanel('downloads')} aria-label="İndirmeler"><Download size={14} /></button>
        </div>
      </div>
    </div>
  )

  return <>
    {shouldPortalChrome ? createPortal(browserChrome, browserChromeHost) : null}
    <section className={`edge-browser ${browserThemeClass} ${shouldPortalChrome ? 'edge-browser--chrome-external' : ''}`} style={{ colorScheme: theme }} aria-label="Gömülü tarayıcı">
    {!shouldPortalChrome ? browserChrome : null}
    {permissionRequest ? <div className="edge-browser__permission" role="dialog" aria-label="Site izni"><ShieldCheck size={16} /><span><strong>{hostnameFromUrl(permissionRequest.origin)}</strong> {permissionRequest.permission} izni istiyor.</span><button type="button" onClick={() => void decidePermission('deny')}>Reddet</button><button type="button" onClick={() => void decidePermission('allow')}>İzin ver</button></div> : null}
    {panel ? <div className="edge-browser__browser-panel" role="dialog" aria-label={panel === 'history' ? 'Tarama geçmişi' : 'İndirmeler'}>
      <div className="edge-browser__section-title"><h2>{panel === 'history' ? 'Geçmiş' : 'İndirmeler'}</h2><div className="edge-browser__section-title-actions">{panel === 'history' ? <button type="button" className="edge-browser__clear-history" onClick={() => void clearHistory()} disabled={clearingHistory || history.length === 0} aria-label="Geçmişi temizle" title="Geçmişi temizle" aria-busy={clearingHistory}><Trash2 size={14} /><span>{clearingHistory ? 'Temizleniyor…' : 'Temizle'}</span></button> : null}<button type="button" onClick={() => setPanel(null)} aria-label="Paneli kapat"><X size={14} /></button></div></div>
      {panel === 'history' ? (history.length ? history.map((item) => <button key={item.id} type="button" className="edge-browser__recent-row" onClick={() => { void openTab(item.url); setPanel(null) }}>{item.favicon ? <img src={item.favicon} alt="" /> : <Globe2 size={14} />}<span><strong>{item.title}</strong><small>{hostnameFromUrl(item.url)}</small></span><time>{relativeTime(item.visitedAt)}</time></button>) : <p className="edge-browser__empty">Henüz geçmiş kaydı yok.</p>) : (downloads.length ? downloads.map((item) => <div key={item.id} className="edge-browser__download-row"><span><strong>{item.filename}</strong><small>{item.state === 'progressing' ? `${formatBytes(item.receivedBytes)} / ${formatBytes(item.totalBytes)}` : item.state}</small></span><div><button type="button" onClick={() => void desktop.browser.openDownload(item.id)} disabled={item.state !== 'completed'}>Aç</button><button type="button" onClick={() => void desktop.browser.showDownload(item.id)}>Klasör</button></div></div>) : <p className="edge-browser__empty">Henüz indirme yok.</p>)}
    </div> : null}
    {error || active?.error ? <div className="edge-browser__error" role="alert">{error || active?.error}<button type="button" onClick={() => active && void navigateTab(active.id, active.url || address)}>Yeniden dene</button></div> : null}
    <div className="edge-browser__content">
      <div ref={hostRef} className={`edge-browser__native-host ${active?.url ? '' : 'edge-browser__native-host--inactive'}`} />
      {active?.url && !isElectronRuntime() ? <div className="edge-browser__web-fallback"><Globe2 size={30} /><p>Gömülü tarayıcı Electron masaüstü sürümünde çalışır.</p></div> : null}
    </div>
    </section>
  </>
}
