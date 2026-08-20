import { useState, type CSSProperties, type FormEvent } from 'react'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js'
import FastForward from 'lucide-react/dist/esm/icons/fast-forward.js'
import Heart from 'lucide-react/dist/esm/icons/heart.js'
import ListMusic from 'lucide-react/dist/esm/icons/list-music.js'
import Maximize2 from 'lucide-react/dist/esm/icons/maximize-2.js'
import Palette from 'lucide-react/dist/esm/icons/palette.js'
import Pause from 'lucide-react/dist/esm/icons/pause.js'
import Play from 'lucide-react/dist/esm/icons/play.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import Rewind from 'lucide-react/dist/esm/icons/rewind.js'
import Volume2 from 'lucide-react/dist/esm/icons/volume-2.js'
import VolumeX from 'lucide-react/dist/esm/icons/volume-x.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import Youtube from 'lucide-react/dist/esm/icons/youtube.js'
import {
  MUSIC_PRESETS,
  THEME_CONFIGS,
  useMusicPlayer,
  type MusicTheme,
} from '@/features/music/core/musicStore'
import { trackDurationLabel, type MusicTrack } from '@/features/music/core/types'

export type { MusicTrack }

export interface YouTubeMusicWidgetProps {
  variant?: 'tall' | 'bottom-bar'
  onHide?: () => void
  onOpenStudio?: () => void
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function trackLabel(track: MusicTrack, duration: number): string {
  return duration > 0 ? formatTime(duration) : trackDurationLabel(track) || '—'
}

export function YouTubeMusicWidget({
  variant = 'tall',
  onHide,
  onOpenStudio,
}: YouTubeMusicWidgetProps) {
  const {
    activeTrack,
    theme,
    themeConfig,
    isPlaying,
    muted,
    volume,
    currentTime,
    duration,
    togglePlay,
    playTrack,
    nextTrack,
    prevTrack,
    setVolume,
    toggleMute,
    seekTo,
    setTheme,
    toggleFavorite,
    isFavorite,
    addCustomTrackByUrl,
  } = useMusicPlayer()

  const [customUrlInput, setCustomUrlInput] = useState('')
  const [showPresetsModal, setShowPresetsModal] = useState(false)
  const [showThemeModal, setShowThemeModal] = useState(false)

  if (!activeTrack) return null

  async function handleAddCustomTrack(event: FormEvent) {
    event.preventDefault()
    const raw = customUrlInput.trim()
    if (!raw) return
    const added = await addCustomTrackByUrl(raw)
    if (!added) {
      alert('Geçerli bir YouTube URL’si veya 11 karakterlik video ID girin.')
      return
    }
    setCustomUrlInput('')
    setShowPresetsModal(false)
  }

  const isCurrentFavorite = isFavorite(activeTrack)
  const style = {
    '--yt-accent': themeConfig.accent,
    '--yt-glow': themeConfig.glow,
  } as CSSProperties

  return (
    <div className={`yt-music-card glass-widget-card yt-music-card--${variant}`} style={style}>
      <div
        className="yt-music-backdrop"
        style={{ backgroundImage: activeTrack.artworkUrl ? `url('${activeTrack.artworkUrl}')` : undefined }}
      >
        <div className="yt-music-overlay-gradient" style={{ background: themeConfig.gradient }} />

        <div className="yt-music-topbar">
          <button
            type="button"
            className="yt-mode-pill-tabs"
            onClick={() => onOpenStudio?.()}
            title="Müzik ekranını aç"
          >
            <span className="yt-mode-tab yt-mode-tab--active">
              <Youtube size={12} className="text-red-500" aria-hidden="true" />
              <span>YouTube</span>
            </span>
          </button>

          <div className="yt-topbar-actions">
            <button
              type="button"
              className="yt-icon-btn"
              onClick={() => {
                setShowThemeModal((current) => !current)
                setShowPresetsModal(false)
              }}
              title="Temayı değiştir"
            >
              <Palette size={13} />
            </button>
            <button
              type="button"
              className="yt-icon-btn"
              onClick={() => {
                setShowPresetsModal((current) => !current)
                setShowThemeModal(false)
              }}
              title="YouTube parçaları"
            >
              <ListMusic size={13} />
            </button>
            <button
              type="button"
              className="yt-icon-btn yt-icon-btn--expand"
              onClick={() => onOpenStudio?.()}
              title="Müzik ekranını aç"
            >
              <Maximize2 size={13} />
            </button>
            {onHide ? (
              <button type="button" className="yt-icon-btn yt-icon-btn--hide" onClick={onHide} title="Widgetı gizle">
                <X size={13} />
              </button>
            ) : null}
          </div>
        </div>

        {showThemeModal ? (
          <div className="yt-popup-panel">
            <div className="yt-popup-header">
              <span>Tema seç</span>
              <button type="button" className="yt-popup-close" onClick={() => setShowThemeModal(false)}>
                <X size={12} />
              </button>
            </div>
            <div className="yt-theme-grid">
              {(Object.keys(THEME_CONFIGS) as MusicTheme[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`yt-theme-option ${theme === key ? 'yt-theme-option--active' : ''}`}
                  onClick={() => {
                    setTheme(key)
                    setShowThemeModal(false)
                  }}
                >
                  <span className="yt-theme-swatch" style={{ background: THEME_CONFIGS[key].gradient }} />
                  <span className="yt-theme-info">
                    <span className="yt-theme-title">{THEME_CONFIGS[key].name}</span>
                    <span className="yt-theme-sub">{THEME_CONFIGS[key].desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {showPresetsModal ? (
          <div className="yt-popup-panel">
            <div className="yt-popup-header">
              <span>Hazır YouTube parçaları</span>
              <button type="button" className="yt-popup-close" onClick={() => setShowPresetsModal(false)}>
                <X size={12} />
              </button>
            </div>
            <form className="yt-custom-form" onSubmit={(event) => void handleAddCustomTrack(event)}>
              <div className="yt-custom-input-wrapper">
                <Youtube size={12} className="yt-custom-icon" />
                <input
                  type="text"
                  className="yt-custom-input"
                  placeholder="YouTube URL veya video ID"
                  value={customUrlInput}
                  onChange={(event) => setCustomUrlInput(event.target.value)}
                />
              </div>
              <button type="submit" className="yt-custom-submit-btn">
                <Plus size={11} /> Çal
              </button>
            </form>
            <div className="yt-presets-list">
              {MUSIC_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`yt-preset-item ${activeTrack.id === preset.id ? 'yt-preset-item--active' : ''}`}
                  onClick={() => {
                    playTrack(preset)
                    setShowPresetsModal(false)
                  }}
                >
                  <img src={preset.artworkUrl} alt="" className="yt-preset-thumb" />
                  <span className="yt-preset-details">
                    <span className="yt-preset-name">{preset.title}</span>
                    <span className="yt-preset-artist">{preset.artist}</span>
                  </span>
                  {activeTrack.id === preset.id && isPlaying ? <span className="yt-active-pill">Çalıyor</span> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <button type="button" className="yt-tall-center-block" onClick={() => onOpenStudio?.()} title="Müzik ekranını aç">
          <span className="yt-album-art-circle">
            {activeTrack.artworkUrl ? <img src={activeTrack.artworkUrl} alt="" className="yt-art-img" /> : null}
          </span>
          <span className={`yt-wave-bars ${isPlaying ? 'yt-wave-bars--playing' : ''}`} aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => <span key={index} className={`yt-bar b${index + 1}`} />)}
          </span>
          <span className="yt-track-info-area">
            <span className="yt-track-title">{activeTrack.title}</span>
            <span className="yt-track-artist">{activeTrack.artist}</span>
          </span>
        </button>

        <div className="yt-bottom-controls-section">
          <div className="yt-seek-container">
            <span className="yt-time-label">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 100}
              value={Math.min(currentTime, duration || 100)}
              onChange={(event) => seekTo(Number(event.target.value))}
              className="yt-seek-slider"
              aria-label="Parça konumu"
            />
            <span className="yt-time-label">{trackLabel(activeTrack, duration)}</span>
          </div>
          <div className="yt-controls-row">
            <button type="button" className="yt-control-btn yt-control-btn--skip" onClick={prevTrack} title="Önceki">
              <Rewind size={16} />
            </button>
            <button type="button" className="yt-play-button" onClick={togglePlay} title={isPlaying ? 'Duraklat' : 'Oynat'}>
              {isPlaying ? <Pause size={16} className="text-slate-900" /> : <Play size={16} className="text-slate-900" />}
            </button>
            <button type="button" className="yt-control-btn yt-control-btn--skip" onClick={nextTrack} title="Sonraki">
              <FastForward size={16} />
            </button>
          </div>
          <div className="yt-bottom-bar">
            <div className="yt-volume-control">
              <button type="button" className="yt-mute-btn" onClick={toggleMute} title={muted ? 'Sesi aç' : 'Sesi kapat'}>
                {muted || volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={muted ? 0 : volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                className="yt-volume-slider"
                aria-label="Ses"
              />
            </div>
            <div className="yt-bottom-links-group">
              <button type="button" className="yt-icon-btn-small" onClick={() => toggleFavorite(activeTrack)} title="Favori">
                <Heart size={11} className={isCurrentFavorite ? 'fill-rose-500 text-rose-500' : ''} />
              </button>
              {activeTrack.externalUrl ? (
                <a href={activeTrack.externalUrl} target="_blank" rel="noopener noreferrer" className="yt-open-link" title="YouTube’da aç">
                  <ExternalLink size={12} />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
