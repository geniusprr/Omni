import { useCallback, useEffect, useState } from 'react'
import AudioLines from 'lucide-react/dist/esm/icons/audio-lines.js'
import FastForward from 'lucide-react/dist/esm/icons/fast-forward.js'
import Pause from 'lucide-react/dist/esm/icons/pause.js'
import Play from 'lucide-react/dist/esm/icons/play.js'
import Rewind from 'lucide-react/dist/esm/icons/rewind.js'
import Radio from 'lucide-react/dist/esm/icons/radio.js'
import { BROWSER_EVENTS, desktop, type BrowserMediaProjection, type SystemMediaSession } from '@/lib/desktop'

export function SystemMediaStatusWidget() {
  const [session, setSession] = useState<SystemMediaSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [available, setAvailable] = useState(true)
  const [browserMedia, setBrowserMedia] = useState<Record<string, BrowserMediaProjection>>({})

  const refresh = useCallback(async () => {
    try {
      setSession(await desktop.media.getCurrent())
      setAvailable(true)
    } catch {
      setSession(null)
      setAvailable(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => void refresh(), 1200)
    const handleFocus = () => void refresh()
    window.addEventListener('focus', handleFocus)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [refresh])

  useEffect(() => {
    const stopMedia = desktop.browser.on<BrowserMediaProjection>(BROWSER_EVENTS.mediaUpdated, (media) => setBrowserMedia((current) => ({ ...current, [media.tabId]: media })))
    const stopDestroyed = desktop.browser.on<{ id: string }>(BROWSER_EVENTS.tabDestroyed, (tab) => setBrowserMedia((current) => { const { [tab.id]: _closed, ...remaining } = current; return remaining }))
    return () => { stopMedia(); stopDestroyed() }
  }, [])

  const activeBrowserMedia = Object.values(browserMedia)
    .filter((item) => item.playing)
    .sort((a, b) => b.lastPlayingAt - a.lastPlayingAt)[0] ?? null

  const isPlaying = activeBrowserMedia?.playing ?? session?.playbackStatus === 'playing'
  const duration = session?.durationSeconds || 0
  const currentTime = session?.positionSeconds || 0
  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0
  const appName = activeBrowserMedia?.source || formatAppName(session?.sourceAppId || '')
  const displayTitle = activeBrowserMedia?.title || session?.title || (available ? 'Arka planda medya yok' : 'Medya servisine ulaşılamadı')
  const displayArtist = activeBrowserMedia?.artist || (session
    ? [session.artist, session.albumTitle].filter(Boolean).join(' · ') || appName
    : 'Spotify, Edge veya başka bir oynatıcı başlattığında burada görünür.')

  async function handleControl(action: 'toggle-play-pause' | 'next' | 'previous') {
    setBusy(true)
    try {
      if (activeBrowserMedia && action === 'toggle-play-pause') await desktop.browser.toggleMedia(activeBrowserMedia.tabId)
      else await desktop.media.control(action)
      window.setTimeout(() => void refresh(), 180)
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="dashboard-music-status-card" data-media-active={activeBrowserMedia || session ? 'true' : 'false'} aria-label="Windows sistem medya denetimi">
      <div className="dashboard-music-status-card__topline">
        <span className="dashboard-music-status-card__provider"><Radio size={13} /> {activeBrowserMedia ? 'Tarayıcı medyası' : 'Sistem medyası'}</span>
        <span className={`dashboard-music-status-card__state ${isPlaying ? 'dashboard-music-status-card__state--ready' : ''}`}>
          <span aria-hidden="true" /> {activeBrowserMedia ? (isPlaying ? 'Oynatılıyor' : 'Duraklatıldı') : session ? (isPlaying ? 'Oynatılıyor' : 'Duraklatıldı') : 'Beklemede'}
        </span>
      </div>

      <div className="dashboard-music-status-card__artwork" aria-label="Sistem medya oturumu">
        <div className="dashboard-music-status-card__artwork-fallback" aria-hidden="true">
          <AudioLines size={42} strokeWidth={1.5} />
        </div>
        {activeBrowserMedia?.artwork || activeBrowserMedia?.favicon ? <img src={activeBrowserMedia.artwork || activeBrowserMedia.favicon || ''} alt="" className="dashboard-music-status-card__artwork-image" /> : null}
        {isPlaying ? <div className="dashboard-music-status-card__artwork-eq" aria-hidden="true"><span /><span /><span /><span /></div> : null}
      </div>

      <div className="dashboard-music-status-card__track" aria-live="polite">
        <span className="dashboard-music-status-card__eyebrow">{activeBrowserMedia ? activeBrowserMedia.source : session ? appName : 'Windows medya oturumu'}</span>
        <strong title={displayTitle}>{displayTitle}</strong>
        <span className="dashboard-music-status-card__artist" title={displayArtist}>{displayArtist}</span>
      </div>

      <div className="dashboard-music-status-card__progress" aria-label="Parça ilerlemesi">
        <div className="dashboard-music-status-card__progress-meta">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        <div className="dashboard-music-status-card__progress-track" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="dashboard-music-status-card__controls" aria-label="Müzik kontrolleri">
        <button
          type="button"
          className="dashboard-music-status-card__control"
          onClick={() => void handleControl('previous')}
          disabled={busy || !session?.canSkipPrevious}
          title="Önceki parça"
          aria-label="Önceki parça"
        >
          <Rewind size={16} />
        </button>
        <button
          type="button"
          className="dashboard-music-status-card__control dashboard-music-status-card__control--play"
          onClick={() => void handleControl('toggle-play-pause')}
          disabled={busy || (!activeBrowserMedia && (!session || (!session.canPlay && !session.canPause)))}
          title={isPlaying ? 'Duraklat' : 'Oynat'}
          aria-label={isPlaying ? 'Duraklat' : 'Oynat'}
        >
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <button
          type="button"
          className="dashboard-music-status-card__control"
          onClick={() => void handleControl('next')}
          disabled={busy || !session?.canSkipNext}
          title="Sonraki parça"
          aria-label="Sonraki parça"
        >
          <FastForward size={16} />
        </button>
      </div>

      <div className="dashboard-music-status-card__session-meta">
        <span>{activeBrowserMedia?.source || (session ? appName : 'Otomatik algılama açık')}</span>
        <span>{activeBrowserMedia?.playing || session?.playbackStatus === 'playing' ? 'Canlı' : 'Hazır'}</span>
      </div>
    </aside>
  )
}

function formatAppName(sourceAppId: string) {
  if (!sourceAppId) return 'Medya oynatıcı'
  const lastPart = sourceAppId.split(/[.!\\/]/).filter(Boolean).at(-1) || sourceAppId
  return lastPart.replace(/\.exe$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const totalSeconds = Math.floor(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${remainingSeconds}`
}
