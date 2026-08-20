import { useEffect, useState } from 'react'

export type MusicTheme = 'sunset' | 'cyberpunk' | 'forest' | 'glass' | 'midnight' | 'retro' | 'lofi'

export interface MusicPreset {
  id: string
  title: string
  artist: string
  youtubeId: string
  coverUrl: string
}

export const MUSIC_PRESETS: MusicPreset[] = [
  {
    id: 'lofi-girl',
    title: 'Lofi Hip Hop Radio',
    artist: 'Lofi Girl • 24/7 Chill',
    youtubeId: 'jfKfPfyJRdk',
    coverUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'synthwave-chill',
    title: 'Synthwave / Retro Vibes',
    artist: 'Chillwave & Retrowave',
    youtubeId: '4xDzrJKXOOY',
    coverUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'peaceful-piano',
    title: 'Peaceful Piano Focus',
    artist: 'Deep Work & Study Melodies',
    youtubeId: 'Dx5qFachd3A',
    coverUrl: 'https://images.unsplash.com/photo-1520523839898-50712825e3a7?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'coffee-jazz',
    title: 'Coffee Shop Bossa & Jazz',
    artist: 'Smooth Ambient Lounge',
    youtubeId: 'lP26UCnoH9s',
    coverUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'cyberpunk-ambient',
    title: 'Cyberpunk Ambient Engine',
    artist: 'Sci-Fi Focus Soundscapes',
    youtubeId: 'z48G1i4oXU4',
    coverUrl: 'https://images.unsplash.com/photo-1515260268569-9271009adfdb?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'acoustic-chill',
    title: 'Warm Acoustic Dreams',
    artist: 'Gentle Guitar & Relax',
    youtubeId: '7NOSDKb0HlU',
    coverUrl: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=600&q=80',
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
    name: 'Cozy Room',
    gradient: 'linear-gradient(180deg, rgba(236, 72, 153, 0.22) 0%, rgba(139, 92, 246, 0.3) 45%, rgba(23, 15, 38, 0.95) 100%)',
    badgeBg: 'rgba(236, 72, 153, 0.25)',
    accent: '#ec4899',
    glow: 'rgba(236, 72, 153, 0.4)',
    desc: 'Pastel anime & lo-fi odası',
  },
}

export function extractYoutubeVideoId(urlOrId: string): string | null {
  const str = urlOrId.trim()
  if (!str) return null
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  const match = str.match(regExp)
  return match ? match[1] : null
}

export interface MusicPlayerState {
  currentPresetIndex: number
  customPreset: MusicPreset | null
  activeTrack: MusicPreset
  theme: MusicTheme
  viewMode: 'native-player' | 'embedded-yt-music'
  isPlaying: boolean
  isMuted: boolean
  volume: number
  currentTime: number
  duration: number
  isExpandedModalOpen: boolean
}

let playerInstance: any = null

function loadInitialState(): MusicPlayerState {
  let presetIdx = 0
  let custom: MusicPreset | null = null
  let theme: MusicTheme = 'sunset'
  let vol = 80

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
  } catch {
    // fallback
  }

  const activeTrack = custom || MUSIC_PRESETS[presetIdx]

  return {
    currentPresetIndex: presetIdx,
    customPreset: custom,
    activeTrack,
    theme,
    viewMode: 'native-player',
    isPlaying: false,
    isMuted: false,
    volume: vol,
    currentTime: 0,
    duration: 0,
    isExpandedModalOpen: false,
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
    state.activeTrack = state.customPreset || MUSIC_PRESETS[state.currentPresetIndex]
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

  setPlaying: (playing: boolean) => {
    updateState({ isPlaying: playing })
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
        playerInstance.pauseVideo()
        updateState({ isPlaying: false })
      } else {
        playerInstance.playVideo()
        updateState({ isPlaying: true })
      }
    } catch {
      updateState({ isPlaying: !state.isPlaying })
    }
  },

  playTrack: (indexOrCustom: number | MusicPreset) => {
    if (typeof indexOrCustom === 'number') {
      const idx = Math.min(Math.max(0, indexOrCustom), MUSIC_PRESETS.length - 1)
      try {
        localStorage.removeItem('minios_yt_custom_track')
        localStorage.setItem('minios_yt_preset', idx.toString())
      } catch {
        // ignore
      }
      updateState({
        customPreset: null,
        currentPresetIndex: idx,
        activeTrack: MUSIC_PRESETS[idx],
        isPlaying: true,
      })
    } else {
      try {
        localStorage.setItem('minios_yt_custom_track', JSON.stringify(indexOrCustom))
      } catch {
        // ignore
      }
      updateState({
        customPreset: indexOrCustom,
        activeTrack: indexOrCustom,
        isPlaying: true,
      })
    }
  },

  nextTrack: () => {
    const nextIdx = (state.currentPresetIndex + 1) % MUSIC_PRESETS.length
    musicStore.playTrack(nextIdx)
  },

  prevTrack: () => {
    const prevIdx = (state.currentPresetIndex - 1 + MUSIC_PRESETS.length) % MUSIC_PRESETS.length
    musicStore.playTrack(prevIdx)
  },

  setVolume: (vol: number) => {
    const safeVol = Math.max(0, Math.min(100, vol))
    try {
      localStorage.setItem('minios_yt_volume', safeVol.toString())
    } catch {
      // ignore
    }
    updateState({ volume: safeVol })
    if (playerInstance && typeof playerInstance.setVolume === 'function') {
      playerInstance.setVolume(safeVol)
      if (safeVol > 0 && state.isMuted) {
        playerInstance.unMute()
        updateState({ isMuted: false })
      }
    }
  },

  toggleMute: () => {
    if (!playerInstance) {
      updateState({ isMuted: !state.isMuted })
      return
    }
    try {
      if (state.isMuted) {
        playerInstance.unMute()
        playerInstance.setVolume(state.volume || 50)
        updateState({ isMuted: false })
      } else {
        playerInstance.mute()
        updateState({ isMuted: true })
      }
    } catch {
      updateState({ isMuted: !state.isMuted })
    }
  },

  seekTo: (sec: number) => {
    updateState({ currentTime: sec })
    if (playerInstance && typeof playerInstance.seekTo === 'function') {
      playerInstance.seekTo(sec, true)
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

  setExpandedModalOpen: (open: boolean) => {
    updateState({ isExpandedModalOpen: open })
  },

  addCustomTrackByUrl: (urlOrId: string): boolean => {
    const videoId = extractYoutubeVideoId(urlOrId)
    if (!videoId) return false

    const newTrack: MusicPreset = {
      id: `custom-${Date.now()}`,
      title: 'Özel YouTube Akışı',
      artist: 'YouTube Music Player',
      youtubeId: videoId,
      coverUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    }

    musicStore.playTrack(newTrack)
    return true
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
    setExpandedModalOpen: musicStore.setExpandedModalOpen,
    addCustomTrackByUrl: musicStore.addCustomTrackByUrl,
  }
}
