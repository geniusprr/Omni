import { MUSIC_CATEGORIES, THEME_CONFIGS, type MusicTheme, type MusicCategory } from './catalog'
import {
  isMusicTrack,
  trackKey,
  type MusicProviderId,
  type MusicTrack,
  type RepeatMode,
} from './types'

export const MUSIC_PERSISTENCE_KEY = 'shutty.music.state'
export const MUSIC_PERSISTENCE_VERSION = 2

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface MusicPersistenceSnapshot {
  version: 2
  provider: MusicProviderId
  queue: MusicTrack[]
  queueIndex: number
  favorites: MusicTrack[]
  history: MusicTrack[]
  volume: number
  muted: boolean
  shuffle: boolean
  repeatMode: RepeatMode
  theme: MusicTheme
  viewFormat: 'art' | 'video'
  activeCategory: MusicCategory
}

interface LegacyMusicTrack {
  id?: unknown
  title?: unknown
  artist?: unknown
  youtubeId?: unknown
  coverUrl?: unknown
  durationStr?: unknown
  category?: unknown
}

interface UnknownPersistedState {
  version?: unknown
  provider?: unknown
  queue?: unknown
  queueIndex?: unknown
  favorites?: unknown
  history?: unknown
  volume?: unknown
  muted?: unknown
  shuffle?: unknown
  repeatMode?: unknown
  theme?: unknown
  viewFormat?: unknown
  activeCategory?: unknown
}

