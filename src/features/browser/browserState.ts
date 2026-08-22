import type { BrowserTabProjection } from '@/lib/desktop'

export interface BrowserTab {
  id: string
  url: string | null
  title: string
  favicon: string | null
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error: string | null
  pinned?: boolean
  muted?: boolean
  incognito?: boolean
}

export interface BrowserState { tabs: BrowserTab[]; activeTabId: string | null; mediaByTabId: Record<string, BrowserMediaState> }
export interface BrowserMediaState { tabId: string; playing: boolean; title?: string; artist?: string; artwork?: string | null; source?: string; lastPlayingAt: number }
export type NativeViewAction = { type: 'activate'; tabId: string } | { type: 'deactivate' }
export interface NativeRestoreTask { tabId: string; url: string }
export type NativeNavigationAction = 'create' | 'navigate'
export type TabDropPosition = 'before' | 'after'

export const EMPTY_BROWSER_STATE: BrowserState = { tabs: [], activeTabId: null, mediaByTabId: {} }
export const DEFAULT_BROWSER_HOME_URL = 'https://www.google.com/'

export function validateTabId(id: string): boolean { return /^[A-Za-z0-9_-]{1,64}$/.test(id) }
export function migrateBrowserState(raw: unknown, activeId: string | null): BrowserState {
  const rawObject = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as { tabs?: unknown; activeTabId?: unknown } : null
  const rawTabs = Array.isArray(raw) ? raw : rawObject?.tabs
  const persistedActiveId = activeId ?? (typeof rawObject?.activeTabId === 'string' ? rawObject.activeTabId : null)
  const tabs = Array.isArray(rawTabs) ? rawTabs.flatMap((value): BrowserTab[] => {
    if (!value || typeof value !== 'object') return []
    const item = value as Partial<BrowserTab>
    if (typeof item.id !== 'string' || !validateTabId(item.id)) return []
    const url = item.url === null
      ? DEFAULT_BROWSER_HOME_URL
      : typeof item.url === 'string' && /^https?:\/\//i.test(item.url)
        ? item.url
        : null
    if (item.url !== null && url === null) return []
    return [{ id: item.id, url, title: typeof item.title === 'string' && item.title.trim() ? item.title : url ? hostname(url) : 'Yeni Sekme', favicon: typeof item.favicon === 'string' && /^(?:https?:\/\/|data:image\/)/i.test(item.favicon) ? item.favicon : url ? faviconForUrl(url) : null, loading: false, canGoBack: false, canGoForward: false, error: null, pinned: item.pinned === true, muted: item.muted === true, incognito: item.incognito === true }]
  }).slice(0, 20) : []
  return { tabs, activeTabId: persistedActiveId && tabs.some((tab) => tab.id === persistedActiveId) ? persistedActiveId : tabs[0]?.id ?? null, mediaByTabId: {} }
}
export function serializeBrowserState(state: BrowserState): { tabs: BrowserTab[]; activeTabId: string | null } {
  const nonIncognitoTabs = state.tabs.filter((tab) => !tab.incognito)
  const activeTabId = state.activeTabId && nonIncognitoTabs.some((tab) => tab.id === state.activeTabId) ? state.activeTabId : nonIncognitoTabs[0]?.id ?? null
  return { tabs: nonIncognitoTabs, activeTabId }
}
export function makeTab(url: string | null = DEFAULT_BROWSER_HOME_URL, incognito = false): BrowserTab {
  const initialUrl = url || DEFAULT_BROWSER_HOME_URL
  return { id: crypto.randomUUID().replace(/-/g, ''), url: initialUrl, title: hostname(initialUrl), favicon: faviconForUrl(initialUrl), loading: false, canGoBack: false, canGoForward: false, error: null, pinned: false, muted: false, incognito }
}
export function hostname(url: string) { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }
export function faviconForUrl(url: string) { try { const parsed = new URL(url); return `https://${parsed.host}/favicon.ico` } catch { return null } }
export function applyProjection(tab: BrowserTab, projection: BrowserTabProjection): BrowserTab { return { ...tab, url: projection.url, title: projection.title || tab.title, favicon: projection.favicon || faviconForUrl(projection.url), loading: projection.loading, canGoBack: projection.canGoBack, canGoForward: projection.canGoForward, error: projection.error, pinned: projection.pinned, muted: projection.muted, incognito: projection.incognito ?? tab.incognito } }
/** Applies the authoritative projection returned by a native command or event. */
export function applyTabProjectionState(state: BrowserState, projection: BrowserTabProjection): BrowserState {
  return { ...state, tabs: state.tabs.map((tab) => tab.id === projection.id ? applyProjection(tab, projection) : tab) }
}
export function closeTabState(state: BrowserState, id: string): BrowserState {
  const index = state.tabs.findIndex((tab) => tab.id === id)
  if (index < 0) return state
  const tabs = state.tabs.filter((tab) => tab.id !== id)
  const activeTabId = state.activeTabId === id ? (tabs[index]?.id ?? tabs[index - 1]?.id ?? null) : state.activeTabId
  const { [id]: _closedMedia, ...mediaByTabId } = state.mediaByTabId
  return { tabs, activeTabId, mediaByTabId }
}
export function closeOtherTabsState(state: BrowserState, keepId: string): BrowserState {
  const keepTab = state.tabs.find((tab) => tab.id === keepId)
  if (!keepTab) return state
  const remainingTabs = state.tabs.filter((tab) => tab.id === keepId || tab.pinned)
  const mediaByTabId: Record<string, BrowserMediaState> = {}
  for (const tab of remainingTabs) {
    if (state.mediaByTabId[tab.id]) mediaByTabId[tab.id] = state.mediaByTabId[tab.id]
  }
  return { tabs: remainingTabs, activeTabId: keepId, mediaByTabId }
}
export function closeTabsToTheRightState(state: BrowserState, targetId: string): BrowserState {
  const index = state.tabs.findIndex((tab) => tab.id === targetId)
  if (index < 0) return state
  const remainingTabs = state.tabs.filter((tab, i) => i <= index || tab.pinned)
  const activeTabStillExists = remainingTabs.some((tab) => tab.id === state.activeTabId)
  const activeTabId = activeTabStillExists ? state.activeTabId : targetId
  const mediaByTabId: Record<string, BrowserMediaState> = {}
  for (const tab of remainingTabs) {
    if (state.mediaByTabId[tab.id]) mediaByTabId[tab.id] = state.mediaByTabId[tab.id]
  }
  return { tabs: remainingTabs, activeTabId, mediaByTabId }
}
export function openTabState(state: BrowserState, tab: BrowserTab): BrowserState {
  return { ...state, tabs: [...state.tabs, tab], activeTabId: tab.id }
}
export function selectTabState(state: BrowserState, id: string): BrowserState {
  return state.tabs.some((tab) => tab.id === id) ? { ...state, activeTabId: id } : state
}
/**
 * Move a tab without changing selection or any native-tab metadata. Pinned
 * and regular tabs are kept in their own lanes, matching the visual browser
 * convention and preventing an accidental drop from splitting the pinned
 * group.
 */
