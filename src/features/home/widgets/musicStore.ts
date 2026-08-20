import { useEffect, useState } from 'react'

export type MusicTheme = 'sunset' | 'cyberpunk' | 'forest' | 'glass' | 'midnight' | 'retro' | 'lofi' | 'aurora' | 'emerald' | 'crimson'

export type MusicCategory = 'all' | 'popular' | 'turkish' | 'lofi' | 'piano' | 'synthwave' | 'jazz' | 'rock' | 'electronic' | 'ambient'

export interface MusicPreset {
  id: string
  title: string
  artist: string
  youtubeId: string
  coverUrl: string
  category?: MusicCategory
  durationStr?: string
}

export const MUSIC_CATEGORIES: { id: MusicCategory; label: string; icon: string }[] = [
  { id: 'all', label: 'Tümü', icon: '✨' },
  { id: 'popular', label: 'Global Hitler', icon: '🔥' },
  { id: 'turkish', label: 'Türkçe Pop & Akustik', icon: '🇹🇷' },
  { id: 'lofi', label: 'Lofi & Chillhop', icon: '☕' },
  { id: 'piano', label: 'Piyano & Odak', icon: '🎹' },
  { id: 'synthwave', label: 'Synthwave & Neon', icon: '⚡' },
  { id: 'jazz', label: 'Caz & Kahve', icon: '🎷' },
  { id: 'rock', label: 'Rock & Indie', icon: '🎸' },
  { id: 'electronic', label: 'Deep House & Elektronik', icon: '🎧' },
  { id: 'ambient', label: 'Doğa & Uyku', icon: '💤' },
]