function getDefaultStorage(): StorageLike | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function parseJson(storage: StorageLike | undefined, key: string): unknown {
  if (!storage) return undefined
  try {
    const raw = storage.getItem(key)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

function toSafeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function migrateLegacyMusicTrack(value: unknown): MusicTrack | null {
  if (isMusicTrack(value)) {
    return {
      ...value,
      id: trackKey(value.provider, value.providerTrackId),
    }
  }

  if (!value || typeof value !== 'object') return null
  const legacy = value as LegacyMusicTrack
  const providerTrackId = toSafeString(legacy.youtubeId)
  const title = toSafeString(legacy.title)
  const artist = toSafeString(legacy.artist)
  if (!providerTrackId || !title || !artist) return null

  const durationLabel = toSafeString(legacy.durationStr)
  const category = toSafeString(legacy.category)
  return {
    id: trackKey('youtube', providerTrackId),
    provider: 'youtube',
    providerTrackId,
    title,
    artist,
    artworkUrl:
      toSafeString(legacy.coverUrl) || `https://i.ytimg.com/vi/${providerTrackId}/hqdefault.jpg`,
    externalUrl: `https://www.youtube.com/watch?v=${providerTrackId}`,
    metadata: {
      ...(durationLabel ? { durationLabel } : {}),
      ...(category ? { category } : {}),
      migratedFrom: 'minios_yt',
    },
  }
}

function uniqueTracks(tracks: MusicTrack[]): MusicTrack[] {
  const byId = new Map<string, MusicTrack>()
  for (const track of tracks) {
    if (!byId.has(track.id)) byId.set(track.id, track)
  }
  return Array.from(byId.values())
}

function removeRetiredCatalogTracks(tracks: MusicTrack[], fallbackQueue: MusicTrack[]): MusicTrack[] {
  const currentCatalogIds = new Set(fallbackQueue.map((track) => track.id))
  return tracks.filter((track) => {
    const source = track.metadata?.source
    return source !== 'shutty-catalog' || currentCatalogIds.has(track.id)
  })
}

function clampVolume(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 80
  const parsed = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(parsed)) return 80
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function asRepeatMode(value: unknown): RepeatMode {
  return value === 'all' || value === 'one' ? value : 'off'
}

function asTheme(value: unknown, fallback: MusicTheme): MusicTheme {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(THEME_CONFIGS, value)
    ? (value as MusicTheme)
    : fallback
}

function asCategory(value: unknown, fallback: MusicCategory): MusicCategory {
  return typeof value === 'string' && MUSIC_CATEGORIES.some((category) => category.id === value)
    ? (value as MusicCategory)
    : fallback
}

function createDefaultSnapshot(fallbackQueue: MusicTrack[]): MusicPersistenceSnapshot {
  const queue = fallbackQueue.length > 0 ? fallbackQueue : []
  return {
    version: MUSIC_PERSISTENCE_VERSION,
    provider: 'youtube',
    queue,
    queueIndex: queue.length > 0 ? 0 : -1,
    favorites: [],
    history: [],
    volume: 80,
    muted: false,
    shuffle: false,
    repeatMode: 'off',
    theme: 'sunset',
    viewFormat: 'video',
    activeCategory: 'all',
  }
}

export function loadMusicPersistence(
  storage: StorageLike | undefined = getDefaultStorage(),
  fallbackQueue: MusicTrack[] = [],
): MusicPersistenceSnapshot {
  const defaults = createDefaultSnapshot(fallbackQueue)
  const saved = parseJson(storage, MUSIC_PERSISTENCE_KEY)

  if (saved && typeof saved === 'object' && (saved as UnknownPersistedState).version === MUSIC_PERSISTENCE_VERSION) {
    const parsed = saved as UnknownPersistedState
    const parsedQueue = uniqueTracks(
      Array.isArray(parsed.queue)
        ? parsed.queue.map(migrateLegacyMusicTrack).filter((track): track is MusicTrack => track !== null)
        : [],
    )
    const queue = removeRetiredCatalogTracks(parsedQueue, fallbackQueue)
    const safeQueue = queue.length > 0 ? queue : fallbackQueue
    const retiredQueueItemRemoved = parsedQueue.length !== queue.length
    const queueIndex = safeQueue.length > 0
      ? retiredQueueItemRemoved
        ? 0
        : Math.max(0, Math.min(safeQueue.length - 1, Number(parsed.queueIndex) || 0))
      : -1
    const favorites = removeRetiredCatalogTracks(uniqueTracks(
      Array.isArray(parsed.favorites)
        ? parsed.favorites.map(migrateLegacyMusicTrack).filter((track): track is MusicTrack => track !== null)
        : [],
    ), fallbackQueue)
    const history = removeRetiredCatalogTracks(uniqueTracks(
      Array.isArray(parsed.history)
        ? parsed.history.map(migrateLegacyMusicTrack).filter((track): track is MusicTrack => track !== null)
        : [],
    ), fallbackQueue)

    return {
      ...defaults,
      provider: parsed.provider === 'spotify' ? 'spotify' : 'youtube',
      queue: safeQueue,
      queueIndex,
      favorites,
      history,
      volume: clampVolume(parsed.volume),
      muted: parsed.muted === true,
      shuffle: parsed.shuffle === true,
      repeatMode: asRepeatMode(parsed.repeatMode),
      theme: asTheme(parsed.theme, defaults.theme),
      viewFormat: parsed.viewFormat === 'art' ? 'art' : 'video',
      activeCategory: asCategory(parsed.activeCategory, defaults.activeCategory),
    }
  }

  // Migrate the old schema without deleting it. The legacy keys remain intact so
  // an older build can still be opened if the user rolls back the application.
  const legacyCustom = migrateLegacyMusicTrack(parseJson(storage, 'minios_yt_custom_track'))
  const legacyFavorites = parseJson(storage, 'minios_yt_favorites')
  const migratedFavorites = Array.isArray(legacyFavorites)
    ? legacyFavorites.map(migrateLegacyMusicTrack).filter((track): track is MusicTrack => track !== null)
    : []
  const legacyPresetIndex = Number(parseJson(storage, 'minios_yt_preset'))
  const safePresetIndex = Number.isInteger(legacyPresetIndex)
    ? Math.max(0, Math.min(Math.max(0, fallbackQueue.length - 1), legacyPresetIndex))
    : 0
  const queue = legacyCustom
    ? uniqueTracks([legacyCustom, ...fallbackQueue])
    : fallbackQueue

  return {
    ...defaults,
    queue,
    queueIndex: legacyCustom ? 0 : queue.length > 0 ? safePresetIndex : -1,
    favorites: removeRetiredCatalogTracks(uniqueTracks(migratedFavorites), fallbackQueue),
    theme: asTheme(parseJson(storage, 'minios_yt_theme'), defaults.theme),
    volume: clampVolume(parseJson(storage, 'minios_yt_volume')),
  }
}

export function saveMusicPersistence(
  snapshot: MusicPersistenceSnapshot,
  storage: StorageLike | undefined = getDefaultStorage(),
): void {
  if (!storage) return
  try {
    storage.setItem(MUSIC_PERSISTENCE_KEY, JSON.stringify({
      ...snapshot,
      version: MUSIC_PERSISTENCE_VERSION,
    }))
  } catch {
    // localStorage can be unavailable or full; playback must continue in memory.
  }
}