export function reorderTabState(
  state: BrowserState,
  draggedId: string,
  targetId: string,
  position: TabDropPosition = 'before',
): BrowserState {
  const sourceIndex = state.tabs.findIndex((tab) => tab.id === draggedId)
  const targetIndex = state.tabs.findIndex((tab) => tab.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return state

  const source = state.tabs[sourceIndex]
  const target = state.tabs[targetIndex]
  if ((source.pinned === true) !== (target.pinned === true)) return state

  const tabs = [...state.tabs]
  const [moved] = tabs.splice(sourceIndex, 1)
  if (!moved) return state

  const targetIndexAfterRemoval = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
  const insertionIndex = position === 'after' ? targetIndexAfterRemoval + 1 : targetIndexAfterRemoval
  tabs.splice(Math.max(0, Math.min(tabs.length, insertionIndex)), 0, moved)
  return { ...state, tabs }
}
/** A renderer-only tab must have no visible native WebView behind its start page. */
export function nativeViewAction(state: BrowserState): NativeViewAction {
  const active = state.tabs.find((tab) => tab.id === state.activeTabId)
  return active?.url ? { type: 'activate', tabId: active.id } : { type: 'deactivate' }
}
/** Persisted URLs describe tabs, not live native children; each needs an explicit create. */
export function nativeRestoreTasks(state: BrowserState): NativeRestoreTask[] {
  const seen = new Set<string>()
  return state.tabs.flatMap((tab) => {
    if (!tab.url || seen.has(tab.id) || tab.incognito) return []
    seen.add(tab.id)
    return [{ tabId: tab.id, url: tab.url }]
  })
}
/** A persisted URL has no native child after a process restart. */
export function nativeNavigationAction(tab: BrowserTab, nativeBacked: boolean): NativeNavigationAction {
  return nativeBacked && tab.url ? 'navigate' : 'create'
}
/** Restore cannot consume its one-shot guard until the persistent host is visible and sized. */
export function canStartNativeRestore(isVisible: boolean, hasBounds: boolean, alreadyStarted: boolean): boolean {
  return isVisible && hasBounds && !alreadyStarted
}
export function prepareNewTabNavigation(state: BrowserState, tab: BrowserTab, url: string) {
  return { state: openTabState(state, tab), tabId: tab.id, url }
}
export function resolveOptimisticClose(previous: BrowserState, optimistic: BrowserState, succeeded: boolean): BrowserState {
  return succeeded ? optimistic : previous
}
export function lastPlayingMedia(media: Record<string, BrowserMediaState>): BrowserMediaState | null {
  return Object.values(media).filter((item) => item.playing).sort((a, b) => b.lastPlayingAt - a.lastPlayingAt)[0] ?? null
}
