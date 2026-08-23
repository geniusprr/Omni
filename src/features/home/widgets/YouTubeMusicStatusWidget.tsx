import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AudioLines from 'lucide-react/dist/esm/icons/audio-lines.js'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.js'
import CircleAlert from 'lucide-react/dist/esm/icons/circle-alert.js'
import FastForward from 'lucide-react/dist/esm/icons/fast-forward.js'
import ListMusic from 'lucide-react/dist/esm/icons/list-music.js'
import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle.js'
import Music2 from 'lucide-react/dist/esm/icons/music-2.js'
import Pause from 'lucide-react/dist/esm/icons/pause.js'
import Play from 'lucide-react/dist/esm/icons/play.js'
import Rewind from 'lucide-react/dist/esm/icons/rewind.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useMusicPlayer } from '@/features/music/core/musicStore'
import { trackDurationLabel, type MusicTrack } from '@/features/music/core/types'
import {
  controlYouTubeMusic,
  syncYouTubeMusicState,
  useYouTubeMusicSession,
} from '@/features/music/youtubeMusicSession'
import { BROWSER_EVENTS, desktop, type BrowserMediaProjection, type SystemMediaSession } from '@/lib/desktop'

type MediaKind = 'browser' | 'system' | 'youtube' | 'mix' | 'idle'

