import FastForward from 'lucide-react/dist/esm/icons/fast-forward.js'
import Music2 from 'lucide-react/dist/esm/icons/music-2.js'
import Pause from 'lucide-react/dist/esm/icons/pause.js'
import Play from 'lucide-react/dist/esm/icons/play.js'
import Rewind from 'lucide-react/dist/esm/icons/rewind.js'
import Volume2 from 'lucide-react/dist/esm/icons/volume-2.js'
import VolumeX from 'lucide-react/dist/esm/icons/volume-x.js'
import {
  controlYouTubeMusic,
  setYouTubeMusicSession,
  setYouTubeMusicVolume,
  useYouTubeMusicSession,
} from '@/features/music/youtubeMusicSession'

export function YouTubeMusicStatusWidget() {
  const {
    ready,
    trackTitle,
    artist,
    isPlaying,
    currentTime,
    duration,
    volume,
    muted,
    artworkUrl,
  } = useYouTubeMusicSession()

  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0
  const volumeValue = volume === null ? 0 : Math.min(100, Math.max(0, volume))
  const displayTitle = trackTitle || (ready ? 'YouTube Music' : 'Müzik ekranı hazırlanıyor')
  const displayArtist = artist || 'Sanatçı bilgisi bekleniyor'

  async function handleControl(action: 'toggle-play' | 'next' | 'previous' | 'toggle-mute') {
    await controlYouTubeMusic(action).catch(() => undefined)
    if (action === 'toggle-play') setYouTubeMusicSession({ isPlaying: !isPlaying })
    if (action === 'toggle-mute') setYouTubeMusicSession({ muted: !muted })
  }

  function handleVolumeChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextVolume = Number(event.currentTarget.value)
    setYouTubeMusicSession({ volume: nextVolume, muted: nextVolume === 0 })
    void setYouTubeMusicVolume(nextVolume).catch(() => undefined)
  }

  return (
    <aside className="dashboard-music-status-card" aria-label="YouTube Music oynatıcı">
      <div className="dashboard-music-status-card__topline">
        <span className="dashboard-music-status-card__icon" aria-hidden="true">
          <Music2 size={17} />
        </span>
        <span className="dashboard-music-status-card__provider">YouTube Music</span>
        <span
          className={`dashboard-music-status-card__status-dot ${ready ? 'dashboard-music-status-card__status-dot--ready' : ''}`}
          title={ready ? 'Bağlı' : 'Hazırlanıyor'}
          aria-label={ready ? 'Bağlı' : 'Hazırlanıyor'}
        />
      </div>

      <div className="dashboard-music-status-card__artwork" aria-label="Çalan parçanın kapağı">
        <div className="dashboard-music-status-card__artwork-fallback" aria-hidden="true">
          <Music2 size={42} strokeWidth={1.5} />
        </div>
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt=""
            className="dashboard-music-status-card__artwork-image"
            onError={(event) => {
              event.currentTarget.hidden = true
            }}
          />
        ) : null}
      </div>

      <div className="dashboard-music-status-card__track" aria-live="polite">
        <span className="dashboard-music-status-card__eyebrow">Şarkı adı</span>
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
          disabled={!ready}
          title="Önceki parça"
          aria-label="Önceki parça"
        >
          <Rewind size={16} />
        </button>
        <button
          type="button"
          className="dashboard-music-status-card__control dashboard-music-status-card__control--play"
          onClick={() => void handleControl('toggle-play')}
          disabled={!ready}
          title={isPlaying ? 'Duraklat' : 'Oynat'}
          aria-label={isPlaying ? 'Duraklat' : 'Oynat'}
        >
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <button
          type="button"
          className="dashboard-music-status-card__control"
          onClick={() => void handleControl('next')}
          disabled={!ready}
          title="Sonraki parça"
          aria-label="Sonraki parça"
        >
          <FastForward size={16} />
        </button>
      </div>

      <div className="dashboard-music-status-card__volume">
        <button
          type="button"
          className="dashboard-music-status-card__volume-mute"
          onClick={() => void handleControl('toggle-mute')}
          disabled={!ready}
          title={muted ? 'Sesi aç' : 'Sesi kapat'}
          aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
        >
          {muted || volumeValue === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={volumeValue}
          disabled={!ready || volume === null}
          onChange={handleVolumeChange}
          aria-label="Ses seviyesi"
        />
        <span className="dashboard-music-status-card__volume-value">{volume === null ? '—' : `${Math.round(volumeValue)}%`}</span>
      </div>
    </aside>
  )
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const totalSeconds = Math.floor(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${remainingSeconds}`
}
