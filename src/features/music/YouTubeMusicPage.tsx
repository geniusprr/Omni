import React, { useEffect, useMemo, useState } from 'react'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js'
import FastForward from 'lucide-react/dist/esm/icons/fast-forward.js'
import Heart from 'lucide-react/dist/esm/icons/heart.js'
import ListMusic from 'lucide-react/dist/esm/icons/list-music.js'
import Music2 from 'lucide-react/dist/esm/icons/music-2.js'
import Palette from 'lucide-react/dist/esm/icons/palette.js'
import Pause from 'lucide-react/dist/esm/icons/pause.js'
import Play from 'lucide-react/dist/esm/icons/play.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import Repeat from 'lucide-react/dist/esm/icons/repeat.js'
import Repeat1 from 'lucide-react/dist/esm/icons/repeat-1.js'
import Rewind from 'lucide-react/dist/esm/icons/rewind.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Shuffle from 'lucide-react/dist/esm/icons/shuffle.js'
import Sparkles from 'lucide-react/dist/esm/icons/sparkles.js'
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js'
import Tv from 'lucide-react/dist/esm/icons/tv.js'
import Volume2 from 'lucide-react/dist/esm/icons/volume-2.js'
import VolumeX from 'lucide-react/dist/esm/icons/volume-x.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import Youtube from 'lucide-react/dist/esm/icons/youtube.js'
import {
  MUSIC_CATEGORIES,
  MUSIC_PRESETS,
  type MusicCategory,
  type MusicPreset,
  type MusicTheme,
  THEME_CONFIGS,
  useMusicPlayer,
} from '@/features/home/widgets/musicStore'

