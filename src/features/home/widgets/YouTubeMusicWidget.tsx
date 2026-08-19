import React, { useEffect, useRef, useState } from 'react'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js'
import FastForward from 'lucide-react/dist/esm/icons/fast-forward.js'
import Globe from 'lucide-react/dist/esm/icons/globe.js'
import ListMusic from 'lucide-react/dist/esm/icons/list-music.js'
import Maximize2 from 'lucide-react/dist/esm/icons/maximize-2.js'
import Minimize2 from 'lucide-react/dist/esm/icons/minimize-2.js'
import Music2 from 'lucide-react/dist/esm/icons/music-2.js'
import Palette from 'lucide-react/dist/esm/icons/palette.js'
import Pause from 'lucide-react/dist/esm/icons/pause.js'
import Play from 'lucide-react/dist/esm/icons/play.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import Radio from 'lucide-react/dist/esm/icons/radio.js'
import Rewind from 'lucide-react/dist/esm/icons/rewind.js'
import RotateCw from 'lucide-react/dist/esm/icons/rotate-cw.js'
import Volume2 from 'lucide-react/dist/esm/icons/volume-2.js'
import VolumeX from 'lucide-react/dist/esm/icons/volume-x.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import Youtube from 'lucide-react/dist/esm/icons/youtube.js'

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

function extractYoutubeVideoId(urlOrId: string): string | null {
  const str = urlOrId.trim()
  if (!str) return null
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  const match = str.match(regExp)
  return match ? match[1] : null
}

export interface YouTubeMusicWidgetProps {
  variant?: 'tall' | 'bottom-bar'
  onHide?: () => void
}

