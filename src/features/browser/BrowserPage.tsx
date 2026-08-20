import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left.js'
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right.js'
import Globe2 from 'lucide-react/dist/esm/icons/globe-2.js'
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Star from 'lucide-react/dist/esm/icons/star.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { BROWSER_EVENTS, desktop, isTauriRuntime, type BrowserBounds, type BrowserMediaProjection, type BrowserTabProjection } from '@/lib/desktop'
import { addRecentlyClosed, BROWSER_DATA_EVENT, BROWSER_NAVIGATION_EVENT, consumeBrowserNavigation, hostnameFromUrl, loadFavorites, loadRecentlyClosed, normalizeBrowserInput, relativeTime, saveFavorites, type BrowserFavorite, type BrowserRecentItem } from './browserData'
import { applyTabProjectionState, canStartNativeRestore, closeTabState, faviconForUrl, makeTab, migrateBrowserState, nativeNavigationAction, nativeRestoreTasks, nativeViewAction, openTabState, prepareNewTabNavigation, resolveOptimisticClose, selectTabState, serializeBrowserState, type BrowserState, type BrowserTab } from './browserState'

interface BrowserPageProps { isVisible: boolean; theme?: 'light' | 'dark' }
const TABS_KEY = 'minios_browser_tabs_v2'
const ACTIVE_KEY = 'minios_browser_active_tab_v2'

function loadState(): BrowserState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TABS_KEY) || '[]')
    return migrateBrowserState(parsed, localStorage.getItem(ACTIVE_KEY))
  } catch { return { tabs: [], activeTabId: null, mediaByTabId: {} } }
}
function getBounds(node: HTMLElement | null): BrowserBounds | null { if (!node) return null; const r = node.getBoundingClientRect(); return r.width > 8 && r.height > 8 ? { x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top)), width: Math.round(r.width), height: Math.round(r.height) } : null }
function nextFrame() { return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())) }
async function waitForBounds(node: HTMLElement | null): Promise<BrowserBounds | null> { for (let attempt = 0; attempt < 60; attempt += 1) { await nextFrame(); const bounds = getBounds(node); if (bounds) return bounds } return null }
function errorMessage(cause: unknown, fallback: string): string {
  if (typeof cause === 'string' && cause.trim()) return cause
  if (cause instanceof Error && cause.message) return cause.message
  if (typeof cause === 'object' && cause !== null && 'message' in cause && typeof cause.message === 'string' && cause.message.trim()) return cause.message
  return fallback
}
function isMissingNativeTab(cause: unknown) { return errorMessage(cause, '').includes('sekmesi bulunamadı') }

function persist(state: BrowserState) { const snapshot = serializeBrowserState(state); localStorage.setItem(TABS_KEY, JSON.stringify(snapshot.tabs)); localStorage.setItem(ACTIVE_KEY, snapshot.activeTabId ?? '') }