export const MUSIC_PRESETS: MusicPreset[] = [
  // 1. Lofi & Chill
  {
    id: 'lofi-girl',
    title: 'Lofi Hip Hop Radio - Beats to Relax/Study',
    artist: 'Lofi Girl • 24/7 Canlı Yayın',
    youtubeId: 'jfKfPfyJRdk',
    coverUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
    category: 'lofi',
    durationStr: 'Canlı',
  },
  {
    id: 'lofi-sleep',
    title: 'Lofi Sleep & Deep Rest',
    artist: 'Lofi Girl • Gece Sakinliği',
    youtubeId: 'rUxyKA_-grg',
    coverUrl: 'https://images.unsplash.com/photo-1511295742362-92c96b124e52?auto=format&fit=crop&w=600&q=80',
    category: 'lofi',
    durationStr: 'Canlı',
  },
  {
    id: 'chillhop-cafe',
    title: 'Chillhop Radio - Jazzy & Lofi Beats',
    artist: 'Chillhop Music',
    youtubeId: '5yx6BWlEVcY',
    coverUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=600&q=80',
    category: 'lofi',
    durationStr: 'Canlı',
  },

  // 2. Global Hits
  {
    id: 'blinding-lights',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    youtubeId: '4NRXx6U8ABQ',
    coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    category: 'popular',
    durationStr: '3:20',
  },
  {
    id: 'starboy',
    title: 'Starboy (feat. Daft Punk)',
    artist: 'The Weeknd',
    youtubeId: '34Na4j8AVgA',
    coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    category: 'popular',
    durationStr: '3:50',
  },
  {
    id: 'as-it-was',
    title: 'As It Was',
    artist: 'Harry Styles',
    youtubeId: 'H5v3kku4y6Q',
    coverUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&q=80',
    category: 'popular',
    durationStr: '2:47',
  },
  {
    id: 'levitating',
    title: 'Levitating',
    artist: 'Dua Lipa',
    youtubeId: 'TUVcZfQe-Kw',
    coverUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=600&q=80',
    category: 'popular',
    durationStr: '3:23',
  },

  // 3. Turkish Hits
  {
    id: 'tr-yalniz-cicek',
    title: 'Yalnız Çiçek',
    artist: 'Aleyna Tilki ft. Emrah Karaduman',
    youtubeId: '8qFz5q8B3zM',
    coverUrl: 'https://images.unsplash.com/photo-1487180144351-b8472da7d491?auto=format&fit=crop&w=600&q=80',
    category: 'turkish',
    durationStr: '3:45',
  },
  {
    id: 'tr-dursun-zaman',
    title: 'Dursun Zaman',
    artist: 'Manga ft. Göksel',
    youtubeId: 'Kz9zLhI7b0w',
    coverUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    category: 'turkish',
    durationStr: '4:20',
  },
  {
    id: 'tr-felaket',
    title: 'Felaket',
    artist: 'Ezhel',
    youtubeId: 'Z9p3iA6g_0w',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    category: 'turkish',
    durationStr: '3:30',
  },

  // 4. Synthwave & Cyberpunk
  {
    id: 'synthwave-chill',
    title: 'Synthwave Radio - Chill Retro Vibes',
    artist: 'Lofi Girl • Retrowave & Chill',
    youtubeId: '4xDzrJKXOOY',
    coverUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80',
    category: 'synthwave',
    durationStr: 'Canlı',
  },
  {
    id: 'cyberpunk-ambient',
    title: 'Cyberpunk Ambient Engine 2077',
    artist: 'Sci-Fi Focus Soundscapes',
    youtubeId: 'z48G1i4oXU4',
    coverUrl: 'https://images.unsplash.com/photo-1515260268569-9271009adfdb?auto=format&fit=crop&w=600&q=80',
    category: 'synthwave',
    durationStr: '3:15:00',
  },

  // 5. Piano & Classical Focus
  {
    id: 'peaceful-piano',
    title: 'Peaceful Piano Focus & Study',
    artist: 'Deep Work & Study Melodies',
    youtubeId: 'Dx5qFachd3A',
    coverUrl: 'https://images.unsplash.com/photo-1520523839898-50712825e3a7?auto=format&fit=crop&w=600&q=80',
    category: 'piano',
    durationStr: '3:00:00',
  },
  {
    id: 'classical-focus',
    title: 'Classical Music for Brain Power',
    artist: 'Mozart & Chopin Focus',
    youtubeId: 'jgpJVI3tDbY',
    coverUrl: 'https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&w=600&q=80',
    category: 'piano',
    durationStr: '2:40:00',
  },

  // 6. Jazz & Coffee
  {
    id: 'coffee-jazz',
    title: 'Coffee Shop Bossa & Jazz Lounge',
    artist: 'Smooth Ambient Coffee Jazz',
    youtubeId: 'lP26UCnoH9s',
    coverUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=600&q=80',
    category: 'jazz',
    durationStr: '3:30:00',
  },

  // 7. Rock & Acoustic
  {
    id: 'acoustic-chill',
    title: 'Warm Acoustic Guitar Dreams',
    artist: 'Gentle Guitar & Relaxing Breeze',
    youtubeId: '7NOSDKb0HlU',
    coverUrl: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=600&q=80',
    category: 'rock',
    durationStr: '2:15:00',
  },

  // 8. Electronic & House
  {
    id: 'deep-house-chill',
    title: 'Deep House Relax & Focus Radio',
    artist: 'The Vibe Guide • Live',
    youtubeId: 'hTWKbfoikeg',
    coverUrl: 'https://images.unsplash.com/photo-1571266028243-3716f02d2d2e?auto=format&fit=crop&w=600&q=80',
    category: 'electronic',
    durationStr: 'Canlı',
  },

  // 9. Ambient & Sleep
  {
    id: 'rain-ambient',
    title: 'Rain on Window with Cozy Ambient',
    artist: 'Calm Sleep Sounds',
    youtubeId: 'mPZkdNFkNps',
    coverUrl: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?auto=format&fit=crop&w=600&q=80',
    category: 'ambient',
    durationStr: '8:00:00',
  },
]

export const THEME_CONFIGS: Record<
  MusicTheme,
  {
    name: string
    gradient: string
    badgeBg: string
    accent: string
    glow: string
    desc: string
  }