export function YouTubeMusicWidget({ variant = 'bottom-bar', onHide }: YouTubeMusicWidgetProps) {
  // Mode: 'native-player' (custom styled player) | 'embedded-yt-music' (embedded music.youtube.com web view)
  const [viewMode, setViewMode] = useState<'native-player' | 'embedded-yt-music'>('native-player')
  const [isExpandedModalOpen, setIsExpandedModalOpen] = useState(false)
  const [iframeRefreshKey, setIframeRefreshKey] = useState(0)

  const [currentPresetIndex, setCurrentPresetIndex] = useState<number>(() => {
    const saved = localStorage.getItem('minios_yt_preset')
    return saved !== null ? Math.min(Math.max(0, parseInt(saved, 10)), MUSIC_PRESETS.length - 1) : 0
  })

  const [theme, setTheme] = useState<MusicTheme>(() => {
    const saved = localStorage.getItem('minios_yt_theme') as MusicTheme
    return saved && THEME_CONFIGS[saved] ? saved : 'sunset'
  })

  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(80)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [customUrlInput, setCustomUrlInput] = useState('')
  const [showPresetsModal, setShowPresetsModal] = useState(false)
  const [showThemeModal, setShowThemeModal] = useState(false)
  const [customPreset, setCustomPreset] = useState<MusicPreset | null>(() => {
    const saved = localStorage.getItem('minios_yt_custom_track')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return null
      }
    }
    return null
  })

  const activeTrack = customPreset || MUSIC_PRESETS[currentPresetIndex]
  const currentThemeConfig = THEME_CONFIGS[theme]

  const iframeContainerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const timerIntervalRef = useRef<number | null>(null)

  // Save theme & preset index
  useEffect(() => {
    localStorage.setItem('minios_yt_theme', theme)
  }, [theme])

  useEffect(() => {
    if (!customPreset) {
      localStorage.setItem('minios_yt_preset', currentPresetIndex.toString())
    }
  }, [currentPresetIndex, customPreset])

  // Load YouTube Iframe API engine for native player
  useEffect(() => {
    if (viewMode !== 'native-player') return

    let checkInterval: number | null = null

    function initPlayer() {
      if (!window.YT || !window.YT.Player) return false
      if (!iframeContainerRef.current) return false

      if (playerRef.current) {
        try {
          playerRef.current.destroy()
        } catch {
          // ignore
        }
      }

      const targetDiv = document.createElement('div')
      targetDiv.id = 'yt-hidden-player-node'
      iframeContainerRef.current.innerHTML = ''
      iframeContainerRef.current.appendChild(targetDiv)

      playerRef.current = new window.YT.Player(targetDiv, {
        height: '100%',
        width: '100%',
        videoId: activeTrack.youtubeId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          playsinline: 1,
        },
        events: {
          onReady: (event: any) => {
            event.target.setVolume(volume)
            if (isPlaying) {
              event.target.playVideo()
            }
          },
          onStateChange: (event: any) => {
            if (event.data === 1) {
              setIsPlaying(true)
            } else if (event.data === 2 || event.data === 0) {
              setIsPlaying(false)
            }
          },
        },
      })

      return true
    }

    if (!window.YT) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      const firstScriptTag = document.getElementsByTagName('script')[0]
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag)

      window.onYouTubeIframeAPIReady = () => {
        initPlayer()
      }
    } else {
      initPlayer()
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval)
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [activeTrack.youtubeId, viewMode])

  // Track playback time update
  useEffect(() => {
    if (isPlaying && viewMode === 'native-player') {
      timerIntervalRef.current = window.setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          try {
            const cur = playerRef.current.getCurrentTime() || 0
            const dur = playerRef.current.getDuration() || 0
            setCurrentTime(cur)
            setDuration(dur)
          } catch {
            // ignore
          }
        }
      }, 800)
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [isPlaying, viewMode])

  function handleTogglePlay() {
    if (!playerRef.current) return
    try {
      if (isPlaying) {
        playerRef.current.pauseVideo()
        setIsPlaying(false)
      } else {
        playerRef.current.playVideo()
        setIsPlaying(true)
      }
    } catch {
      setIsPlaying(!isPlaying)
    }
  }

  function handleNextTrack() {
    setCustomPreset(null)
    localStorage.removeItem('minios_yt_custom_track')
    setCurrentPresetIndex((prev) => (prev + 1) % MUSIC_PRESETS.length)
    setIsPlaying(true)
  }

  function handlePrevTrack() {
    setCustomPreset(null)
    localStorage.removeItem('minios_yt_custom_track')
    setCurrentPresetIndex((prev) => (prev - 1 + MUSIC_PRESETS.length) % MUSIC_PRESETS.length)
    setIsPlaying(true)
  }

  function handleVolumeChange(newVol: number) {
    setVolume(newVol)
    if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
      playerRef.current.setVolume(newVol)
      if (newVol > 0 && isMuted) {
        playerRef.current.unMute()
        setIsMuted(false)
      }
    }
  }

  function handleToggleMute() {
    if (!playerRef.current) return
    if (isMuted) {
      playerRef.current.unMute()
      setIsMuted(false)
      playerRef.current.setVolume(volume || 50)
    } else {
      playerRef.current.mute()
      setIsMuted(true)
    }
  }

  function handleSeek(sec: number) {
    setCurrentTime(sec)
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(sec, true)
    }
  }

  function handleAddCustomTrack(e: React.FormEvent) {
    e.preventDefault()
    const raw = customUrlInput.trim()
    if (!raw) return
    const videoId = extractYoutubeVideoId(raw)
    if (!videoId) {
      alert('Lütfen geçerli bir YouTube video linki veya ID girin!')
      return
    }

    const newTrack: MusicPreset = {
      id: `custom-${Date.now()}`,
      title: 'Özel YouTube Akışı',
      artist: 'YouTube Music Player',
      youtubeId: videoId,
      coverUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    }

    setCustomPreset(newTrack)
    localStorage.setItem('minios_yt_custom_track', JSON.stringify(newTrack))
    setCustomUrlInput('')
    setShowPresetsModal(false)
    setIsPlaying(true)
  }

  function formatTime(seconds: number) {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  if (variant === 'bottom-bar') {
    return (
      <div
        className="yt-music-bottom-bar-card glass-widget-card"
        style={
          {
            '--yt-accent': currentThemeConfig.accent,
            '--yt-glow': currentThemeConfig.glow,
          } as React.CSSProperties
        }
      >
        {/* Hidden YouTube Iframe Engine */}
        <div className="yt-hidden-frame-holder" ref={iframeContainerRef} />

        {/* Floating Theme Chooser Dropdown */}
        {showThemeModal && (
          <div className="yt-popup-panel yt-popup-panel--bottom">
            <div className="yt-popup-header">
              <span>Tema Seç</span>
              <button
                type="button"
                className="yt-popup-close"
                onClick={() => setShowThemeModal(false)}
              >
                <X size={12} />
              </button>
            </div>
            <div className="yt-theme-grid">
              {(Object.keys(THEME_CONFIGS) as MusicTheme[]).map((tKey) => {
                const conf = THEME_CONFIGS[tKey]
                const isActive = theme === tKey
                return (
                  <button
                    key={tKey}
                    type="button"
                    className={`yt-theme-option ${isActive ? 'yt-theme-option--active' : ''}`}
                    onClick={() => {
                      setTheme(tKey)
                      setShowThemeModal(false)
                    }}
                  >
                    <div
                      className="yt-theme-swatch"
                      style={{ background: conf.gradient }}
                    />
                    <div className="yt-theme-info">
                      <span className="yt-theme-title">{conf.name}</span>
                      <span className="yt-theme-sub">{conf.desc}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Floating Presets & Custom URL Panel */}
        {showPresetsModal && (
          <div className="yt-popup-panel yt-popup-panel--bottom">
            <div className="yt-popup-header">
              <span>Müzik & YouTube Akışı</span>
              <button
                type="button"
                className="yt-popup-close"
                onClick={() => setShowPresetsModal(false)}
              >
                <X size={12} />
              </button>
            </div>

            {/* Custom URL Input Form */}
            <form className="yt-custom-form" onSubmit={handleAddCustomTrack}>
              <div className="yt-custom-input-wrapper">
                <Youtube size={12} className="yt-custom-icon" />
                <input
                  type="text"
                  className="yt-custom-input"
                  placeholder="YouTube linki veya ID..."
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                />
              </div>
              <button type="submit" className="yt-custom-submit-btn" title="Çal">
                <Plus size={11} />
                <span>Çal</span>
              </button>
            </form>

            <div className="yt-presets-list">
              <span className="yt-presets-section-title">Hazır İstasyonlar</span>
              {MUSIC_PRESETS.map((preset, idx) => {
                const isSelected = !customPreset && currentPresetIndex === idx
                return (
                  <div
                    key={preset.id}
                    className={`yt-preset-item ${isSelected ? 'yt-preset-item--active' : ''}`}
                    onClick={() => {
                      setCustomPreset(null)
                      localStorage.removeItem('minios_yt_custom_track')
                      setCurrentPresetIndex(idx)
                      setShowPresetsModal(false)
                      setIsPlaying(true)
                    }}
                  >
                    <img src={preset.coverUrl} alt={preset.title} className="yt-preset-thumb" />
                    <div className="yt-preset-details">
                      <span className="yt-preset-name">{preset.title}</span>
                      <span className="yt-preset-artist">{preset.artist}</span>
                    </div>
                    {isSelected && (
                      <span className="yt-active-pill">Çalıyor</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 1. Left: Track Info & Equalizer */}
        <div className="yt-bottom-left-track">
          <div className="yt-bottom-thumb-box" onClick={() => setShowPresetsModal((p) => !p)}>
            <img src={activeTrack.coverUrl} alt={activeTrack.title} className="yt-bottom-thumb-img" />
          </div>

          <div className="yt-bottom-text-info">
            <div className="yt-bottom-title-line" title={activeTrack.title}>
              {activeTrack.title}
            </div>
            <div className="yt-bottom-artist-line" title={activeTrack.artist}>
              {activeTrack.artist}
            </div>
          </div>

          {/* Equalizer Bars */}
          <div className={`yt-wave-bars yt-wave-bars--bottom ${isPlaying ? 'yt-wave-bars--playing' : ''}`}>
            <span className="yt-bar b1" />
            <span className="yt-bar b2" />
            <span className="yt-bar b3" />
            <span className="yt-bar b4" />
          </div>
        </div>

        {/* 2. Center: Controls & Seekbar */}
        <div className="yt-bottom-center-area">
          <div className="yt-bottom-controls-row">
            <button
              type="button"
              className="yt-control-btn yt-control-btn--mini"
              onClick={handlePrevTrack}
              title="Önceki İstasyon"
            >
              <Rewind size={13} />
            </button>

            <button
              type="button"
              className="yt-play-button yt-play-button--mini"
              onClick={handleTogglePlay}
              title={isPlaying ? 'Durdur' : 'Oynat'}
              style={{
                boxShadow: `0 0 12px ${currentThemeConfig.glow}, 0 2px 6px rgba(0,0,0,0.25)`,
              }}
            >
              {isPlaying ? (
                <Pause size={13} className="text-slate-900 fill-current" />
              ) : (
                <Play size={13} className="text-slate-900 fill-current translate-x-0.5" />
              )}
            </button>

            <button
              type="button"
              className="yt-control-btn yt-control-btn--mini"
              onClick={handleNextTrack}
              title="Sonraki İstasyon"
            >
              <FastForward size={13} />
            </button>
          </div>

          {duration > 0 && (
            <div className="yt-bottom-seek-row">
              <span className="yt-time-micro">{formatTime(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration}
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                className="yt-seek-slider yt-seek-slider--mini"
              />
              <span className="yt-time-micro">{formatTime(duration)}</span>
            </div>
          )}
        </div>

        {/* 3. Right: Volume Slider, Stations, Theme, Expand, Close/Hide */}
        <div className="yt-bottom-right-area">
          <div className="yt-volume-mini-box">
            <button
              type="button"
              className="yt-mute-btn"
              onClick={handleToggleMute}
              title={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
            >
              {isMuted || volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseInt(e.target.value, 10))}
              className="yt-volume-slider yt-volume-slider--mini"
              title={`Ses: %${isMuted ? 0 : volume}`}
            />
          </div>

          <button
            type="button"
            className="yt-icon-btn yt-icon-btn--mini"
            onClick={() => {
              setShowPresetsModal((p) => !p)
              setShowThemeModal(false)
            }}
            title="İstasyonlar & YouTube Linki"
          >
            <ListMusic size={13} />
          </button>

          <button
            type="button"
            className="yt-icon-btn yt-icon-btn--mini"
            onClick={() => {
              setShowThemeModal((p) => !p)
              setShowPresetsModal(false)
            }}
            title="Temayı Değiştir"
          >
            <Palette size={13} />
          </button>

          <button
            type="button"
            className="yt-icon-btn yt-icon-btn--mini"
            onClick={() => setIsExpandedModalOpen(true)}
            title="Genişletilmiş Görünüm & YouTube Web"
          >
            <Maximize2 size={13} />
          </button>

          {onHide && (
            <button
              type="button"
              className="yt-icon-btn yt-icon-btn--mini yt-icon-btn--hide"
              onClick={onHide}
              title="Müzik Çaları Gizle"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Expanded Modal View */}
        {isExpandedModalOpen && (
          <div className="yt-modal-overlay" onClick={() => setIsExpandedModalOpen(false)}>
            <div
              className="yt-modal-content"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="yt-modal-header">
                <div className="yt-modal-title-group">
                  <div className="yt-badge" style={{ backgroundColor: '#ef4444' }}>
                    <Youtube size={14} className="text-white fill-current" />
                    <span>YouTube Music Detaylı Ekran</span>
                  </div>
                  <span className="yt-modal-hint">Google hesabınızla giriş yapabilir, tüm kitaplığınızı yönetebilirsiniz.</span>
                </div>

                <div className="yt-modal-header-actions">
                  <a
                    href="https://music.youtube.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="yt-modal-btn-link"
                  >
                    <ExternalLink size={13} />
                    <span>Tarayıcıda Aç</span>
                  </a>

                  <button
                    type="button"
                    className="yt-modal-close"
                    onClick={() => setIsExpandedModalOpen(false)}
                    aria-label="Kapat"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="yt-modal-iframe-wrapper">
                <iframe
                  src="https://music.youtube.com"
                  title="YouTube Music Detailed View"
                  className="yt-modal-iframe"
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-presentation"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="yt-music-card glass-widget-card yt-music-card--tall"
      style={
        {
          '--yt-accent': currentThemeConfig.accent,
          '--yt-glow': currentThemeConfig.glow,
        } as React.CSSProperties
      }
    >
      {/* Hidden YouTube Iframe Engine for Native Mode */}
      <div className="yt-hidden-frame-holder" ref={iframeContainerRef} />

      {/* VIEW MODE 1: NATIVE STYLED GLASS PLAYER */}
      {viewMode === 'native-player' ? (
        <div
          className="yt-music-backdrop"
          style={{
            backgroundImage: `url('${activeTrack.coverUrl}')`,
          }}
        >
          <div
            className="yt-music-overlay-gradient"
            style={{ background: currentThemeConfig.gradient }}
          />

          {/* Top Control Bar: Mode Toggle, Theme & Presets */}
          <div className="yt-music-topbar">
            {/* View Switcher Tabs */}
            <div className="yt-mode-pill-tabs">
              <button
                type="button"
                className="yt-mode-tab yt-mode-tab--active"
                title="Minimalist Cam Oynatıcı"
              >
                <Music2 size={11} />
                <span>Oynatıcı</span>
              </button>
              <button
                type="button"
                className="yt-mode-tab"
                onClick={() => {
                  if (playerRef.current && isPlaying) playerRef.current.pauseVideo()
                  setIsPlaying(false)
                  setViewMode('embedded-yt-music')
                }}
                title="YouTube Music Web Ekranını Aç"
              >
                <Globe size={11} />
                <span>YT Web</span>
              </button>
            </div>

            <div className="yt-topbar-actions">
              {/* Theme Selector Button */}
              <button
                type="button"
                className="yt-icon-btn"
                onClick={() => {
                  setShowThemeModal((p) => !p)
                  setShowPresetsModal(false)
                }}
                title="Temayı Değiştir"
              >
                <Palette size={13} />
              </button>

              {/* Presets & Link Button */}
              <button
                type="button"
                className="yt-icon-btn"
                onClick={() => {
                  setShowPresetsModal((p) => !p)
                  setShowThemeModal(false)
                }}
                title="İstasyonlar & YouTube Linki"
              >
                <ListMusic size={13} />
              </button>

              {/* Expand Detailed Modal Button */}
              <button
                type="button"
                className="yt-icon-btn"
                onClick={() => setIsExpandedModalOpen(true)}
                title="Detaylı Görünüm & Tam Ekran"
              >
                <Maximize2 size={13} />
              </button>

              {onHide && (
                <button
                  type="button"
                  className="yt-icon-btn yt-icon-btn--hide"
                  onClick={onHide}
                  title="Müzik Çaları Gizle"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Floating Theme Chooser Dropdown */}
          {showThemeModal && (
            <div className="yt-popup-panel">
              <div className="yt-popup-header">
                <span>Tema Seç</span>
                <button
                  type="button"
                  className="yt-popup-close"
                  onClick={() => setShowThemeModal(false)}
                >
                  <X size={12} />
                </button>
              </div>
              <div className="yt-theme-grid">
                {(Object.keys(THEME_CONFIGS) as MusicTheme[]).map((tKey) => {
                  const conf = THEME_CONFIGS[tKey]
                  const isActive = theme === tKey
                  return (
                    <button
                      key={tKey}
                      type="button"
                      className={`yt-theme-option ${isActive ? 'yt-theme-option--active' : ''}`}
                      onClick={() => {
                        setTheme(tKey)
                        setShowThemeModal(false)
                      }}
                    >
                      <div
                        className="yt-theme-swatch"
                        style={{ background: conf.gradient }}
                      />
                      <div className="yt-theme-info">
                        <span className="yt-theme-title">{conf.name}</span>
                        <span className="yt-theme-sub">{conf.desc}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Floating Presets & Custom URL Panel */}
          {showPresetsModal && (
            <div className="yt-popup-panel">
              <div className="yt-popup-header">
                <span>Müzik & YouTube Akışı</span>
                <button
                  type="button"
                  className="yt-popup-close"
                  onClick={() => setShowPresetsModal(false)}
                >
                  <X size={12} />
                </button>
              </div>

              {/* Custom URL Input Form */}
              <form className="yt-custom-form" onSubmit={handleAddCustomTrack}>
                <div className="yt-custom-input-wrapper">
                  <Youtube size={12} className="yt-custom-icon" />
                  <input
                    type="text"
                    className="yt-custom-input"
                    placeholder="YouTube linki..."
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                  />
                </div>
                <button type="submit" className="yt-custom-submit-btn" title="Çal">
                  <Plus size={11} />
                  <span>Çal</span>
                </button>
              </form>

              <div className="yt-presets-list">
                <span className="yt-presets-section-title">Hazır İstasyonlar</span>
                {MUSIC_PRESETS.map((preset, idx) => {
                  const isSelected = !customPreset && currentPresetIndex === idx
                  return (
                    <div
                      key={preset.id}
                      className={`yt-preset-item ${isSelected ? 'yt-preset-item--active' : ''}`}
                      onClick={() => {
                        setCustomPreset(null)
                        localStorage.removeItem('minios_yt_custom_track')
                        setCurrentPresetIndex(idx)
                        setShowPresetsModal(false)
                        setIsPlaying(true)
                      }}
                    >
                      <img src={preset.coverUrl} alt={preset.title} className="yt-preset-thumb" />
                      <div className="yt-preset-details">
                        <span className="yt-preset-name">{preset.title}</span>
                        <span className="yt-preset-artist">{preset.artist}</span>
                      </div>
                      {isSelected && (
                        <span className="yt-active-pill">Çalıyor</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Center Tall Space: Cover Art & Live Wave Visualizer */}
          <div className="yt-tall-center-block">
            <div className="yt-album-art-circle">
              <img src={activeTrack.coverUrl} alt={activeTrack.title} className="yt-art-img" />
            </div>

            {/* Live Wave Visualizer */}
            <div className={`yt-wave-bars ${isPlaying ? 'yt-wave-bars--playing' : ''}`}>
              <span className="yt-bar b1" />
              <span className="yt-bar b2" />
              <span className="yt-bar b3" />
              <span className="yt-bar b4" />
              <span className="yt-bar b5" />
              <span className="yt-bar b6" />
              <span className="yt-bar b7" />
              <span className="yt-bar b8" />
            </div>

            {/* Track Info */}
            <div className="yt-track-info-area">
              <div className="yt-track-title">{activeTrack.title}</div>
              <div className="yt-track-artist">{activeTrack.artist}</div>
            </div>
          </div>

          {/* Bottom Player Controls & Seekbar */}
          <div className="yt-bottom-controls-section">
            {/* Seek Bar */}
            {duration > 0 && (
              <div className="yt-seek-container">
                <span className="yt-time-label">{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  value={currentTime}
                  onChange={(e) => handleSeek(parseFloat(e.target.value))}
                  className="yt-seek-slider"
                />
                <span className="yt-time-label">{formatTime(duration)}</span>
              </div>
            )}

            {/* Main Controls Row */}
            <div className="yt-controls-row">
              <button
                type="button"
                className="yt-control-btn yt-control-btn--skip"
                onClick={handlePrevTrack}
                title="Önceki İstasyon"
              >
                <Rewind size={15} />
              </button>

              <button
                type="button"
                className="yt-play-button"
                onClick={handleTogglePlay}
                title={isPlaying ? 'Durdur' : 'Oynat'}
                style={{
                  boxShadow: `0 0 16px ${currentThemeConfig.glow}, 0 2px 8px rgba(0,0,0,0.35)`,
                }}
              >
                {isPlaying ? (
                  <Pause size={15} className="text-slate-900 fill-current" />
                ) : (
                  <Play size={15} className="text-slate-900 fill-current translate-x-0.5" />
                )}
              </button>

              <button
                type="button"
                className="yt-control-btn yt-control-btn--skip"
                onClick={handleNextTrack}
                title="Sonraki İstasyon"
              >
                <FastForward size={15} />
              </button>
            </div>

            {/* Bottom Volume & External Link Bar */}
            <div className="yt-bottom-bar">
              <div className="yt-volume-control">
                <button
                  type="button"
                  className="yt-mute-btn"
                  onClick={handleToggleMute}
                  title={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
                >
                  {isMuted || volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseInt(e.target.value, 10))}
                  className="yt-volume-slider"
                  title={`Ses: %${isMuted ? 0 : volume}`}
                />
              </div>

              <a
                href={`https://music.youtube.com`}
                target="_blank"
                rel="noopener noreferrer"
                className="yt-open-link"
                title="YouTube Music'i Tarayıcıda Aç"
              >
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
      ) : (
        /* VIEW MODE 2: DIRECT EMBEDDED YOUTUBE MUSIC WEB VIEW */
        <div className="yt-embedded-web-container">
          <div className="yt-embedded-topbar">
            <div className="yt-mode-pill-tabs">
              <button
                type="button"
                className="yt-mode-tab"
                onClick={() => setViewMode('native-player')}
                title="Minimalist Oynatıcıya Dön"
              >
                <Music2 size={11} />
                <span>Oynatıcı</span>
              </button>
              <button
                type="button"
                className="yt-mode-tab yt-mode-tab--active"
                title="YouTube Music Web Görünümü"
              >
                <Globe size={11} />
                <span>YT Web</span>
              </button>
            </div>

            <div className="yt-embedded-actions">
              <button
                type="button"
                className="yt-icon-btn"
                onClick={() => setIframeRefreshKey((k) => k + 1)}
                title="Sayfayı Yenile"
              >
                <RotateCw size={12} />
              </button>

              <button
                type="button"
                className="yt-icon-btn"
                onClick={() => setIsExpandedModalOpen(true)}
                title="Tam Ekrana Genişlet"
              >
                <Maximize2 size={12} />
              </button>

              <a
                href="https://music.youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                className="yt-icon-btn"
                title="Tarayıcıda Aç"
              >
                <ExternalLink size={12} />
              </a>
            </div>
          </div>

          {/* Embedded Web View */}
          <div className="yt-embedded-frame-box">
            <iframe
              key={iframeRefreshKey}
              src="https://music.youtube.com"
              title="YouTube Music Web"
              className="yt-embedded-iframe"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-presentation"
            />
          </div>
        </div>
      )}

      {/* DETAILED EXPANDED MODAL VIEW (Genişletilmiş Detaylı YouTube Music Ekranı) */}
      {isExpandedModalOpen && (
        <div className="yt-modal-overlay" onClick={() => setIsExpandedModalOpen(false)}>
          <div
            className="yt-modal-content"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="yt-modal-header">
              <div className="yt-modal-title-group">
                <div className="yt-badge" style={{ backgroundColor: '#ef4444' }}>
                  <Youtube size={14} className="text-white fill-current" />
                  <span>YouTube Music Detaylı Ekran</span>
                </div>
                <span className="yt-modal-hint">Google hesabınızla giriş yapabilir, tüm kitaplığınızı yönetebilirsiniz.</span>
              </div>

              <div className="yt-modal-header-actions">
                <a
                  href="https://music.youtube.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="yt-modal-btn-link"
                >
                  <ExternalLink size={13} />
                  <span>Tarayıcıda Aç</span>
                </a>

                <button
                  type="button"
                  className="yt-modal-close"
                  onClick={() => setIsExpandedModalOpen(false)}
                  aria-label="Kapat"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="yt-modal-iframe-wrapper">
              <iframe
                src="https://music.youtube.com"
                title="YouTube Music Detailed View"
                className="yt-modal-iframe"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-presentation"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady: () => void
  }
}
