import { useSyncExternalStore } from 'react'
import { MUSIC_CATEGORIES, MUSIC_PRESETS, THEME_CONFIGS, type MusicCategory, type MusicTheme } from './catalog'
import { getNextQueueIndex, getPreviousQueueIndex, insertNext, removeQueueTrack } from './queue'
import {
  loadMusicPersistence,
  saveMusicPersistence,
  type MusicPersistenceSnapshot,
} from './persistence'
import {
  toMusicError,
  trackKey,
  type MusicError,
  type MusicPlaybackController,
  type MusicProviderId,
  type MusicTrack,
  type PlaybackState,
  type RepeatMode,
} from './types'
import { extractYoutubeVideoId } from '../providers/youtube/youtubeUrl'
import { youtubeProvider } from '../providers/youtube/YouTubeProvider'

export interface MusicPlayerState {
  provider: MusicProviderId
  activeTrack: MusicTrack | null
  queue: MusicTrack[]
  queueIndex: number
  playbackState: PlaybackState
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeatMode: RepeatMode
  favorites: MusicTrack[]
  history: MusicTrack[]
  error: MusicError | null
  buffering: boolean
  providerReady: boolean

  theme: MusicTheme
  viewFormat: 'art' | 'video'
  activeCategory: MusicCategory
  searchQuery: string
  searchResults: MusicTrack[]
  isSearching: boolean
}

export interface MusicStoreActions {
  togglePlay: () => void
  playTrack: (trackOrIndex: MusicTrack | number) => void
  playNext: (track: MusicTrack) => void
  nextTrack: () => void
  prevTrack: () => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  seekTo: (seconds: number) => void
  setTheme: (theme: MusicTheme) => void
  setViewFormat: (viewFormat: 'art' | 'video') => void
  setActiveCategory: (category: MusicCategory) => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  toggleFavorite: (track?: MusicTrack) => void
  isFavorite: (trackOrId?: MusicTrack | string) => boolean
  addToQueue: (track?: MusicTrack) => void
  removeFromQueue: (trackId?: string) => void
  clearQueue: () => void
  addCustomTrackByUrl: (urlOrId: string) => Promise<boolean>
  searchYoutube: (query: string) => Promise<void>
  setProvider: (provider: MusicProviderId) => void
  clearError: () => void
}

export type MusicStore = MusicPlayerState & MusicStoreActions

let providerController: MusicPlaybackController | null = null
let searchAbortController: AbortController | null = null
let searchRequestId = 0

function createInitialState(): MusicPlayerState {
  const persisted = loadMusicPersistence(undefined, MUSIC_PRESETS)
  const queue = persisted.queue.length > 0 ? persisted.queue : MUSIC_PRESETS
  const queueIndex = queue.length > 0
    ? Math.max(0, Math.min(queue.length - 1, persisted.queueIndex))
    : -1
  return {
    provider: persisted.provider === 'spotify' ? 'spotify' : 'youtube',
    activeTrack: queue[queueIndex] || queue[0] || null,
    queue,
    queueIndex,
    playbackState: 'paused',
    currentTime: 0,
    duration: queue[queueIndex]?.durationMs ? queue[queueIndex].durationMs / 1000 : 0,
    volume: persisted.volume,
    muted: persisted.muted,
    shuffle: persisted.shuffle,
    repeatMode: persisted.repeatMode,
    favorites: persisted.favorites,
    history: persisted.history,
    error: persisted.provider === 'spotify'
      ? {
          code: 'provider-unsupported',
          message: 'Spotify tam oynatma bu sistemde henüz desteklenmiyor. Spotify uygulamasında açabilirsiniz.',
          provider: 'spotify',
          recoverable: true,
        }
      : null,
    buffering: false,
    providerReady: false,
    theme: persisted.theme,
    viewFormat: persisted.viewFormat,
    activeCategory: persisted.activeCategory,
    searchQuery: '',
    searchResults: [],
    isSearching: false,
  }
}

let state: MusicPlayerState = createInitialState()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

function persistenceSnapshot(nextState: MusicPlayerState): MusicPersistenceSnapshot {
  return {
    version: 2,
    provider: nextState.provider,
    queue: nextState.queue,
    queueIndex: nextState.queueIndex,
    favorites: nextState.favorites,
    history: nextState.history,
    volume: nextState.volume,
    muted: nextState.muted,
    shuffle: nextState.shuffle,
    repeatMode: nextState.repeatMode,
    theme: nextState.theme,
    viewFormat: nextState.viewFormat,
    activeCategory: nextState.activeCategory,
  }
}