> = {
  sunset: {
    name: 'Lo-Fi Sunset',
    gradient: 'linear-gradient(180deg, rgba(239, 68, 68, 0.22) 0%, rgba(217, 70, 239, 0.35) 40%, rgba(15, 23, 42, 0.94) 100%)',
    badgeBg: 'rgba(239, 68, 68, 0.25)',
    accent: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.35)',
    desc: 'Sıcak gün batımı ve lo-fi estetiği',
  },
  cyberpunk: {
    name: 'Neon Cyberpunk',
    gradient: 'linear-gradient(180deg, rgba(6, 182, 212, 0.25) 0%, rgba(168, 85, 247, 0.38) 50%, rgba(10, 10, 24, 0.96) 100%)',
    badgeBg: 'rgba(6, 182, 212, 0.25)',
    accent: '#06b6d4',
    glow: 'rgba(6, 182, 212, 0.45)',
    desc: 'Neon mavi ve mor fütüristik parlama',
  },
  forest: {
    name: 'Deep Forest',
    gradient: 'linear-gradient(180deg, rgba(16, 185, 129, 0.22) 0%, rgba(5, 150, 105, 0.35) 45%, rgba(6, 28, 20, 0.95) 100%)',
    badgeBg: 'rgba(16, 185, 129, 0.25)',
    accent: '#10b981',
    glow: 'rgba(16, 185, 129, 0.35)',
    desc: 'Huzurlu zümrüt ve çam ormanı',
  },
  glass: {
    name: 'Frosted Glass',
    gradient: 'linear-gradient(180deg, rgba(255, 255, 255, 0.2) 0%, rgba(148, 163, 184, 0.18) 40%, rgba(15, 23, 42, 0.9) 100%)',
    badgeBg: 'rgba(255, 255, 255, 0.2)',
    accent: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.25)',
    desc: 'Temiz yarı saydam cam görünümü',
  },
  midnight: {
    name: 'Midnight Sky',
    gradient: 'linear-gradient(180deg, rgba(59, 130, 246, 0.22) 0%, rgba(99, 102, 241, 0.35) 45%, rgba(3, 7, 18, 0.97) 100%)',
    badgeBg: 'rgba(59, 130, 246, 0.25)',
    accent: '#6366f1',
    glow: 'rgba(99, 102, 241, 0.4)',
    desc: 'Gece mavisi ve derin yıldız ışıltısı',
  },
  retro: {
    name: 'Retro Amber',
    gradient: 'linear-gradient(180deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.35) 45%, rgba(26, 14, 2, 0.95) 100%)',
    badgeBg: 'rgba(245, 158, 11, 0.25)',
    accent: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.4)',
    desc: 'Kehribar kaset tonları',
  },
  lofi: {
    name: 'Cozy Anime Room',
    gradient: 'linear-gradient(180deg, rgba(236, 72, 153, 0.22) 0%, rgba(139, 92, 246, 0.3) 45%, rgba(23, 15, 38, 0.95) 100%)',
    badgeBg: 'rgba(236, 72, 153, 0.25)',
    accent: '#ec4899',
    glow: 'rgba(236, 72, 153, 0.4)',
    desc: 'Pastel anime & lo-fi odası',
  },
  aurora: {
    name: 'Nordic Aurora',
    gradient: 'linear-gradient(180deg, rgba(45, 212, 191, 0.25) 0%, rgba(56, 189, 248, 0.35) 45%, rgba(4, 21, 37, 0.96) 100%)',
    badgeBg: 'rgba(45, 212, 191, 0.25)',
    accent: '#2dd4bf',
    glow: 'rgba(45, 212, 191, 0.4)',
    desc: 'Kuzey ışıkları ve ferah turkuaz',
  },
  emerald: {
    name: 'Emerald Matrix',
    gradient: 'linear-gradient(180deg, rgba(34, 197, 94, 0.25) 0%, rgba(16, 185, 129, 0.35) 50%, rgba(2, 28, 14, 0.96) 100%)',
    badgeBg: 'rgba(34, 197, 94, 0.25)',
    accent: '#22c55e',
    glow: 'rgba(34, 197, 94, 0.4)',
    desc: 'Zümrüt yeşili matris ışıltısı',
  },
  crimson: {
    name: 'Crimson Velvet',
    gradient: 'linear-gradient(180deg, rgba(244, 63, 94, 0.28) 0%, rgba(190, 18, 60, 0.38) 45%, rgba(28, 2, 8, 0.96) 100%)',
    badgeBg: 'rgba(244, 63, 94, 0.25)',
    accent: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.45)',
    desc: 'Kadife kırmızı ve sıcak tutku',
  },
}