export function YouTubeMusicPage() {
  const {
    activeTrack,
    queue,
    favorites,
    theme,
    themeConfig,
    isPlaying,
    isMuted,
    volume,
    currentTime,
    duration,
    viewFormat,
    activeCategory,
    shuffle,
    repeatMode,
    searchResults,
    isSearching,
    errorMessage,
    togglePlay,
    playTrack,
    nextTrack,
    prevTrack,
    setVolume,
    toggleMute,
    seekTo,
    setTheme,
    setViewFormat,
    setActiveCategory,
    toggleShuffle,
    toggleRepeat,
    toggleFavorite,
    isFavorite,
    addToQueue,
    removeFromQueue,
    addCustomTrackByUrl,
    searchYoutube,
  } = useMusicPlayer()

  const [activeTab, setActiveTab] = useState<'explore' | 'search' | 'queue' | 'favorites'>('explore')
  const [searchInput, setSearchInput] = useState('')
  const [customLinkInput, setCustomLinkInput] = useState('')
  const [showThemePicker, setShowThemePicker] = useState(false)

  // Sync search input with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.trim()) {
        searchYoutube(searchInput)
        setActiveTab('search')
      }
    }, 280)
    return () => clearTimeout(timer)
  }, [searchInput, searchYoutube])

  function formatTime(seconds: number) {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  function handleCustomLinkSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customLinkInput.trim()) return
    const success = addCustomTrackByUrl(customLinkInput.trim())
    if (success) {
      setCustomLinkInput('')
    } else {
      alert('Lütfen geçerli bir YouTube veya YouTube Music linki / video ID girin!')
    }
  }

  const filteredPresets = useMemo(() => {
    if (activeCategory === 'all') return MUSIC_PRESETS
    return MUSIC_PRESETS.filter((p) => p.category === activeCategory)
  }, [activeCategory])

  const curTrack = activeTrack || MUSIC_PRESETS[0]
  const isCurrentFav = isFavorite(curTrack.id)

  return (
    <div
      className="yt-page-container"
      style={
        {
          '--yt-accent': themeConfig.accent,
          '--yt-glow': themeConfig.glow,
        } as React.CSSProperties
      }
    >
      {/* Dynamic Scenic Ambient Glow */}
      <div className="yt-page-bg-ambient" style={{ background: themeConfig.gradient }} />

      {/* 1. TOP HEADER TOOLBAR */}
      <header className="yt-page-header">
        <div className="yt-page-header-left">
          <div className="yt-page-brand-pill">
            <Youtube size={16} className="text-red-500 fill-current" />
            <span className="yt-page-brand-name">YouTube Music Studio</span>
          </div>

          {/* View Format Switcher: Art vs Video Clip */}
          <div className="yt-page-format-tabs">
            <button
              type="button"
              className={`yt-page-format-tab ${viewFormat === 'art' ? 'yt-page-format-tab--active' : ''}`}
              onClick={() => setViewFormat('art')}
              title="Minimalist Albüm Kapağı & Ekolayzır"
            >
              <Music2 size={13} />
              <span>Albüm & Ekolayzır</span>
            </button>
            <button
              type="button"
              className={`yt-page-format-tab ${viewFormat === 'video' ? 'yt-page-format-tab--active' : ''}`}
              onClick={() => setViewFormat('video')}
              title="Canlı Klip & Video Oynatıcı"
            >
              <Tv size={13} />
              <span>Klip / Video</span>
            </button>
          </div>
        </div>

        {/* Quick Search Input */}
        <div className="yt-page-header-search">
          <Search size={14} className="yt-page-search-icon" />
          <input
            type="text"
            placeholder="Şarkı, sanatçı veya YouTube linki ara..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="yt-page-search-input"
          />
          {searchInput && (
            <button
              type="button"
              className="yt-page-search-clear"
              onClick={() => {
                setSearchInput('')
                searchYoutube('')
                setActiveTab('explore')
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Header Right Actions */}
        <div className="yt-page-header-right">
          {/* Direct Link Input */}
          <form onSubmit={handleCustomLinkSubmit} className="yt-page-quick-link-form">
            <input
              type="text"
              placeholder="YouTube URL yapıştır..."
              value={customLinkInput}
              onChange={(e) => setCustomLinkInput(e.target.value)}
              className="yt-page-quick-link-input"
            />
            <button type="submit" className="yt-page-quick-link-btn" title="Linki Çal">
              <Plus size={13} />
            </button>
          </form>

          {/* Open in YouTube Music */}
          <a
            href={`https://music.youtube.com/watch?v=${curTrack.youtubeId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="yt-page-action-btn yt-page-action-btn--primary"
            title="Bu parçayı doğrudan YouTube Music tarayıcısında aç"
          >
            <ExternalLink size={12} />
            <span>YT Music</span>
          </a>

          {/* Theme Selector */}
          <div className="yt-page-theme-wrapper">
            <button
              type="button"
              className="yt-page-icon-btn"
              onClick={() => setShowThemePicker((p) => !p)}
              title="Görsel Temayı Değiştir"
            >
              <Palette size={14} />
            </button>

            {showThemePicker && (
              <div className="yt-page-theme-dropdown">
                <div className="yt-page-dropdown-header">
                  <span>Renk Temaları</span>
                  <button
                    type="button"
                    className="yt-page-dropdown-close"
                    onClick={() => setShowThemePicker(false)}
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="yt-page-theme-list">
                  {(Object.keys(THEME_CONFIGS) as MusicTheme[]).map((tKey) => {
                    const conf = THEME_CONFIGS[tKey]
                    const isActive = theme === tKey
                    return (
                      <button
                        key={tKey}
                        type="button"
                        className={`yt-page-theme-item ${isActive ? 'yt-page-theme-item--active' : ''}`}
                        onClick={() => {
                          setTheme(tKey)
                          setShowThemePicker(false)
                        }}
                      >
                        <div className="yt-page-theme-circle" style={{ background: conf.gradient }} />
                        <div className="yt-page-theme-text">
                          <span className="yt-page-theme-title">{conf.name}</span>
                          <span className="yt-page-theme-desc">{conf.desc}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. MAIN 2-COLUMN STUDIO WORKSPACE */}
      <div className="yt-page-body-grid">
        {/* LEFT COLUMN: HERO NOW PLAYING STAGE & CONTROLS */}
        <div className="yt-page-hero-panel">
          {/* Visual Stage: Album Art OR Video Player */}
          <div className="yt-page-stage-container">
            {viewFormat === 'video' ? (
              <div className="yt-page-video-box">
                <iframe
                  key={curTrack.youtubeId}
                  src={`https://www.youtube-nocookie.com/embed/${curTrack.youtubeId}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1`}
                  title={curTrack.title}
                  className="yt-page-video-iframe"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="yt-page-art-stage">
                <div className={`yt-page-vinyl-disc ${isPlaying ? 'yt-page-vinyl-disc--spinning' : ''}`}>
                  <img
                    src={curTrack.coverUrl}
                    alt={curTrack.title}
                    className="yt-page-art-image"
                  />
                  <div className="yt-page-vinyl-hole" />
                </div>

                {/* Equalizer Visualizer */}
                <div className={`yt-page-eq-bars ${isPlaying ? 'yt-page-eq-bars--playing' : ''}`}>
                  <span className="eq-bar eq-1" />
                  <span className="eq-bar eq-2" />
                  <span className="eq-bar eq-3" />
                  <span className="eq-bar eq-4" />
                  <span className="eq-bar eq-5" />
                  <span className="eq-bar eq-6" />
                  <span className="eq-bar eq-7" />
                  <span className="eq-bar eq-8" />
                  <span className="eq-bar eq-9" />
                  <span className="eq-bar eq-10" />
                  <span className="eq-bar eq-11" />
                  <span className="eq-bar eq-12" />
                </div>
              </div>
            )}
          </div>

          {/* Error or Status Toast */}
          {errorMessage && (
            <div className="yt-page-status-toast yt-page-status-toast--error">
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Track Info */}
          <div className="yt-page-track-details">
            <div className="yt-page-track-title-row">
              <div className="yt-page-track-title" title={curTrack.title}>
                {curTrack.title}
              </div>
              <button
                type="button"
                className={`yt-page-fav-btn ${isCurrentFav ? 'yt-page-fav-btn--active' : ''}`}
                onClick={() => toggleFavorite(curTrack)}
                title={isCurrentFav ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
              >
                <Heart size={16} className={isCurrentFav ? 'fill-rose-500 text-rose-500' : ''} />
              </button>
            </div>
            <div className="yt-page-track-artist">{curTrack.artist}</div>
          </div>

          {/* Seekbar */}
          <div className="yt-page-seek-area">
            <span className="yt-page-time">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 100}
              value={currentTime}
              onChange={(e) => seekTo(parseFloat(e.target.value))}
              className="yt-page-seek-slider"
            />
            <span className="yt-page-time">
              {duration > 0 ? formatTime(duration) : curTrack.durationStr || '0:00'}
            </span>
          </div>

          {/* Main Player Action Controls */}
          <div className="yt-page-player-controls-row">
            {/* Shuffle */}
            <button
              type="button"
              className={`yt-page-ctrl-btn ${shuffle ? 'yt-page-ctrl-btn--active' : ''}`}
              onClick={toggleShuffle}
              title={shuffle ? 'Karışık Çalma: Açık' : 'Karışık Çalma: Kapalı'}
            >
              <Shuffle size={16} />
            </button>

            {/* Prev */}
            <button
              type="button"
              className="yt-page-ctrl-btn yt-page-ctrl-btn--skip"
              onClick={prevTrack}
              title="Önceki Parça"
            >
              <Rewind size={20} />
            </button>

            {/* Big Play / Pause */}
            <button
              type="button"
              className="yt-page-play-main-btn"
              onClick={togglePlay}
              title={isPlaying ? 'Durdur' : 'Oynat'}
              style={{
                boxShadow: `0 0 24px ${themeConfig.glow}, 0 4px 14px rgba(0,0,0,0.4)`,
              }}
            >
              {isPlaying ? (
                <Pause size={20} className="fill-current text-slate-900" />
              ) : (
                <Play size={20} className="fill-current text-slate-900 translate-x-0.5" />
              )}
            </button>

            {/* Next */}
            <button
              type="button"
              className="yt-page-ctrl-btn yt-page-ctrl-btn--skip"
              onClick={nextTrack}
              title="Sonraki Parça"
            >
              <FastForward size={20} />
            </button>

            {/* Repeat */}
            <button
              type="button"
              className={`yt-page-ctrl-btn ${repeatMode !== 'off' ? 'yt-page-ctrl-btn--active' : ''}`}
              onClick={toggleRepeat}
              title={
                repeatMode === 'one'
                  ? 'Tekrar: Bu Parça'
                  : repeatMode === 'all'
                    ? 'Tekrar: Tüm Liste'
                    : 'Tekrar: Kapalı'
              }
            >
              {repeatMode === 'one' ? (
                <Repeat1 size={16} className="text-sky-400" />
              ) : (
                <Repeat size={16} />
              )}
            </button>
          </div>

          {/* Volume Control */}
          <div className="yt-page-bottom-aux-bar">
            <div className="yt-page-volume-group">
              <button
                type="button"
                className="yt-page-mute-btn"
                onClick={toggleMute}
                title={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
              >
                {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(parseInt(e.target.value, 10))}
                className="yt-page-volume-slider"
                title={`Ses: %${isMuted ? 0 : volume}`}
              />
              <span className="yt-page-volume-text">%{isMuted ? 0 : volume}</span>
            </div>

            <div className="yt-page-active-station-badge">
              <Sparkles size={11} className="text-amber-400" />
              <span>{MUSIC_CATEGORIES.find((c) => c.id === curTrack.category)?.label || 'Canlı Müzik'}</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: DISCOVERY, CATEGORIES, QUEUE & FAVORITES */}
        <div className="yt-page-catalog-panel">
          {/* Catalog Top Navigation Tabs */}
          <div className="yt-page-catalog-nav">
            <div className="yt-page-nav-tabs">
              <button
                type="button"
                className={`yt-page-nav-tab ${activeTab === 'explore' ? 'yt-page-nav-tab--active' : ''}`}
                onClick={() => setActiveTab('explore')}
              >
                <Sparkles size={13} />
                <span>Keşfet & Türler</span>
              </button>

              <button
                type="button"
                className={`yt-page-nav-tab ${activeTab === 'queue' ? 'yt-page-nav-tab--active' : ''}`}
                onClick={() => setActiveTab('queue')}
              >
                <ListMusic size={13} />
                <span>Çalma Sırası ({queue.length})</span>
              </button>

              <button
                type="button"
                className={`yt-page-nav-tab ${activeTab === 'favorites' ? 'yt-page-nav-tab--active' : ''}`}
                onClick={() => setActiveTab('favorites')}
              >
                <Heart size={13} className="text-rose-400" />
                <span>Favorilerim ({favorites.length})</span>
              </button>

              {searchResults.length > 0 && (
                <button
                  type="button"
                  className={`yt-page-nav-tab ${activeTab === 'search' ? 'yt-page-nav-tab--active' : ''}`}
                  onClick={() => setActiveTab('search')}
                >
                  <Search size={13} />
                  <span>Arama Sonuçları ({searchResults.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* TAB 1: EXPLORE & CATEGORIES */}
          {activeTab === 'explore' && (
            <div className="yt-page-explore-content">
              {/* Category Pills Slider */}
              <div className="yt-page-categories-row">
                {MUSIC_CATEGORIES.map((cat) => {
                  const isCatActive = activeCategory === cat.id
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`yt-page-category-pill ${isCatActive ? 'yt-page-category-pill--active' : ''}`}
                      onClick={() => setActiveCategory(cat.id)}
                    >
                      <span className="yt-page-category-icon">{cat.icon}</span>
                      <span>{cat.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Tracks Grid */}
              <div className="yt-page-tracks-scroll">
                <div className="yt-page-tracks-grid">
                  {filteredPresets.map((preset) => {
                    const isCurrent = curTrack.id === preset.id
                    const isFav = isFavorite(preset.id)
                    return (
                      <div
                        key={preset.id}
                        className={`yt-page-track-card ${isCurrent ? 'yt-page-track-card--active' : ''}`}
                        onClick={() => playTrack(preset)}
                      >
                        <div className="yt-page-card-thumb-wrapper">
                          <img
                            src={preset.coverUrl}
                            alt={preset.title}
                            className="yt-page-card-thumb"
                            loading="lazy"
                          />
                          <div className="yt-page-card-play-overlay">
                            {isCurrent && isPlaying ? (
                              <Pause size={20} className="fill-current text-white" />
                            ) : (
                              <Play size={20} className="fill-current text-white translate-x-0.5" />
                            )}
                          </div>
                          {preset.durationStr && (
                            <span className="yt-page-card-duration">{preset.durationStr}</span>
                          )}
                        </div>

                        <div className="yt-page-card-info">
                          <span className="yt-page-card-title" title={preset.title}>
                            {preset.title}
                          </span>
                          <span className="yt-page-card-artist" title={preset.artist}>
                            {preset.artist}
                          </span>
                        </div>

                        <div className="yt-page-card-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className={`yt-page-card-btn ${isFav ? 'text-rose-400' : ''}`}
                            onClick={() => toggleFavorite(preset)}
                            title={isFav ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                          >
                            <Heart size={13} className={isFav ? 'fill-rose-500' : ''} />
                          </button>
                          <button
                            type="button"
                            className="yt-page-card-btn"
                            onClick={() => addToQueue(preset)}
                            title="Sıraya Ekle"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: QUEUE */}
          {activeTab === 'queue' && (
            <div className="yt-page-queue-content">
              <div className="yt-page-list-scroll">
                {queue.map((qTrack, idx) => {
                  const isCurrent = curTrack.id === qTrack.id
                  return (
                    <div
                      key={`${qTrack.id}-${idx}`}
                      className={`yt-page-list-item ${isCurrent ? 'yt-page-list-item--active' : ''}`}
                      onClick={() => playTrack(qTrack)}
                    >
                      <span className="yt-page-list-index">{idx + 1}</span>
                      <img src={qTrack.coverUrl} alt={qTrack.title} className="yt-page-list-thumb" />
                      <div className="yt-page-list-meta">
                        <span className="yt-page-list-title">{qTrack.title}</span>
                        <span className="yt-page-list-artist">{qTrack.artist}</span>
                      </div>
                      <div className="yt-page-list-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="yt-page-list-btn yt-page-list-btn--remove"
                          onClick={() => removeFromQueue(qTrack.id)}
                          title="Sıradan Kaldır"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 3: FAVORITES */}
          {activeTab === 'favorites' && (
            <div className="yt-page-favs-content">
              {favorites.length === 0 ? (
                <div className="yt-page-empty-state">
                  <Heart size={32} className="text-slate-600 mb-2" />
                  <p className="font-semibold text-slate-300">Henüz favori şarkınız yok</p>
                  <p className="text-xs text-slate-500">
                    Şarkıların yanındaki kalp simgesine tıklayarak favorilerinize ekleyebilirsiniz.
                  </p>
                </div>
              ) : (
                <div className="yt-page-list-scroll">
                  {favorites.map((fav, idx) => {
                    const isCurrent = curTrack.id === fav.id
                    return (
                      <div
                        key={`${fav.id}-${idx}`}
                        className={`yt-page-list-item ${isCurrent ? 'yt-page-list-item--active' : ''}`}
                        onClick={() => playTrack(fav)}
                      >
                        <img src={fav.coverUrl} alt={fav.title} className="yt-page-list-thumb" />
                        <div className="yt-page-list-meta">
                          <span className="yt-page-list-title">{fav.title}</span>
                          <span className="yt-page-list-artist">{fav.artist}</span>
                        </div>
                        <div className="yt-page-list-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="yt-page-list-btn text-rose-400"
                            onClick={() => toggleFavorite(fav)}
                            title="Favorilerden Çıkar"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SEARCH RESULTS */}
          {activeTab === 'search' && (
            <div className="yt-page-search-content">
              {isSearching ? (
                <div className="yt-page-empty-state">
                  <div className="yt-spinner" />
                  <p className="text-xs text-slate-400 mt-2">YouTube aranıyor...</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="yt-page-empty-state">
                  <p className="text-sm font-semibold text-slate-300">Sonuç bulunamadı</p>
                  <p className="text-xs text-slate-500">Farklı bir arama terimi veya link deneyin.</p>
                </div>
              ) : (
                <div className="yt-page-list-scroll">
                  {searchResults.map((item, idx) => {
                    const isCurrent = curTrack.id === item.id
                    return (
                      <div
                        key={`${item.id}-${idx}`}
                        className={`yt-page-list-item ${isCurrent ? 'yt-page-list-item--active' : ''}`}
                        onClick={() => {
                          if (item.youtubeId) {
                            playTrack(item)
                          } else {
                            setSearchInput(item.title)
                            searchYoutube(item.title)
                          }
                        }}
                      >
                        <img src={item.coverUrl} alt={item.title} className="yt-page-list-thumb" />
                        <div className="yt-page-list-meta">
                          <span className="yt-page-list-title">{item.title}</span>
                          <span className="yt-page-list-artist">{item.artist}</span>
                        </div>
                        {item.youtubeId && (
                          <div className="yt-page-list-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="yt-page-list-btn"
                              onClick={() => addToQueue(item)}
                              title="Sıraya Ekle"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
