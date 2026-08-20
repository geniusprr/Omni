import { ExternalLink, FastForward, Music2, RotateCcw, X } from 'lucide-react'
import { useMusicPlayer } from '@/features/music/core/musicStore'
import { YouTubePlayer } from '@/features/music/providers/youtube/YouTubePlayer'

export interface GlobalMusicEngineProps {
  screenMode?: string
}

/**
 * The only playback engine in the application. It is deliberately visible and
 * uses the official YouTube IFrame Player API; every other music surface only
 * controls this controller through the central store.
 */
export function GlobalMusicEngine({ screenMode = 'home' }: GlobalMusicEngineProps) {
  const {
    provider,
    activeTrack,
    error,
    isPlaying,
    clearError,
    nextTrack,
    togglePlay,
  } = useMusicPlayer()
  const shouldSkipTrack = error
    ? ['embedding-disabled', 'video-unavailable', 'age-restricted', 'region-restricted'].includes(error.code)
    : false

  return (
    <aside
      className={`global-music-engine global-music-engine--${screenMode}`}
      aria-label="Aktif müzik oynatıcısı"
    >
      <div className="global-music-engine__header">
        <span className="global-music-engine__provider">
          <Music2 size={13} aria-hidden="true" />
          {provider === 'youtube' ? 'YouTube' : 'Spotify'} oynatıcı
        </span>
        <span className="global-music-engine__track" title={activeTrack?.title || 'Parça seçilmedi'}>
          {activeTrack?.title || 'Parça seçilmedi'}
        </span>
      </div>

      {provider === 'youtube' ? (
        <YouTubePlayer />
      ) : (
        <div className="global-music-engine__provider-fallback">
          <Music2 size={20} aria-hidden="true" />
          <strong>Spotify tam oynatma desteklenmiyor</strong>
          <span>Spotify uygulamasında açabilirsiniz.</span>
        </div>
      )}

      <div className="global-music-engine__footer">
        <span>{activeTrack?.artist || 'YouTube içeriği'}</span>
        {activeTrack?.externalUrl ? (
          <a href={activeTrack.externalUrl} target="_blank" rel="noopener noreferrer">
            YouTube’da aç <ExternalLink size={11} aria-hidden="true" />
          </a>
        ) : null}
      </div>

      {error ? (
        <div className="global-music-engine__error" role="alert">
          <span className="global-music-engine__error-copy">
            <strong>{shouldSkipTrack ? 'Bu video uygulamada oynatılamıyor.' : 'Oynatma durdu.'}</strong>
            <span>{error.message}</span>
          </span>
          <span className="global-music-engine__error-actions">
            <button
              type="button"
              onClick={shouldSkipTrack ? nextTrack : togglePlay}
              aria-label={shouldSkipTrack ? 'Sonraki parçaya geç' : isPlaying ? 'Duraklat' : 'Tekrar oynat'}
              title={shouldSkipTrack ? 'Sonraki parçaya geç' : 'Tekrar oynat'}
            >
              {shouldSkipTrack ? <FastForward size={12} aria-hidden="true" /> : <RotateCcw size={12} aria-hidden="true" />}
            </button>
            <button type="button" onClick={clearError} aria-label="Müzik hatasını kapat" title="Hatayı kapat">
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        </div>
      ) : null}
    </aside>
  )
}