function updateState(partial: Partial<MusicPlayerState>, persist = false): void {
  state = { ...state, ...partial }
  if (persist) saveMusicPersistence(persistenceSnapshot(state))
  notify()
}

function setActiveTrack(track: MusicTrack | null, queueIndex: number, shouldPlay: boolean): void {
  updateState({
    activeTrack: track,
    queueIndex,
    playbackState: track ? (shouldPlay ? 'loading' : 'paused') : 'paused',
    currentTime: 0,
    duration: track?.durationMs ? track.durationMs / 1000 : 0,
    error: null,
    buffering: Boolean(track && shouldPlay),
    provider: track?.provider || state.provider,
    providerReady: track?.provider === state.provider ? state.providerReady : false,
  }, true)
}

function addToHistory(track: MusicTrack): void {
  if (state.history[0]?.id === track.id) return
  const nextHistory = [track, ...state.history.filter((item) => item.id !== track.id)].slice(0, 50)
  updateState({ history: nextHistory }, true)
}

function normalizeVolume(volume: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(volume) ? volume : 80)))
}

function mapSearchError(error: unknown): MusicError {
  return toMusicError(error, 'YouTube araması başarısız oldu.')
}

export const musicStore = {
  getState: (): MusicPlayerState => state,

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  registerPlaybackController(controller: MusicPlaybackController): void {
    if (controller.provider !== state.provider) return
    providerController = controller
    updateState({ providerReady: true })
  },

  unregisterPlaybackController(controller: MusicPlaybackController): void {
    if (providerController !== controller) return
    providerController = null
    updateState({ providerReady: false })
  },

  setProviderReady(ready: boolean): void {
    updateState({ providerReady: ready })
  },

  setPlaybackState(playbackState: PlaybackState): void {
    updateState({
      playbackState,
      buffering: playbackState === 'loading',
      error: playbackState === 'playing' ? null : state.error,
    })
    if (playbackState === 'playing' && state.activeTrack) addToHistory(state.activeTrack)
  },

  setTimeAndDuration(currentTime: number, duration: number): void {
    updateState({
      currentTime: Math.max(0, Number.isFinite(currentTime) ? currentTime : 0),
      duration: Math.max(0, Number.isFinite(duration) ? duration : 0),
    })
  },

  setPlaybackError(error: MusicError): void {
    updateState({ error, playbackState: 'error', buffering: false })
  },

  togglePlay(): void {
    if (!state.activeTrack) return
    const shouldPause = state.playbackState === 'playing' || state.playbackState === 'loading' || state.buffering
    if (shouldPause) {
      providerController?.pause()
      updateState({ playbackState: 'paused', buffering: false })
      return
    }

    if (providerController && state.providerReady) {
      updateState({ playbackState: 'loading', buffering: true, error: null })
      providerController.play()
    } else {
      // The direct YouTube Music browser tab owns playback. Keep the shared
      // mini player responsive even though it has no local controller to register.
      updateState({ playbackState: 'playing', buffering: false, error: null })
    }
  },

  playTrack(trackOrIndex: MusicTrack | number): void {
    let track: MusicTrack | undefined
    let queueIndex: number

    if (typeof trackOrIndex === 'number') {
      queueIndex = Math.max(0, Math.min(state.queue.length - 1, Math.trunc(trackOrIndex)))
      track = state.queue[queueIndex]
    } else {
      const existingIndex = state.queue.findIndex((item) => item.id === trackOrIndex.id)
      if (existingIndex >= 0) {
        queueIndex = existingIndex
      } else {
        queueIndex = state.queue.length
        updateState({ queue: [...state.queue, trackOrIndex] }, true)
      }
      track = trackOrIndex
    }

    if (!track) return
    setActiveTrack(track, queueIndex, true)
  },

  playNext(track: MusicTrack): void {
    const nextQueue = insertNext(state.queue, state.queueIndex, track)
    updateState({ queue: nextQueue }, true)
  },

  nextTrack(): void {
    const nextIndex = getNextQueueIndex({
      queue: state.queue,
      queueIndex: state.queueIndex,
      shuffle: state.shuffle,
      repeatMode: state.repeatMode,
      history: state.history,
    })
    if (nextIndex === null) {
      updateState({ playbackState: 'paused', buffering: false })
      return
    }
    const nextTrack = state.queue[nextIndex]
    if (nextTrack) setActiveTrack(nextTrack, nextIndex, true)
  },

  prevTrack(): void {
    if (!state.activeTrack || state.queue.length === 0) return
    if (state.currentTime > 3) {
      providerController?.seek(0)
      updateState({ currentTime: 0 })
      return
    }
    const previousIndex = getPreviousQueueIndex(state.queue, state.queueIndex, state.history)
    if (previousIndex === null) return
    const previousTrack = state.queue[previousIndex]
    if (previousTrack) setActiveTrack(previousTrack, previousIndex, true)
  },

  onTrackEnded(): void {
    if (state.repeatMode === 'one') {
      providerController?.seek(0)
      providerController?.play()
      updateState({ currentTime: 0, playbackState: 'loading', buffering: true })
      return
    }
    musicStore.nextTrack()
  },

  setVolume(volume: number): void {
    const nextVolume = normalizeVolume(volume)
    providerController?.setVolume(nextVolume)
    updateState({ volume: nextVolume, muted: nextVolume === 0 }, true)
  },

  toggleMute(): void {
    const muted = !state.muted
    providerController?.setMuted(muted)
    updateState({ muted }, true)
  },

  seekTo(seconds: number): void {
    const nextSeconds = Math.max(0, Math.min(state.duration || Number.MAX_SAFE_INTEGER, seconds))
    providerController?.seek(nextSeconds)
    updateState({ currentTime: nextSeconds })
  },

  setTheme(theme: MusicTheme): void {
    if (!THEME_CONFIGS[theme]) return
    updateState({ theme }, true)
  },

  setViewFormat(viewFormat: 'art' | 'video'): void {
    updateState({ viewFormat }, true)
  },

  setActiveCategory(activeCategory: MusicCategory): void {
    updateState({ activeCategory }, true)
  },

  toggleShuffle(): void {
    updateState({ shuffle: !state.shuffle }, true)
  },

  toggleRepeat(): void {
    const modes: RepeatMode[] = ['off', 'all', 'one']
    const currentIndex = modes.indexOf(state.repeatMode)
    updateState({ repeatMode: modes[(currentIndex + 1) % modes.length] }, true)
  },

  toggleFavorite(track?: MusicTrack): void {
    if (!track) return
    const id = trackKey(track.provider, track.providerTrackId)
    const exists = state.favorites.some((item) => trackKey(item.provider, item.providerTrackId) === id)
    const favorites = exists
      ? state.favorites.filter((item) => trackKey(item.provider, item.providerTrackId) !== id)
      : [track, ...state.favorites]
    updateState({ favorites }, true)
  },

  isFavorite(trackOrId?: MusicTrack | string): boolean {
    if (!trackOrId) return false
    const id = typeof trackOrId === 'string'
      ? trackOrId
      : trackKey(trackOrId.provider, trackOrId.providerTrackId)
    return state.favorites.some((item) => item.id === id || trackKey(item.provider, item.providerTrackId) === id)
  },

  addToQueue(track?: MusicTrack): void {
    if (!track || state.queue.some((item) => item.id === track.id)) return
    updateState({ queue: [...state.queue, track] }, true)
  },

  removeFromQueue(trackId?: string): void {
    if (!trackId) return
    const result = removeQueueTrack(state.queue, state.queueIndex, trackId)
    if (result.queue === state.queue) return
    const removedActive = state.activeTrack?.id === trackId
    const nextActive = removedActive ? result.queue[result.queueIndex] || null : state.activeTrack
    updateState({
      queue: result.queue,
      queueIndex: result.queueIndex,
      activeTrack: nextActive,
      playbackState: removedActive && nextActive ? 'loading' : removedActive ? 'paused' : state.playbackState,
      currentTime: removedActive ? 0 : state.currentTime,
      duration: removedActive && nextActive?.durationMs ? nextActive.durationMs / 1000 : removedActive ? 0 : state.duration,
      buffering: removedActive && Boolean(nextActive),
    }, true)
  },

  clearQueue(): void {
    providerController?.stop?.()
    updateState({
      queue: [],
      queueIndex: -1,
      activeTrack: null,
      playbackState: 'paused',
      currentTime: 0,
      duration: 0,
      buffering: false,
    }, true)
  },

  async addCustomTrackByUrl(urlOrId: string): Promise<boolean> {
    const providerTrackId = extractYoutubeVideoId(urlOrId)
    if (!providerTrackId) return false
    try {
      const track = await youtubeProvider.resolveTrack(providerTrackId)
      musicStore.playTrack(track)
      return true
    } catch (error) {
      musicStore.setPlaybackError(toMusicError(error, 'YouTube videosu eklenemedi.'))
      return false
    }
  },

  async searchYoutube(query: string): Promise<void> {
    searchAbortController?.abort()
    searchAbortController = null
    const q = query.trim()
    const requestId = ++searchRequestId
    updateState({ searchQuery: q, searchResults: [], error: q ? state.error : null, isSearching: Boolean(q) })
    if (!q) return

    const controller = new AbortController()
    searchAbortController = controller
    try {
      const directVideoId = extractYoutubeVideoId(q)
      const results = directVideoId
        ? [await youtubeProvider.resolveTrack(directVideoId, { signal: controller.signal })]
        : await youtubeProvider.search(q, { signal: controller.signal, limit: 12, regionCode: 'TR' })
      if (requestId !== searchRequestId || controller.signal.aborted) return
      updateState({ searchResults: results, isSearching: false, error: null })
    } catch (error) {
      if (controller.signal.aborted || requestId !== searchRequestId) return
      updateState({ searchResults: [], isSearching: false, error: mapSearchError(error) })
    } finally {
      if (requestId === searchRequestId) searchAbortController = null
    }
  },

  setProvider(provider: MusicProviderId): void {
    if (provider === state.provider) return
    providerController?.stop?.()
    if (provider === 'spotify') {
      providerController = null
      updateState({
        provider,
        providerReady: false,
        playbackState: 'paused',
        buffering: false,
        error: {
          code: 'provider-unsupported',
          message: 'Spotify tam oynatma bu sistemde henüz desteklenmiyor. Spotify uygulamasında açabilirsiniz.',
          provider,
          recoverable: true,
        },
      }, true)
      return
    }
    const youtubeTrack = state.queue.find((track) => track.provider === 'youtube') || MUSIC_PRESETS[0]
    const youtubeIndex = state.queue.findIndex((track) => track.id === youtubeTrack.id)
    const nextQueue = youtubeIndex >= 0 ? state.queue : [...state.queue, youtubeTrack]
    updateState({
      provider,
      providerReady: false,
      error: null,
      activeTrack: youtubeTrack,
      queue: nextQueue,
      queueIndex: youtubeIndex >= 0 ? youtubeIndex : nextQueue.length - 1,
    }, true)
  },

  clearError(): void {
    updateState({ error: null })
  },
}

