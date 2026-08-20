import React, { useState } from 'react'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js'
import FastForward from 'lucide-react/dist/esm/icons/fast-forward.js'
import Globe from 'lucide-react/dist/esm/icons/globe.js'
import ListMusic from 'lucide-react/dist/esm/icons/list-music.js'
import Maximize2 from 'lucide-react/dist/esm/icons/maximize-2.js'
import Music2 from 'lucide-react/dist/esm/icons/music-2.js'
import Palette from 'lucide-react/dist/esm/icons/palette.js'
import Pause from 'lucide-react/dist/esm/icons/pause.js'
import Play from 'lucide-react/dist/esm/icons/play.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import Rewind from 'lucide-react/dist/esm/icons/rewind.js'
import RotateCw from 'lucide-react/dist/esm/icons/rotate-cw.js'
import Volume2 from 'lucide-react/dist/esm/icons/volume-2.js'
import VolumeX from 'lucide-react/dist/esm/icons/volume-x.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import Youtube from 'lucide-react/dist/esm/icons/youtube.js'
import {
  MUSIC_PRESETS,
  type MusicPreset,
  type MusicTheme,
  THEME_CONFIGS,
  useMusicPlayer,
} from './musicStore'

export { MUSIC_PRESETS, THEME_CONFIGS }
export type { MusicPreset, MusicTheme }

export interface YouTubeMusicWidgetProps {
  variant?: 'tall' | 'bottom-bar'
  onHide?: () => void
}

export function YouTubeMusicWidget({ variant = 'tall', onHide }: YouTubeMusicWidgetProps) {
  const {
    activeTrack,
    currentPresetIndex,
    customPreset,
    theme,
    themeConfig,
    viewMode,
    isPlaying,
    isMuted,
    volume,
    currentTime,
    duration,
    isExpandedModalOpen,
    togglePlay,
    playTrack,
    nextTrack,
    prevTrack,
    setVolume,
    toggleMute,
    seekTo,
    setTheme,
    setViewMode,
    setExpandedModalOpen,
    addCustomTrackByUrl,
  } = useMusicPlayer()

  const [iframeRefreshKey, setIframeRefreshKey] = useState(0)
  const [customUrlInput, setCustomUrlInput] = useState('')
  const [showPresetsModal, setShowPresetsModal] = useState(false)
  const [showThemeModal, setShowThemeModal] = useState(false)

  function handleAddCustomTrack(e: React.FormEvent) {
    e.preventDefault()
    const raw = customUrlInput.trim()
    if (!raw) return
    const success = addCustomTrackByUrl(raw)
    if (!success) {
      alert('Lütfen geçerli bir YouTube video linki veya ID girin!')
      return
    }
    setCustomUrlInput('')
    setShowPresetsModal(false)
  }

  function formatTime(seconds: number) {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  return (
    <div
      className="yt-music-card glass-widget-card yt-music-card--tall"
      style={
        {
          '--yt-accent': themeConfig.accent,
          '--yt-glow': themeConfig.glow,
        } as React.CSSProperties
      }
    >
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
            style={{ background: themeConfig.gradient }}
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
                onClick={() => setViewMode('embedded-yt-music')}
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
                onClick={() => setExpandedModalOpen(true)}
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
                        playTrack(idx)
                        setShowPresetsModal(false)
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
                  onChange={(e) => seekTo(parseFloat(e.target.value))}
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
                onClick={prevTrack}
                title="Önceki İstasyon"
              >
                <Rewind size={15} />
              </button>

              <button
                type="button"
                className="yt-play-button"
                onClick={togglePlay}
                title={isPlaying ? 'Durdur' : 'Oynat'}
                style={{
                  boxShadow: `0 0 16px ${themeConfig.glow}, 0 2px 8px rgba(0,0,0,0.35)`,
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
                onClick={nextTrack}
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
                  onClick={toggleMute}
                  title={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
                >
                  {isMuted || volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setVolume(parseInt(e.target.value, 10))}
                  className="yt-volume-slider"
                  title={`Ses: %${isMuted ? 0 : volume}`}
                />
              </div>

              <a
                href="https://music.youtube.com"
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
                onClick={() => setExpandedModalOpen(true)}
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
        <div className="yt-modal-overlay" onClick={() => setExpandedModalOpen(false)}>
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
                  onClick={() => setExpandedModalOpen(false)}
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