export function SystemMediaStatusWidget() {
  const [session, setSession] = useState<SystemMediaSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [available, setAvailable] = useState(true)
  const [controlError, setControlError] = useState<string | null>(null)
  const [browserMedia, setBrowserMedia] = useState<Record<string, BrowserMediaProjection>>({})
  const [lastBrowserMedia, setLastBrowserMedia] = useState<BrowserMediaProjection | null>(null)
  const mixSessionSeenRef = useRef(false)
  const youtubeMusic = useYouTubeMusicSession()
  const {
    activeTrack,
    queue,
    queueIndex,
    playbackState: mixPlaybackState,
    currentTime: mixCurrentTime,
    duration: mixDuration,
    isPlaying: mixIsPlaying,
    history,
    togglePlay: toggleMixPlay,
    playTrack,
    nextTrack: nextMixTrack,
    prevTrack: previousMixTrack,
  } = useMusicPlayer()

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
    const stopMedia = desktop.browser.on<BrowserMediaProjection>(BROWSER_EVENTS.mediaUpdated, (media) => {
      setBrowserMedia((current) => ({ ...current, [media.tabId]: media }))
      setLastBrowserMedia(media)
    })
    const stopDestroyed = desktop.browser.on<{ id: string }>(BROWSER_EVENTS.tabDestroyed, (tab) => {
      setBrowserMedia((current) => {
        const { [tab.id]: _closed, ...remaining } = current
        return remaining
      })
      setLastBrowserMedia((current) => current?.tabId === tab.id ? null : current)
    })
    return () => { stopMedia(); stopDestroyed() }
  }, [])

  useEffect(() => {
    if (activeTrack && mixPlaybackState !== 'paused' && mixPlaybackState !== 'idle') {
      mixSessionSeenRef.current = true
    }
  }, [activeTrack, mixPlaybackState])

  const activeBrowserMedia = useMemo(() => Object.values(browserMedia)
    .filter((item) => item.playing)
    .sort((a, b) => b.lastPlayingAt - a.lastPlayingAt)[0] ?? null, [browserMedia])
  const rememberedBrowserMedia = activeBrowserMedia ?? lastBrowserMedia
  const hasBrowserMedia = Boolean(rememberedBrowserMedia)
  const hasSystemSession = Boolean(session && (
    session.title || session.artist || session.albumTitle || session.sourceAppId
  ))
  const hasYouTubeTrack = Boolean(youtubeMusic.ready && (youtubeMusic.trackTitle || youtubeMusic.artist))
  const hasMixSession = Boolean(activeTrack && (
    mixSessionSeenRef.current ||
    (mixPlaybackState !== 'paused' && mixPlaybackState !== 'idle') ||
    history.some((track) => track.id === activeTrack.id)
  ))
  const mediaKind: MediaKind = activeBrowserMedia
    ? 'browser'
    : session?.playbackStatus === 'playing'
      ? 'system'
      : hasYouTubeTrack && youtubeMusic.isPlaying
        ? 'youtube'
        : hasMixSession && mixIsPlaying
          ? 'mix'
          : hasBrowserMedia
            ? 'browser'
            : hasSystemSession
              ? 'system'
              : hasYouTubeTrack
                ? 'youtube'
                : hasMixSession
                  ? 'mix'
                  : 'idle'
  const hasMedia = mediaKind !== 'idle'
  const isPlaying = mediaKind === 'browser'
    ? Boolean(rememberedBrowserMedia?.playing)
    : mediaKind === 'system'
      ? session?.playbackStatus === 'playing'
      : mediaKind === 'youtube'
        ? youtubeMusic.isPlaying
        : mediaKind === 'mix'
          ? mixIsPlaying
          : false
  const duration = mediaKind === 'browser'
    ? rememberedBrowserMedia?.duration || session?.durationSeconds || 0
    : mediaKind === 'system'
      ? session?.durationSeconds || 0
      : mediaKind === 'youtube'
        ? youtubeMusic.duration
        : mediaKind === 'mix'
          ? mixDuration
          : 0
  const currentTime = mediaKind === 'browser'
    ? rememberedBrowserMedia?.currentTime || session?.positionSeconds || 0
    : mediaKind === 'system'
      ? session?.positionSeconds || 0
      : mediaKind === 'youtube'
        ? youtubeMusic.currentTime
        : mediaKind === 'mix'
          ? mixCurrentTime
          : 0
  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0
  const displayTitle = mediaKind === 'browser'
    ? rememberedBrowserMedia?.title || session?.title || 'Bilinmeyen parça'
    : mediaKind === 'system'
      ? session?.title || 'Bilinmeyen parça'
      : mediaKind === 'youtube'
        ? youtubeMusic.trackTitle || 'YouTube Music'
        : mediaKind === 'mix'
          ? activeTrack?.title || 'Mix'
          : ''
  const displayArtist = mediaKind === 'browser'
    ? rememberedBrowserMedia?.artist || session?.artist || session?.albumTitle || 'Medya oynatıcı'
    : mediaKind === 'system'
      ? [session?.artist, session?.albumTitle].filter(Boolean).join(' · ') || formatAppName(session?.sourceAppId || '')
      : mediaKind === 'youtube'
        ? youtubeMusic.artist || 'YouTube Music'
        : mediaKind === 'mix'
          ? activeTrack?.artist || 'Mix'
          : ''
  const displayArtwork = mediaKind === 'browser'
    ? rememberedBrowserMedia?.artwork || rememberedBrowserMedia?.favicon || null
    : mediaKind === 'youtube'
      ? youtubeMusic.artworkUrl
      : mediaKind === 'mix'
        ? activeTrack?.artworkUrl || null
        : null
  const displaySource = mediaKind === 'browser'
    ? rememberedBrowserMedia?.source || 'Tarayıcı'
    : mediaKind === 'system'
      ? formatAppName(session?.sourceAppId || '')
      : mediaKind === 'youtube'
        ? 'YouTube Music'
        : 'Mix'
  const mixIsOpen = Boolean(hasMixSession && (mediaKind === 'mix' || youtubeMusic.visible))
  const upcomingTracks = useMemo(() => {
    if (!mixIsOpen || queue.length < 2 || queueIndex < 0) return []
    return queue
      .slice(queueIndex + 1, queueIndex + 5)
      .map((track, offset) => ({ track, index: queueIndex + offset + 1 }))
  }, [mixIsOpen, queue, queueIndex])
  const canToggle = mediaKind === 'mix'
    ? Boolean(activeTrack)
    : mediaKind === 'youtube' || mediaKind === 'browser'
      ? true
      : Boolean(session && (session.canPlay || session.canPause))
  const canPrevious = mediaKind === 'mix'
    ? queueIndex > 0 || queue.length > 1
    : mediaKind === 'youtube' || mediaKind === 'browser'
      ? true
      : Boolean(session?.canSkipPrevious)
  const canNext = mediaKind === 'mix'
    ? queueIndex >= 0 && (queueIndex < queue.length - 1 || queue.length > 1)
    : mediaKind === 'youtube' || mediaKind === 'browser'
      ? true
      : Boolean(session?.canSkipNext)
  const playerState = busy
    ? 'loading'
    : controlError || !available
      ? 'error'
      : hasMedia
        ? isPlaying ? 'playing' : 'paused'
        : 'idle'

  async function handleControl(action: 'toggle-play-pause' | 'next' | 'previous') {
    setBusy(true)
    setControlError(null)
    try {
      if (mediaKind === 'mix') {
        if (action === 'toggle-play-pause') toggleMixPlay()
        else if (action === 'next') nextMixTrack()
        else previousMixTrack()
        return
      }

      if (mediaKind === 'youtube') {
        await controlYouTubeMusic(action === 'toggle-play-pause' ? 'toggle-play' : action)
        await syncYouTubeMusicState()
        return
      }

      if (rememberedBrowserMedia && action === 'toggle-play-pause') {
        await desktop.browser.toggleMedia(rememberedBrowserMedia.tabId)
      } else {
        await desktop.media.control(action)
      }
      window.setTimeout(() => void refresh(), 180)
    } catch {
      setControlError('Medya denetimi şu anda yanıt vermiyor.')
    } finally {
      setBusy(false)
    }
  }

  function handleQueueSelect(index: number) {
    if (busy) return
    setControlError(null)
    playTrack(index)
  }

  return (
    <Card
      role="complementary"
      className="dashboard-music-status-card"
      data-media-active={hasMedia ? 'true' : 'false'}
      data-mix-active={mixIsOpen ? 'true' : 'false'}
      data-state={playerState}
      aria-busy={busy}
      aria-label="Müzik alanı"
    >
      <div className="dashboard-music-status-card__header">
        <div className="dashboard-music-status-card__heading">
          <span className="dashboard-music-status-card__heading-icon" aria-hidden="true">
            <Music2 size={15} strokeWidth={1.8} />
          </span>
          <span className="dashboard-music-status-card__heading-copy">
            <strong>Müzik</strong>
            <span>{hasMedia ? 'Şimdi çalıyor' : 'Medya denetimi'}</span>
          </span>
        </div>

        <Badge
          variant={hasMedia && isPlaying ? 'success' : hasMedia ? 'secondary' : 'outline'}
          className="dashboard-music-status-card__badge"
        >
          <span className="dashboard-music-status-card__badge-dot" aria-hidden="true" />
          {hasMedia ? (isPlaying ? 'Çalıyor' : 'Duraklatıldı') : available ? 'Hazır' : 'Bağlantı yok'}
        </Badge>
      </div>

      {hasMedia ? (
        <>
          <div className="dashboard-music-status-card__active-content">
            <div className="dashboard-music-status-card__now-playing">
              <div className="dashboard-music-status-card__artwork" aria-hidden="true">
                <div className="dashboard-music-status-card__artwork-fallback">
                  <AudioLines size={28} strokeWidth={1.6} />
                </div>
                {displayArtwork ? <img src={displayArtwork} alt="" className="dashboard-music-status-card__artwork-image" /> : null}
                {isPlaying ? (
                  <span className="dashboard-music-status-card__artwork-eq" aria-hidden="true">
                    <span /><span /><span /><span />
                  </span>
                ) : (
                  <span className="dashboard-music-status-card__artwork-paused" aria-hidden="true">
                    <Pause size={14} fill="currentColor" />
                  </span>
                )}
              </div>

              <div className="dashboard-music-status-card__track" aria-live="polite">
                <span className="dashboard-music-status-card__eyebrow">{displaySource}</span>
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
              <Button
                type="button"
                variant="icon"
                className="dashboard-music-status-card__control"
                onClick={() => void handleControl('previous')}
                disabled={busy || !canPrevious}
                title="Önceki parça"
                aria-label="Önceki parça"
              >
                <Rewind size={16} aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="icon"
                className="dashboard-music-status-card__control dashboard-music-status-card__control--play"
                onClick={() => void handleControl('toggle-play-pause')}
                disabled={busy || !canToggle}
                title={isPlaying ? 'Duraklat' : 'Oynat'}
                aria-label={isPlaying ? 'Duraklat' : 'Oynat'}
              >
                {busy ? (
                  <LoaderCircle className="dashboard-music-status-card__spinner" size={18} aria-hidden="true" />
                ) : isPlaying ? (
                  <Pause size={18} fill="currentColor" aria-hidden="true" />
                ) : (
                  <Play size={18} fill="currentColor" aria-hidden="true" />
                )}
              </Button>
              <Button
                type="button"
                variant="icon"
                className="dashboard-music-status-card__control"
                onClick={() => void handleControl('next')}
                disabled={busy || !canNext}
                title="Sonraki parça"
                aria-label="Sonraki parça"
              >
                <FastForward size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>

          {upcomingTracks.length > 0 ? (
            <section className="dashboard-music-status-card__queue" aria-label="Mix kuyruğu">
              <div className="dashboard-music-status-card__queue-header">
                <div>
                  <span className="dashboard-music-status-card__queue-kicker">Mix</span>
                  <h2>Sıradaki</h2>
                </div>
                <span className="dashboard-music-status-card__queue-count">{upcomingTracks.length} parça</span>
              </div>
              <div className="dashboard-music-status-card__queue-list">
                {upcomingTracks.map(({ track, index }, position) => (
                  <Button
                    key={`${track.id}-${index}`}
                    type="button"
                    variant="ghost"
                    className="dashboard-music-status-card__queue-item"
                    onClick={() => handleQueueSelect(index)}
                    disabled={busy}
                    title={`${track.title} parçasını oynat`}
                    aria-label={`Sıradaki ${position + 1}: ${track.title}, ${track.artist}`}
                  >
                    <span className="dashboard-music-status-card__queue-index">{String(position + 1).padStart(2, '0')}</span>
                    <span className="dashboard-music-status-card__queue-thumb" aria-hidden="true">
                      {track.artworkUrl ? <img src={track.artworkUrl} alt="" /> : <Music2 size={14} />}
                    </span>
                    <span className="dashboard-music-status-card__queue-copy">
                      <strong title={track.title}>{track.title}</strong>
                      <span title={track.artist}>{track.artist}</span>
                    </span>
                    <span className="dashboard-music-status-card__queue-duration">{formatTrackDuration(track)}</span>
                    <ChevronRight className="dashboard-music-status-card__queue-chevron" size={14} aria-hidden="true" />
                  </Button>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <div className="dashboard-music-status-card__empty dashboard-music-status-card__empty--polished">
          <div className="dashboard-music-status-card__empty-visual" aria-hidden="true">
            <div className="dashboard-music-status-card__empty-cover">
              <span className="dashboard-music-status-card__empty-cover-disc">
                <span />
              </span>
              <AudioLines size={22} strokeWidth={1.55} />
            </div>
          </div>
          <div className="dashboard-music-status-card__empty-copy">
            <span className="dashboard-music-status-card__empty-kicker"><ListMusic size={12} aria-hidden="true" /> Şimdi çalıyor</span>
            <strong>{available ? 'Henüz bir şey çalmıyor' : 'Medya bağlantısı bekleniyor'}</strong>
            <p>{available
              ? 'Tarayıcıda veya bilgisayarında bir parça başlat. Widget otomatik olarak devralır.'
              : 'Windows medya oturumuna şu anda ulaşılamıyor.'}</p>
          </div>

          <div className="dashboard-music-status-card__idle-progress" aria-hidden="true">
            <div className="dashboard-music-status-card__progress-meta">
              <span>0:00</span>
              <span>—:—</span>
            </div>
            <div className="dashboard-music-status-card__progress-track" />
          </div>

          <div className="dashboard-music-status-card__controls dashboard-music-status-card__controls--idle" aria-label="Müzik kontrolleri">
            <Button type="button" variant="icon" className="dashboard-music-status-card__control" disabled aria-label="Önceki parça">
              <Rewind size={16} aria-hidden="true" />
            </Button>
            <Button type="button" variant="icon" className="dashboard-music-status-card__control dashboard-music-status-card__control--play" disabled aria-label="Oynat">
              <Play size={18} fill="currentColor" aria-hidden="true" />
            </Button>
            <Button type="button" variant="icon" className="dashboard-music-status-card__control" disabled aria-label="Sonraki parça">
              <FastForward size={16} aria-hidden="true" />
            </Button>
          </div>

          <div className="dashboard-music-status-card__empty-footer">
            <span><span className="dashboard-music-status-card__auto-dot" aria-hidden="true" /> Otomatik medya algılama</span>
            <span>Tarayıcı · Windows · YouTube Music</span>
          </div>
        </div>
      )}

      {controlError ? (
        <p className="dashboard-music-status-card__error" role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          <span>{controlError}</span>
        </p>
      ) : null}
    </Card>
  )
}

function formatAppName(sourceAppId: string) {
  if (!sourceAppId) return 'Medya oynatıcı'
  const lastPart = sourceAppId.split(/[.!\\/]/).filter(Boolean).at(-1) || sourceAppId
  return lastPart.replace(/\.exe$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatTrackDuration(track: MusicTrack) {
  const label = trackDurationLabel(track)
  if (label) return label
  if (!track.durationMs) return '—'
  return formatTime(track.durationMs / 1000)
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const totalSeconds = Math.floor(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = String(totalSeconds % 60).padStart(2, '0')
  return hours > 0
    ? `${hours}:${String(minutes % 60).padStart(2, '0')}:${remainingSeconds}`
    : `${minutes}:${remainingSeconds}`
}