export function extractYoutubeVideoId(urlOrId: string): string | null {
  const str = urlOrId.trim()
  if (!str) return null
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str

  // Format: music.youtube.com/watch?v=... or youtube.com/watch?v=... or youtu.be/... or embed/...
  const regExp = /(?:music\.youtube\.com\/watch\?.*v=|youtube\.com\/(?:embed\/|v\/|watch\?.*v=)|youtu\.be\/)([\w-]{11})/i
  const match = str.match(regExp)
  if (match && match[1]) return match[1]

  // Any other query parameter containing v=11chars
  const vParamMatch = str.match(/[?&]v=([\w-]{11})/)
  if (vParamMatch && vParamMatch[1]) return vParamMatch[1]

  return null
}

export interface MusicPlayerState {
  currentPresetIndex: number
  customPreset: MusicPreset | null
  activeTrack: MusicPreset
  queue: MusicPreset[]
  favorites: MusicPreset[]
  theme: MusicTheme
  viewMode: 'native-player' | 'embedded-yt-music'
  viewFormat: 'art' | 'video'
  activeCategory: MusicCategory
  isPlaying: boolean
  isMuted: boolean
  volume: number
  currentTime: number
  duration: number
  isExpandedModalOpen: boolean
  isModalMaximized: boolean
  shuffle: boolean
  repeatMode: 'off' | 'all' | 'one'
  searchQuery: string
  searchResults: MusicPreset[]
  isSearching: boolean
  playerStatus: 'unstarted' | 'loading' | 'playing' | 'paused' | 'error'
  errorMessage: string | null
}

let playerInstance: any = null

function loadInitialState(): MusicPlayerState {
  let presetIdx = 0
  let custom: MusicPreset | null = null
  let theme: MusicTheme = 'sunset'
  let vol = 80
  let favs: MusicPreset[] = []

  try {
    const savedPreset = localStorage.getItem('minios_yt_preset')
    if (savedPreset !== null) {
      presetIdx = Math.min(Math.max(0, parseInt(savedPreset, 10)), MUSIC_PRESETS.length - 1)
    }

    const savedCustom = localStorage.getItem('minios_yt_custom_track')
    if (savedCustom) {
      custom = JSON.parse(savedCustom)
    }

    const savedTheme = localStorage.getItem('minios_yt_theme') as MusicTheme
    if (savedTheme && THEME_CONFIGS[savedTheme]) {
      theme = savedTheme
    }

    const savedVol = localStorage.getItem('minios_yt_volume')
    if (savedVol !== null) {
      vol = parseInt(savedVol, 10)
    }

    const savedFavs = localStorage.getItem('minios_yt_favorites')
    if (savedFavs) {
      favs = JSON.parse(savedFavs)
    }
  } catch {
    // fallback
  }

  const activeTrack = custom || MUSIC_PRESETS[presetIdx]

  return {
    currentPresetIndex: presetIdx,
    customPreset: custom,
    activeTrack,
    queue: [...MUSIC_PRESETS],
    favorites: favs,
    theme,
    viewMode: 'native-player',
    viewFormat: 'art',
    activeCategory: 'all',
    isPlaying: false,
    isMuted: false,
    volume: vol,
    currentTime: 0,
    duration: 0,
    isExpandedModalOpen: false,
    isModalMaximized: false,
    shuffle: false,
    repeatMode: 'off',
    searchQuery: '',
    searchResults: [],
    isSearching: false,
    playerStatus: 'unstarted',
    errorMessage: null,
  }
}

let state: MusicPlayerState = loadInitialState()
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) {
    l()
  }
}

function updateState(partial: Partial<MusicPlayerState>) {
  state = { ...state, ...partial }
  if (partial.customPreset !== undefined || partial.currentPresetIndex !== undefined) {
    state.activeTrack = state.customPreset || state.queue[state.currentPresetIndex] || MUSIC_PRESETS[0]
  }
  notify()
}

