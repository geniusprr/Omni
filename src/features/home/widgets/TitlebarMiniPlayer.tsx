import React, { useState } from 'react'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js'
import FastForward from 'lucide-react/dist/esm/icons/fast-forward.js'
import ListMusic from 'lucide-react/dist/esm/icons/list-music.js'
import Maximize2 from 'lucide-react/dist/esm/icons/maximize-2.js'
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
  useMusicPlayer,
} from './musicStore'

export interface TitlebarMiniPlayerProps {
  onOpenStudio?: () => void
}

export function TitlebarMiniPlayer({ onOpenStudio }: TitlebarMiniPlayerProps = {}) {
  const {
    activeTrack,
    currentPresetIndex,
    customPreset,
    themeConfig,
    isPlaying,
    isMuted,
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
    setExpandedModalOpen,
    addCustomTrackByUrl,
  } = useMusicPlayer()

  const [showPresetsPopover, setShowPresetsPopover] = useState(false)
  const [showVolumePopover, setShowVolumePopover] = useState(false)
  const [customInput, setCustomInput] = useState('')

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customInput.trim()) return
    const success = addCustomTrackByUrl(customInput.trim())
    if (success) {
      setCustomInput('')
      setShowPresetsPopover(false)
    } else {
      alert('Lütfen geçerli bir YouTube video linki veya ID girin!')
    }
  }

  function formatTime(seconds: number) {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  return (
    <div
      className="titlebar-mini-player"
      style={
        {
          '--yt-accent': themeConfig.accent,
          '--yt-glow': themeConfig.glow,
        } as React.CSSProperties
      }
      data-tauri-drag-region
    >
      {/* 1. Track Info Section */}
      <div
        className="titlebar-player-track-info"
        onClick={() => setShowPresetsPopover((p) => !p)}
        title={`${activeTrack.title} — ${activeTrack.artist} (İstasyonları görmek için tıkla)`}
      >
        <div className="titlebar-player-thumb-wrap">
          <img
            src={activeTrack.coverUrl}
            alt={activeTrack.title}
            className="titlebar-player-thumb"
          />
          {isPlaying && (
            <div className="titlebar-mini-eq">
              <span className="tb-eq-bar tb-eq-1" />
              <span className="tb-eq-bar tb-eq-2" />
              <span className="tb-eq-bar tb-eq-3" />
            </div>
          )}
        </div>

        <div className="titlebar-player-text">
          <div className="titlebar-player-title">{activeTrack.title}</div>
          <div className="titlebar-player-artist">{activeTrack.artist}</div>
        </div>
      </div>

      {/* 2. Controls Section */}
      <div className="titlebar-player-controls">
        <button
          type="button"
          className="titlebar-player-btn"
          onClick={prevTrack}
          title="Önceki İstasyon"
          aria-label="Önceki"
        >
          <Rewind size={13} />
        </button>

        <button
          type="button"
          className="titlebar-player-play-btn"
          onClick={togglePlay}
          title={isPlaying ? 'Durdur' : 'Oynat'}
          aria-label={isPlaying ? 'Durdur' : 'Oynat'}
          style={{
            boxShadow: isPlaying ? `0 0 10px ${themeConfig.glow}` : undefined,
          }}
        >
          {isPlaying ? (
            <Pause size={12} className="fill-current text-slate-900" />
          ) : (
            <Play size={12} className="fill-current text-slate-900 translate-x-0.5" />
          )}
        </button>

        <button
          type="button"
          className="titlebar-player-btn"
          onClick={nextTrack}
          title="Sonraki İstasyon"
          aria-label="Sonraki"
        >
          <FastForward size={13} />
        </button>
      </div>

      {/* 3. Utility Actions Section */}
      <div className="titlebar-player-actions">
        {/* Volume Button with Popover */}
        <div className="titlebar-volume-wrap">
          <button
            type="button"
            className="titlebar-player-btn"
            onClick={() => setShowVolumePopover((v) => !v)}
            onDoubleClick={toggleMute}
            title={isMuted ? 'Sesi Aç' : `Ses: %${volume}`}
            aria-label="Ses"
          >
            {isMuted || volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>

          {showVolumePopover && (
            <div className="titlebar-volume-popover">
              <button
                type="button"
                className="tb-vol-mute-toggle"
                onClick={toggleMute}
                title="Sesi Aç / Kapat"
              >
                {isMuted || volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(parseInt(e.target.value, 10))}
                className="titlebar-volume-slider"
                autoFocus
              />
              <span className="titlebar-vol-value">%{isMuted ? 0 : volume}</span>
            </div>
          )}
        </div>

        {/* Stations & Link Picker Button */}
        <button
          type="button"
          className="titlebar-player-btn"
          onClick={() => {
            setShowPresetsPopover((p) => !p)
            setShowVolumePopover(false)
          }}
          title="İstasyonlar & YouTube Linki"
          aria-label="İstasyonlar"
        >
          <ListMusic size={13} />
        </button>

        {/* Expand Detailed Studio Button */}
        <button
          type="button"
          className="titlebar-player-btn"
          onClick={() => (onOpenStudio ? onOpenStudio() : setExpandedModalOpen(true))}
          title="YouTube Music Ekranını Aç"
          aria-label="Genişlet"
        >
          <Maximize2 size={13} />
        </button>
      </div>

      {/* Floating Presets Popover Panel */}
      {showPresetsPopover && (
        <div className="titlebar-presets-popover">
          <div className="titlebar-presets-header">
            <span>Müzik & YouTube Akışı</span>
            <button
              type="button"
              className="tb-popover-close"
              onClick={() => setShowPresetsPopover(false)}
            >
              <X size={12} />
            </button>
          </div>

          <form className="tb-custom-url-form" onSubmit={handleCustomSubmit}>
            <div className="tb-custom-input-box">
              <Youtube size={12} className="text-red-500 flex-shrink-0" />
              <input
                type="text"
                className="tb-custom-input"
                placeholder="YouTube video linki..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
              />
            </div>
            <button type="submit" className="tb-custom-submit-btn">
              <Plus size={11} />
              <span>Çal</span>
            </button>
          </form>

          <div className="tb-presets-list">
            <span className="tb-presets-label">Hazır İstasyonlar</span>
            {MUSIC_PRESETS.map((preset, idx) => {
              const isSelected = activeTrack.youtubeId === preset.youtubeId
              return (
                <div
                  key={preset.id}
                  className={`tb-preset-item ${isSelected ? 'tb-preset-item--active' : ''}`}
                  onClick={() => {
                    playTrack(preset)
                    setShowPresetsPopover(false)
                  }}
                >
                  <img
                    src={preset.coverUrl}
                    alt={preset.title}
                    className="tb-preset-thumb"
                  />
                  <div className="tb-preset-info">
                    <span className="tb-preset-title">{preset.title}</span>
                    <span className="tb-preset-artist">{preset.artist}</span>
                  </div>
                  {isSelected && isPlaying && (
                    <span className="tb-playing-chip">Çalıyor</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