export function BrowserPage({ isVisible, theme = 'light' }: BrowserPageProps) {
  const [state, setState] = useState(loadState); const [address, setAddress] = useState(''); const [favorites, setFavorites] = useState<BrowserFavorite[]>(loadFavorites); const [recents, setRecents] = useState<BrowserRecentItem[]>(loadRecentlyClosed); const [error, setError] = useState<string | null>(null)
  const hostRef = useRef<HTMLDivElement>(null); const stateRef = useRef(state); const nativeTabIdsRef = useRef(new Set<string>()); const restoreStarted = useRef(false); stateRef.current = state
  const active = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null
  const project = useCallback((p: BrowserTabProjection) => {
    // A create command resolves with the projection before its event listener is required.
    // Update the ref too so an explicit follow-up activation cannot observe a blank tab.
    const next = applyTabProjectionState(stateRef.current, p)
    stateRef.current = next
    setState(next)
  }, [])
  const synchronizeNativeView = useCallback(async (nextState: BrowserState) => {
    if (!isTauriRuntime()) return
    const action = nativeViewAction(nextState)
    if (action.type === 'activate') await desktop.browser.activate(action.tabId, isVisible)
    else await desktop.browser.deactivate()
  }, [isVisible])
  const createNativeTab = useCallback(async (id: string, url: string) => {
    const bounds = await waitForBounds(hostRef.current)
    if (!bounds) throw new Error('Tarayıcı alanı hazırlanamadı. Lütfen tekrar deneyin.')
    const projection = await desktop.browser.create(id, url, bounds)
    nativeTabIdsRef.current.add(id)
    project(projection)
  }, [project])
  const navigateTab = useCallback(async (id: string, input: string) => {
    const url = normalizeBrowserInput(input); const tab = stateRef.current.tabs.find((t) => t.id === id); if (!tab) { setError('Sekme bulunamadı.'); return false }
    try { if (!isTauriRuntime()) { project({ id, url, title: hostnameFromUrl(url), favicon: faviconForUrl(url), loading: false, canGoBack: false, canGoForward: false, error: null, label: `browser-${id}` }); return true } if (nativeNavigationAction(tab, nativeTabIdsRef.current.has(id)) === 'create') await createNativeTab(id, url); else { try { await desktop.browser.navigate(id, url) } catch (cause) { if (!isMissingNativeTab(cause)) throw cause; nativeTabIdsRef.current.delete(id); await createNativeTab(id, url) } } await desktop.browser.activate(id, isVisible); setError(null); return true } catch (cause) { setError(errorMessage(cause, 'Sayfa açılamadı.')); return false }
  }, [createNativeTab, isVisible, project])
  const openTab = useCallback(async (url?: string) => { const tab = makeTab(); const previous = stateRef.current; const prepared = url ? prepareNewTabNavigation(previous, tab, normalizeBrowserInput(url)) : { state: openTabState(previous, tab), tabId: tab.id, url: null }; stateRef.current = prepared.state; persist(prepared.state); setState(prepared.state); if (!prepared.url) { await synchronizeNativeView(prepared.state).catch(() => undefined); return } const created = await navigateTab(prepared.tabId, prepared.url); if (!created) { const restoredState = resolveOptimisticClose(previous, prepared.state, false); stateRef.current = restoredState; persist(restoredState); setState(restoredState); await synchronizeNativeView(restoredState).catch(() => undefined) } }, [navigateTab, synchronizeNativeView])

  // This persistently mounted BrowserPage restores once only after its native host is visible.
  useEffect(() => { if (!isVisible || restoreStarted.current) return; let cancelled = false; void (async () => { const bounds = await waitForBounds(hostRef.current); if (cancelled || !canStartNativeRestore(isVisible, Boolean(bounds), restoreStarted.current)) return; restoreStarted.current = true; for (const task of nativeRestoreTasks(stateRef.current)) await navigateTab(task.tabId, task.url); await synchronizeNativeView(stateRef.current).catch(() => undefined) })(); return () => { cancelled = true } }, [isVisible, navigateTab, synchronizeNativeView])
  useEffect(() => { persist(state) }, [state.activeTabId, state.tabs])
  useEffect(() => setAddress(active?.url ?? ''), [active?.id, active?.url])
  useEffect(() => { const created = (projection: BrowserTabProjection) => { nativeTabIdsRef.current.add(projection.id); project(projection) }; const destroyed = (projection: BrowserTabProjection) => { nativeTabIdsRef.current.delete(projection.id); setState((s) => closeTabState(s, projection.id)) }; const stops = [desktop.browser.on<BrowserTabProjection>(BROWSER_EVENTS.tabCreated, created), desktop.browser.on<BrowserTabProjection>(BROWSER_EVENTS.tabUpdated, project), desktop.browser.on<BrowserTabProjection>(BROWSER_EVENTS.tabDestroyed, destroyed), desktop.browser.on<BrowserMediaProjection>(BROWSER_EVENTS.mediaUpdated, (media) => setState((s) => ({ ...s, mediaByTabId: { ...s.mediaByTabId, [media.tabId]: media } }))), desktop.browser.on<string>(BROWSER_EVENTS.openRequest, openTab)]; return () => stops.forEach((stop) => stop()) }, [openTab, project])
  useEffect(() => { const sync = () => { setFavorites(loadFavorites()); setRecents(loadRecentlyClosed()) }; const requested = (e: Event) => { const url = (e as CustomEvent<{ url?: string }>).detail?.url; if (url) openTab(url) }; window.addEventListener(BROWSER_DATA_EVENT, sync); window.addEventListener(BROWSER_NAVIGATION_EVENT, requested); const pending = consumeBrowserNavigation(); if (pending) openTab(pending); return () => { window.removeEventListener(BROWSER_DATA_EVENT, sync); window.removeEventListener(BROWSER_NAVIGATION_EVENT, requested) } }, [openTab])
  useEffect(() => { const update = () => { const bounds = getBounds(hostRef.current); if (bounds && active?.url) void desktop.browser.setBounds(active.id, bounds).catch(() => undefined) }; const observer = new ResizeObserver(update); if (hostRef.current) observer.observe(hostRef.current); window.addEventListener('resize', update); return () => { observer.disconnect(); window.removeEventListener('resize', update) } }, [active?.id, active?.url])
  useEffect(() => { void desktop.browser.setVisible(isVisible).catch(() => undefined) }, [isVisible])
  useEffect(() => { void desktop.browser.setTheme(theme).catch(() => undefined) }, [theme])
  useEffect(() => { if (!isTauriRuntime()) return; void desktop.browser.syncMetadata().catch(() => undefined); const timer = window.setInterval(() => void desktop.browser.syncMetadata().catch(() => undefined), 1800); return () => window.clearInterval(timer) }, [])
  async function select(id: string) { const next = selectTabState(stateRef.current, id); if (next === stateRef.current) return; stateRef.current = next; setState(next); await synchronizeNativeView(next).catch(() => undefined) }
  async function close(id: string) { const tab = stateRef.current.tabs.find((item) => item.id === id); if (!tab) return; const nativeBacked = nativeTabIdsRef.current.has(id); const previous = stateRef.current; const next = closeTabState(previous, id); persist(next); stateRef.current = next; setState(next); if (!tab.url) { nativeTabIdsRef.current.delete(id); await synchronizeNativeView(next).catch(() => undefined); return } if (!nativeBacked) { nativeTabIdsRef.current.delete(id); addRecentlyClosed(tab.title, tab.url, tab.favicon); setRecents(loadRecentlyClosed()); await synchronizeNativeView(next).catch(() => undefined); return } try { await desktop.browser.close(id); nativeTabIdsRef.current.delete(id); addRecentlyClosed(tab.title, tab.url, tab.favicon); setRecents(loadRecentlyClosed()); await synchronizeNativeView(next).catch(() => undefined) } catch (cause) { const restoredState = resolveOptimisticClose(previous, next, false); persist(restoredState); stateRef.current = restoredState; setState(restoredState); await synchronizeNativeView(restoredState).catch(() => undefined); setError(errorMessage(cause, 'Sekme kapatılamadı.')) } }
  function submit(e: FormEvent) { e.preventDefault(); if (active) void navigateTab(active.id, address); else void openTab(address) }
  function toggleFavorite() { if (!active?.url) return; const found = favorites.find((f) => f.url === active.url); const next = found ? favorites.filter((f) => f.id !== found.id) : [...favorites, { id: crypto.randomUUID(), name: active.title, url: active.url, color: 'var(--color-browser-blue)', iconText: active.title.slice(0, 2).toUpperCase(), favicon: active.favicon }]; saveFavorites(next); setFavorites(next) }
  const isFavorite = Boolean(active?.url && favorites.some((f) => f.url === active.url))
  return <section className="edge-browser" aria-label="Gömülü tarayıcı">
    <div className="edge-browser__tabs" role="tablist"><div className="edge-browser__tab-scroll">{state.tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={tab.id === active?.id} className={`edge-browser__tab ${tab.id === active?.id ? 'edge-browser__tab--active' : ''}`} onClick={() => void select(tab.id)}>{tab.favicon ? <img src={tab.favicon} alt="" /> : <Globe2 size={12} />}<span>{tab.title}</span>{tab.loading ? <LoaderCircle className="edge-browser__spinner" size={11} /> : null}<span role="button" tabIndex={0} className="edge-browser__tab-close" aria-label={`${tab.title} sekmesini kapat`} onClick={(e) => { e.stopPropagation(); void close(tab.id) }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void close(tab.id) }}><X size={11} /></span></button>)}</div><button type="button" className="edge-browser__new-tab" onClick={() => void openTab()} aria-label="Yeni sekme"><Plus size={14} /></button></div>
    <div className="edge-browser__toolbar"><button type="button" className="edge-browser__tool" disabled={!active?.canGoBack} onClick={() => active && void desktop.browser.back(active.id)} aria-label="Geri"><ArrowLeft size={15} /></button><button type="button" className="edge-browser__tool" disabled={!active?.canGoForward} onClick={() => active && void desktop.browser.forward(active.id)} aria-label="İleri"><ArrowRight size={15} /></button><button type="button" className="edge-browser__tool" disabled={!active?.url} onClick={() => active && void desktop.browser.reload(active.id)} aria-label="Yenile"><RefreshCw size={14} /></button><form className="edge-browser__address" onSubmit={submit}><Search size={14} /><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Web'de ara veya adres yaz" aria-label="Adres ve arama" /><button type="button" onClick={toggleFavorite} className={isFavorite ? 'edge-browser__favorite--active' : ''} aria-label={isFavorite ? 'Favorilerden kaldır' : 'Favorilere ekle'}><Star size={14} fill={isFavorite ? 'currentColor' : 'none'} /></button></form></div>
    {error || active?.error ? <div className="edge-browser__error" role="alert">{error || active?.error}<button type="button" onClick={() => active && void navigateTab(active.id, active.url || address)}>Yeniden dene</button></div> : null}
    <div className="edge-browser__content"><div ref={hostRef} className={`edge-browser__native-host ${active?.url ? '' : 'edge-browser__native-host--inactive'}`} />{!active?.url ? <div className="edge-browser__start"><div className="edge-browser__start-heading"><div><h1>Yeni sekme</h1><p>Web'de ara veya kayıtlı yer imlerinden birini aç.</p></div></div><div className="edge-browser__favorites">{favorites.map((f) => <button key={f.id} type="button" onClick={() => active ? void navigateTab(active.id, f.url) : void openTab(f.url)} className="edge-browser__favorite-card">{f.favicon ? <img src={f.favicon} alt="" /> : <span>{f.iconText}</span>}<strong>{f.name}</strong><small>{hostnameFromUrl(f.url)}</small></button>)}</div><div className="edge-browser__recent-panel"><div className="edge-browser__section-title"><h2>Son kapatılanlar</h2></div>{recents.length ? recents.map((r) => <button key={r.id} type="button" className="edge-browser__recent-row" onClick={() => void openTab(r.url)}>{r.favicon ? <img src={r.favicon} alt="" /> : <Globe2 size={14} />}<span><strong>{r.title}</strong><small>{hostnameFromUrl(r.url)}</small></span><time>{relativeTime(r.closedAt)}</time></button>) : <p className="edge-browser__empty">Kapatılan sekmeler burada görünür.</p>}</div></div> : !isTauriRuntime() ? <div className="edge-browser__web-fallback"><Globe2 size={30} /><p>Gömülü tarayıcı masaüstü sürümünde çalışır.</p></div> : null}</div>
  </section>
}