export const musicStore = {
  getState: () => state,

  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  setPlayerInstance: (inst: any) => {
    playerInstance = inst
  },

  getPlayerInstance: () => playerInstance,

  setPlaying: (playing: boolean) => {
    updateState({
      isPlaying: playing,
      playerStatus: playing ? 'playing' : 'paused',
      errorMessage: null,
    })
  },

  setPlayerStatus: (status: MusicPlayerState['playerStatus'], errMsg: string | null = null) => {
    updateState({ playerStatus: status, errorMessage: errMsg })
  },

  setTimeAndDuration: (currentTime: number, duration: number) => {
    updateState({ currentTime, duration })
  },

  togglePlay: () => {
    if (!playerInstance) {
      updateState({ isPlaying: !state.isPlaying })
      return
    }
    try {
      if (state.isPlaying) {
        if (typeof playerInstance.pauseVideo === 'function') {
          playerInstance.pauseVideo()
        }
        updateState({ isPlaying: false, playerStatus: 'paused' })
      } else {
        if (typeof playerInstance.playVideo === 'function') {
          playerInstance.playVideo()
        }
        updateState({ isPlaying: true, playerStatus: 'playing' })
      }
    } catch {
      updateState({ isPlaying: !state.isPlaying })
    }
  },

  playTrack: (indexOrCustom: number | MusicPreset) => {
    if (typeof indexOrCustom === 'number') {
      const idx = Math.min(Math.max(0, indexOrCustom), state.queue.length - 1)
      const selectedTrack = state.queue[idx] || MUSIC_PRESETS[0]

      try {
        localStorage.removeItem('minios_yt_custom_track')
        localStorage.setItem('minios_yt_preset', idx.toString())
      } catch {
        // ignore
      }

      updateState({
        customPreset: null,
        currentPresetIndex: idx,
        activeTrack: selectedTrack,
        isPlaying: true,
        playerStatus: 'loading',
        currentTime: 0,
      })

      if (playerInstance && typeof playerInstance.loadVideoById === 'function') {
        try {
          playerInstance.loadVideoById(selectedTrack.youtubeId)
        } catch {
          // ignore
        }
      }
    } else {
      const customTrack = indexOrCustom
      try {
        localStorage.setItem('minios_yt_custom_track', JSON.stringify(customTrack))
      } catch {
        // ignore
      }

      // Add to queue if not present
      const existingQueueIdx = state.queue.findIndex((q) => q.youtubeId === customTrack.youtubeId)
      let nextQueue = [...state.queue]
      let nextIdx = 0
      if (existingQueueIdx >= 0) {
        nextIdx = existingQueueIdx
      } else {
        nextQueue = [customTrack, ...nextQueue]
        nextIdx = 0
      }

      updateState({
        customPreset: customTrack,
        activeTrack: customTrack,
        queue: nextQueue,
        currentPresetIndex: nextIdx,
        isPlaying: true,
        playerStatus: 'loading',
        currentTime: 0,
      })

      if (playerInstance && typeof playerInstance.loadVideoById === 'function') {
        try {
          playerInstance.loadVideoById(customTrack.youtubeId)
        } catch {
          // ignore
        }
      }
    }
  },

  nextTrack: () => {
    if (state.queue.length === 0) return

    let nextIdx: number
    if (state.shuffle) {
      nextIdx = Math.floor(Math.random() * state.queue.length)
      if (nextIdx === state.currentPresetIndex && state.queue.length > 1) {
        nextIdx = (nextIdx + 1) % state.queue.length
      }
    } else {
      nextIdx = (state.currentPresetIndex + 1) % state.queue.length
    }

    const nextTrackItem = state.queue[nextIdx]
    if (nextTrackItem) {
      musicStore.playTrack(nextTrackItem)
    }
  },

  prevTrack: () => {
    if (state.queue.length === 0) return

    // If played more than 3 seconds, replay from start
    if (state.currentTime > 3) {
      musicStore.seekTo(0)
      return
    }

    const prevIdx = (state.currentPresetIndex - 1 + state.queue.length) % state.queue.length
    const prevTrackItem = state.queue[prevIdx]
    if (prevTrackItem) {
      musicStore.playTrack(prevTrackItem)
    }
  },

  onTrackEnded: () => {
    if (state.repeatMode === 'one') {
      musicStore.seekTo(0)
      if (playerInstance && typeof playerInstance.playVideo === 'function') {
        playerInstance.playVideo()
      }
      return
    }

    if (state.repeatMode === 'off' && state.currentPresetIndex === state.queue.length - 1 && !state.shuffle) {
      updateState({ isPlaying: false, playerStatus: 'paused' })
      return
    }

    musicStore.nextTrack()
  },

  setVolume: (vol: number) => {
    const safeVol = Math.max(0, Math.min(100, vol))
    try {
      localStorage.setItem('minios_yt_volume', safeVol.toString())
    } catch {
      // ignore
    }
    updateState({ volume: safeVol, isMuted: safeVol === 0 })
    if (playerInstance && typeof playerInstance.setVolume === 'function') {
      try {
        playerInstance.setVolume(safeVol)
        if (safeVol > 0 && typeof playerInstance.unMute === 'function') {
          playerInstance.unMute()
        }
      } catch {
        // ignore
      }
    }
  },

  toggleMute: () => {
    const nextMuted = !state.isMuted
    updateState({ isMuted: nextMuted })

    if (playerInstance) {
      try {
        if (nextMuted) {
          if (typeof playerInstance.mute === 'function') playerInstance.mute()
        } else {
          if (typeof playerInstance.unMute === 'function') playerInstance.unMute()
          if (typeof playerInstance.setVolume === 'function') playerInstance.setVolume(state.volume || 50)
        }
      } catch {
        // ignore
      }
    }
  },

  seekTo: (sec: number) => {
    updateState({ currentTime: sec })
    if (playerInstance && typeof playerInstance.seekTo === 'function') {
      try {
        playerInstance.seekTo(sec, true)
      } catch {
        // ignore
      }
    }
  },

  setTheme: (theme: MusicTheme) => {
    try {
      localStorage.setItem('minios_yt_theme', theme)
    } catch {
      // ignore
    }
    updateState({ theme })
  },

  setViewMode: (viewMode: 'native-player' | 'embedded-yt-music') => {
    updateState({ viewMode })
  },

  setViewFormat: (viewFormat: 'art' | 'video') => {
    updateState({ viewFormat })
  },

  setActiveCategory: (category: MusicCategory) => {
    updateState({ activeCategory: category })
  },

  setExpandedModalOpen: (open: boolean) => {
    updateState({ isExpandedModalOpen: open })
  },

  setModalMaximized: (maximized: boolean) => {
    updateState({ isModalMaximized: maximized })
  },

  toggleShuffle: () => {
    updateState({ shuffle: !state.shuffle })
  },

  toggleRepeat: () => {
    const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one']
    const curIdx = modes.indexOf(state.repeatMode)
    const nextMode = modes[(curIdx + 1) % modes.length]
    updateState({ repeatMode: nextMode })
  },

  toggleFavorite: (track?: MusicPreset) => {
    if (!track) return
    const curFavs = state.favorites || []
    const exists = curFavs.some((f) => f && (f.id === track.id || f.youtubeId === track.youtubeId))
    let nextFavs: MusicPreset[]
    if (exists) {
      nextFavs = curFavs.filter((f) => f && f.id !== track.id && f.youtubeId !== track.youtubeId)
    } else {
      nextFavs = [track, ...curFavs]
    }
    try {
      localStorage.setItem('minios_yt_favorites', JSON.stringify(nextFavs))
    } catch {
      // ignore
    }
    updateState({ favorites: nextFavs })
  },

  isFavorite: (trackIdOrYoutubeId?: string): boolean => {
    if (!trackIdOrYoutubeId || !state.favorites) return false
    return state.favorites.some(
      (f) => f && (f.id === trackIdOrYoutubeId || f.youtubeId === trackIdOrYoutubeId),
    )
  },

  addToQueue: (track?: MusicPreset) => {
    if (!track) return
    const curQueue = state.queue || []
    if (!curQueue.some((q) => q && q.youtubeId === track.youtubeId)) {
      updateState({ queue: [...curQueue, track] })
    }
  },

  removeFromQueue: (trackId?: string) => {
    if (!trackId || !state.queue || state.queue.length <= 1) return
    const nextQueue = state.queue.filter((q) => q && q.id !== trackId)
    updateState({ queue: nextQueue })
  },

  addCustomTrackByUrl: (urlOrQuery: string): boolean => {
    const trimmed = urlOrQuery.trim()
    if (!trimmed) return false

    const videoId = extractYoutubeVideoId(trimmed)

    if (videoId) {
      const newTrack: MusicPreset = {
        id: `yt-${videoId}-${Date.now()}`,
        title: 'Özel YouTube Parçası',
        artist: 'YouTube Music',
        youtubeId: videoId,
        coverUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        durationStr: 'YouTube',
      }
      musicStore.playTrack(newTrack)
      return true
    }

    // If query string (e.g. "Dua Lipa", "Tarkan"), find best match from local catalog or construct query track
    const match = MUSIC_PRESETS.find(
      (p) =>
        p.title.toLowerCase().includes(trimmed.toLowerCase()) ||
        p.artist.toLowerCase().includes(trimmed.toLowerCase()),
    )

    if (match) {
      musicStore.playTrack(match)
      return true
    }

    return false
  },

  searchYoutube: async (query: string) => {
    const q = query.trim()
    if (!q) {
      updateState({ searchQuery: '', searchResults: [], isSearching: false })
      return
    }

    updateState({ searchQuery: q, isSearching: true })

    // Check if it's a direct YouTube URL or ID
    const directId = extractYoutubeVideoId(q)
    if (directId) {
      const directTrack: MusicPreset = {
        id: `yt-${directId}-${Date.now()}`,
        title: 'Doğrudan YouTube Linki',
        artist: 'YouTube Music Player',
        youtubeId: directId,
        coverUrl: `https://img.youtube.com/vi/${directId}/hqdefault.jpg`,
        durationStr: 'YouTube',
      }
      updateState({ searchResults: [directTrack], isSearching: false })
      return
    }

    // 1. Filter local presets
    const localMatches = MUSIC_PRESETS.filter(
      (p) =>
        p.title.toLowerCase().includes(q.toLowerCase()) ||
        p.artist.toLowerCase().includes(q.toLowerCase()) ||
        (p.category && p.category.toLowerCase().includes(q.toLowerCase())),
    )

    // 2. Fetch live suggestions from YouTube Suggest API
    try {
      const res = await fetch(
        `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(q)}`,
      )
      if (res.ok) {
        const text = await res.text()
        // Format is window.google.ac.h(["query",[["suggestion1",0],...]])
        const match = text.match(/\["(?:[^"\\]|\\.)*",\s*(\[[\s\S]*\])\]\)/)
        if (match && match[1]) {
          const suggestions = JSON.parse(match[1]) as [string, number][]
          const queryItems: MusicPreset[] = suggestions.slice(0, 8).map(([suggestion], idx) => {
            // Check if matches any preset
            const foundPreset = MUSIC_PRESETS.find((p) =>
              p.title.toLowerCase().includes(suggestion.toLowerCase()) ||
              p.artist.toLowerCase().includes(suggestion.toLowerCase()),
            )
            if (foundPreset) return foundPreset

            return {
              id: `suggest-${idx}-${encodeURIComponent(suggestion)}`,
              title: suggestion,
              artist: 'YouTube Önerisi (Aramak için tıkla)',
              youtubeId: '',
              coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
            }
          })

          const combined = [...localMatches]
          for (const item of queryItems) {
            if (!combined.some((c) => c.title.toLowerCase() === item.title.toLowerCase())) {
              combined.push(item)
            }
          }

          updateState({ searchResults: combined, isSearching: false })
          return
        }
      }
    } catch {
      // ignore network errors
    }

    updateState({ searchResults: localMatches, isSearching: false })
  },
}

