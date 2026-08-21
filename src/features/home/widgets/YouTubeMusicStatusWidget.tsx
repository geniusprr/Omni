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
  const [controlError, setControlError] = useState<string | null>(null)
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

  const hasMedia = Boolean(activeBrowserMedia || session)
  const isPlaying = activeBrowserMedia?.playing ?? session?.playbackStatus === 'playing'
  const duration = session?.durationSeconds || 0
  const currentTime = session?.positionSeconds || 0
  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0
  const appName = activeBrowserMedia?.source || formatAppName(session?.sourceAppId || '')
  const displayTitle = activeBrowserMedia?.title || session?.title || 'Bilinmeyen parça'
  const displayArtist = activeBrowserMedia?.artist || (session
    ? [session.artist, session.albumTitle].filter(Boolean).join(' · ') || appName
    : '')
  const playerState = busy
    ? 'loading'
    : controlError || !available
      ? 'error'
      : hasMedia
        ? isPlaying ? 'playing' : 'paused'
        : 'idle'
  const statusLabel = !available
    ? 'Bağlantı yok'
    : hasMedia
      ? isPlaying ? 'Çalıyor' : 'Duraklatıldı'
      : 'Hazır'

  async function handleControl(action: 'toggle-play-pause' | 'next' | 'previous') {
    setBusy(true)
    setControlError(null)
    try {
      if (activeBrowserMedia && action === 'toggle-play-pause') await desktop.browser.toggleMedia(activeBrowserMedia.tabId)
      else await desktop.media.control(action)
      window.setTimeout(() => void refresh(), 180)
    } catch {
      setControlError('Medya denetimi şu anda yanıt vermiyor.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside
      className="dashboard-music-status-card"
      data-media-active={hasMedia ? 'true' : 'false'}
      data-state={playerState}
      aria-busy={busy}
      aria-label="Windows sistem medya denetimi"
    >
      <div className="dashboard-music-status-card__topline">
        <span className="dashboard-music-status-card__provider"><Radio size={13} aria-hidden="true" /> Müzik</span>
        <span className="dashboard-music-status-card__state" aria-live="polite">
          <span aria-hidden="true" /> {statusLabel}
        </span>
      </div>

      {hasMedia ? (
        <>
          <div className="dashboard-music-status-card__now-playing">
            <div className="dashboard-music-status-card__artwork" aria-hidden="true">
              <div className="dashboard-music-status-card__artwork-fallback">
                <AudioLines size={24} strokeWidth={1.75} />
              </div>
              {activeBrowserMedia?.artwork || activeBrowserMedia?.favicon ? <img src={activeBrowserMedia.artwork || activeBrowserMedia.favicon || ''} alt="" className="dashboard-music-status-card__artwork-image" /> : null}
            </div>

            <div className="dashboard-music-status-card__track" aria-live="polite">
              <span className="dashboard-music-status-card__eyebrow">{activeBrowserMedia ? activeBrowserMedia.source : appName}</span>
              <strong title={displayTitle}>{displayTitle}</strong>
              <span className="dashboard-music-status-card__artist" title={displayArtist}>{displayArtist}</span>
            </div>
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
              <Rewind size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="dashboard-music-status-card__control dashboard-music-status-card__control--play"
              onClick={() => void handleControl('toggle-play-pause')}
              disabled={busy || (!activeBrowserMedia && (!session || (!session.canPlay && !session.canPause)))}
              title={isPlaying ? 'Duraklat' : 'Oynat'}
              aria-label={isPlaying ? 'Duraklat' : 'Oynat'}
            >
              {isPlaying ? <Pause size={18} fill="currentColor" aria-hidden="true" /> : <Play size={18} fill="currentColor" aria-hidden="true" />}
            </button>
            <button
              type="button"
              className="dashboard-music-status-card__control"
              onClick={() => void handleControl('next')}
              disabled={busy || !session?.canSkipNext}
              title="Sonraki parça"
              aria-label="Sonraki parça"
            >
              <FastForward size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="dashboard-music-status-card__session-meta">
            <span>{activeBrowserMedia?.source || appName}</span>
            <span>{isPlaying ? 'Canlı' : 'Hazır'}</span>
          </div>
        </>
      ) : (
        <div className="dashboard-music-status-card__empty">
          <div className="dashboard-music-status-card__empty-mark" aria-hidden="true"><AudioLines size={20} strokeWidth={1.75} /></div>
          <div>
            <strong>{available ? 'Müzik hazır' : 'Medya servisi kapalı'}</strong>
            <p>{available ? 'Bir parça açtığında denetimler burada görünür.' : 'Windows medya oturumuna şu anda ulaşılamıyor.'}</p>
          </div>
        </div>
      )}

      {controlError ? <p className="dashboard-music-status-card__error" role="alert">{controlError}</p> : null}
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
