export type BrowserShortcutKind = 'website' | 'program'

export interface BrowserFavorite {
  id: string
  name: string
  url: string
  color: string
  iconText: string
  favicon?: string | null
}

export interface BrowserShortcut {
  id: string
  name: string
  kind: BrowserShortcutKind
  target: string
  color: string
  iconText: string
}

export interface BrowserRecentItem {
  id: string
  title: string
  url: string
  closedAt: number
  favicon?: string | null
}

const FAVORITES_KEY = 'minios_browser_favorites_v1'
const SHORTCUTS_KEY = 'minios_quick_access_v1'
const RECENTS_KEY = 'minios_browser_recently_closed_v1'
const PENDING_NAVIGATION_KEY = 'minios_browser_pending_navigation_v1'

export const BROWSER_DATA_EVENT = 'kapanis:browser-data-change'
export const BROWSER_NAVIGATION_EVENT = 'kapanis:browser-navigation'

export const DEFAULT_FAVORITES: BrowserFavorite[] = [
  { id: 'youtube', name: 'YouTube', url: 'https://youtube.com', color: 'var(--color-shortcut-youtube)', iconText: '▶' },
  { id: 'github', name: 'GitHub', url: 'https://github.com', color: 'var(--color-shortcut-github)', iconText: 'GH' },
  { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com', color: 'var(--color-shortcut-gmail)', iconText: 'M' },
  { id: 'drive', name: 'Drive', url: 'https://drive.google.com', color: 'var(--color-shortcut-drive)', iconText: '▲' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com', color: 'var(--color-shortcut-chatgpt)', iconText: 'AI' },
  { id: 'reddit', name: 'Reddit', url: 'https://reddit.com', color: 'var(--color-shortcut-reddit)', iconText: 'R' },
].map((favorite) => ({ ...favorite, favicon: faviconForBrowserUrl(favorite.url) }))

export const DEFAULT_SHORTCUTS: BrowserShortcut[] = DEFAULT_FAVORITES.slice(0, 6).map((item) => ({
  id: `site-${item.id}`,
  name: item.name,
  kind: 'website',
  target: item.url,
  color: item.color,
  iconText: item.iconText,
}))

function readArray<T>(key: string, fallback: T[]): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null')
    return Array.isArray(parsed) ? parsed as T[] : fallback
  } catch {
    return fallback
  }
}

function writeArray<T>(key: string, items: T[]) {
  localStorage.setItem(key, JSON.stringify(items))
  window.dispatchEvent(new CustomEvent(BROWSER_DATA_EVENT, { detail: { key } }))
}

export function loadFavorites() {
  return readArray<BrowserFavorite>(FAVORITES_KEY, DEFAULT_FAVORITES)
    .filter((favorite) => favorite && typeof favorite.url === 'string' && /^https?:\/\//i.test(favorite.url))
    .map((favorite) => ({ ...favorite, favicon: isValidFaviconSource(favorite.favicon) ? favorite.favicon : faviconForBrowserUrl(favorite.url) }))
}

export function saveFavorites(items: BrowserFavorite[]) {
  writeArray(FAVORITES_KEY, items)
}

export function loadShortcuts() {
  return readArray(SHORTCUTS_KEY, DEFAULT_SHORTCUTS)
}

export function saveShortcuts(items: BrowserShortcut[]) {
  writeArray(SHORTCUTS_KEY, items)
}

export function loadRecentlyClosed() {
  return readArray<BrowserRecentItem>(RECENTS_KEY, [])
    .filter((item) => item && typeof item.url === 'string')
    .slice(0, 8)
}

export function saveRecentlyClosed(items: BrowserRecentItem[]) {
  writeArray(RECENTS_KEY, items.slice(0, 8))
}

export function addRecentlyClosed(title: string, url: string, favicon?: string | null) {
  if (!/^https?:\/\//i.test(url)) return
  const item: BrowserRecentItem = {
    id: crypto.randomUUID(),
    title: title.trim() || hostnameFromUrl(url),
    url,
    closedAt: Date.now(),
    favicon: favicon || null,
  }
  saveRecentlyClosed([item, ...loadRecentlyClosed().filter((recent) => recent.url !== url)])
}

export function requestBrowserNavigation(input: string) {
  const url = normalizeBrowserInput(input)
  localStorage.setItem(PENDING_NAVIGATION_KEY, url)
  window.dispatchEvent(new CustomEvent(BROWSER_NAVIGATION_EVENT, { detail: { url } }))
  return url
}

export function consumeBrowserNavigation() {
  const pending = localStorage.getItem(PENDING_NAVIGATION_KEY)
  if (pending) localStorage.removeItem(PENDING_NAVIGATION_KEY)
  return pending
}

export function normalizeBrowserInput(input: string) {
  const value = input.trim()
  if (!value) return 'about:blank'
  if (/^https?:\/\//i.test(value)) return value
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(value)) return `http://${value}`
  if (/^[\w-]+(?:\.[\w-]+)+(?:[/?#].*)?$/i.test(value) && !value.includes(' ')) {
    return `https://${value}`
  }
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`
}

export function hostnameFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function faviconForBrowserUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    return /^https?:$/.test(parsed.protocol) ? `${parsed.origin}/favicon.ico` : null
  } catch {
    return null
  }
}

function isValidFaviconSource(value: unknown): value is string {
  return typeof value === 'string' && /^(?:https?:\/\/|data:image\/)/i.test(value)
}

export function relativeTime(timestamp: number) {
  const elapsed = Math.max(0, Date.now() - timestamp)
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return 'şimdi'
  if (minutes < 60) return `${minutes} dk önce`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} sa önce`
  return new Date(timestamp).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}