export function useMusicPlayer(): MusicStore & {
  isPlaying: boolean
  themeConfig: (typeof THEME_CONFIGS)[MusicTheme]
} {
  const snapshot = useSyncExternalStore(musicStore.subscribe, musicStore.getState, musicStore.getState)
  return {
    ...snapshot,
    isPlaying: snapshot.playbackState === 'playing',
    themeConfig: THEME_CONFIGS[snapshot.theme] || THEME_CONFIGS.sunset,
    togglePlay: musicStore.togglePlay,
    playTrack: musicStore.playTrack,
    playNext: musicStore.playNext,
    nextTrack: musicStore.nextTrack,
    prevTrack: musicStore.prevTrack,
    setVolume: musicStore.setVolume,
    toggleMute: musicStore.toggleMute,
    seekTo: musicStore.seekTo,
    setTheme: musicStore.setTheme,
    setViewFormat: musicStore.setViewFormat,
    setActiveCategory: musicStore.setActiveCategory,
    toggleShuffle: musicStore.toggleShuffle,
    toggleRepeat: musicStore.toggleRepeat,
    toggleFavorite: musicStore.toggleFavorite,
    isFavorite: musicStore.isFavorite,
    addToQueue: musicStore.addToQueue,
    removeFromQueue: musicStore.removeFromQueue,
    clearQueue: musicStore.clearQueue,
    addCustomTrackByUrl: musicStore.addCustomTrackByUrl,
    searchYoutube: musicStore.searchYoutube,
    setProvider: musicStore.setProvider,
    clearError: musicStore.clearError,
  }
}

export { MUSIC_CATEGORIES, MUSIC_PRESETS, THEME_CONFIGS }
export type { MusicCategory, MusicPreset, MusicTheme } from './catalog'
export type {
  MusicError,
  MusicProviderId,
  MusicTrack,
  RepeatMode,
} from './types'