export function useMusicPlayer() {
  const [storeState, setStoreState] = useState(musicStore.getState())

  useEffect(() => {
    const unsubscribe = musicStore.subscribe(() => {
      setStoreState(musicStore.getState())
    })
    return unsubscribe
  }, [])

  return {
    ...storeState,
    themeConfig: THEME_CONFIGS[storeState.theme] || THEME_CONFIGS.sunset,
    togglePlay: musicStore.togglePlay,
    playTrack: musicStore.playTrack,
    nextTrack: musicStore.nextTrack,
    prevTrack: musicStore.prevTrack,
    setVolume: musicStore.setVolume,
    toggleMute: musicStore.toggleMute,
    seekTo: musicStore.seekTo,
    setTheme: musicStore.setTheme,
    setViewMode: musicStore.setViewMode,
    setViewFormat: musicStore.setViewFormat,
    setActiveCategory: musicStore.setActiveCategory,
    setExpandedModalOpen: musicStore.setExpandedModalOpen,
    setModalMaximized: musicStore.setModalMaximized,
    toggleShuffle: musicStore.toggleShuffle,
    toggleRepeat: musicStore.toggleRepeat,
    toggleFavorite: musicStore.toggleFavorite,
    isFavorite: musicStore.isFavorite,
    addToQueue: musicStore.addToQueue,
    removeFromQueue: musicStore.removeFromQueue,
    addCustomTrackByUrl: musicStore.addCustomTrackByUrl,
    searchYoutube: musicStore.searchYoutube,
  }
}
