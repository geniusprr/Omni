import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js'
import FastForward from 'lucide-react/dist/esm/icons/fast-forward.js'
import Pause from 'lucide-react/dist/esm/icons/pause.js'
import Play from 'lucide-react/dist/esm/icons/play.js'
import Rewind from 'lucide-react/dist/esm/icons/rewind.js'
import Youtube from 'lucide-react/dist/esm/icons/youtube.js'
import { useMusicPlayer } from '@/features/music/core/musicStore'
import {
  controlYouTubeMusic,
  syncYouTubeMusicState,
  useYouTubeMusicSession,
} from '@/features/music/youtubeMusicSession'
import { desktop } from '@/lib/desktop'

export interface TitlebarMiniPlayerProps {
  onOpenStudio?: () => void
}

export function TitlebarMiniPlayer({ onOpenStudio }: TitlebarMiniPlayerProps = {}) {
  const { activeTrack, isPlaying, themeConfig, togglePlay, nextTrack, prevTrack } = useMusicPlayer()
  const youtubeMusic = useYouTubeMusicSession()

  if (!activeTrack && !youtubeMusic.ready) return null

  const displayTitle = youtubeMusic.trackTitle || activeTrack?.title || 'YouTube Music'
  const displayArtist = youtubeMusic.artist || (youtubeMusic.ready ? 'YouTube Music' : activeTrack?.artist || 'Müzik')
  const displayIsPlaying = youtubeMusic.ready ? youtubeMusic.isPlaying : isPlaying
  const externalUrl = activeTrack?.externalUrl

  async function handleTogglePlay() {
    if (!youtubeMusic.ready) {
      togglePlay()
      return
    }
    await controlYouTubeMusic('toggle-play').catch(() => undefined)
    void syncYouTubeMusicState().catch(() => undefined)
  }

  async function handleNextTrack() {
    if (!youtubeMusic.ready) {
      nextTrack()
      return
    }
    await controlYouTubeMusic('next').catch(() => undefined)
    void syncYouTubeMusicState().catch(() => undefined)
  }

  async function handlePreviousTrack() {
    if (!youtubeMusic.ready) {
      prevTrack()
      return
    }
    await controlYouTubeMusic('previous').catch(() => undefined)
    void syncYouTubeMusicState().catch(() => undefined)
  }

  return (
    <div
      className="titlebar-mini-player"
      style={{ '--yt-accent': themeConfig.accent, '--yt-glow': themeConfig.glow } as React.CSSProperties}
      data-window-drag
    >
      <button
        type="button"
        className="titlebar-player-track-info"
        onClick={onOpenStudio}
        title="Müzik ekranını aç"
      >
        <span className="titlebar-player-thumb-wrap">
          {youtubeMusic.artworkUrl || activeTrack?.artworkUrl ? (
            <img src={youtubeMusic.artworkUrl || activeTrack?.artworkUrl} alt="" className="titlebar-player-thumb" />
          ) : <Youtube size={14} />}
          {displayIsPlaying ? (
            <span className="titlebar-mini-eq" aria-hidden="true">
              <span className="tb-eq-bar tb-eq-1" />
              <span className="tb-eq-bar tb-eq-2" />
              <span className="tb-eq-bar tb-eq-3" />
            </span>
          ) : null}
        </span>
        <span className="titlebar-player-text">
          <span className="titlebar-player-title">{displayTitle}</span>
          <span className="titlebar-player-artist">{displayArtist}</span>
        </span>
      </button>

      <div className="titlebar-player-controls">
        <button type="button" className="titlebar-player-btn" onClick={() => void handlePreviousTrack()} title="Önceki" aria-label="Önceki">
          <Rewind size={13} />
        </button>
        <button
          type="button"
          className="titlebar-player-play-btn"
          onClick={() => void handleTogglePlay()}
          title={displayIsPlaying ? 'Duraklat' : 'Oynat'}
          aria-label={displayIsPlaying ? 'Duraklat' : 'Oynat'}
          style={{ boxShadow: displayIsPlaying ? `0 0 10px ${themeConfig.glow}` : undefined }}
        >
          {displayIsPlaying ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <button type="button" className="titlebar-player-btn" onClick={() => void handleNextTrack()} title="Sonraki" aria-label="Sonraki">
          <FastForward size={13} />
        </button>
      </div>

      {externalUrl ? (
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="titlebar-player-btn"
          title="YouTube’da aç"
          aria-label="YouTube’da aç"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void desktop.openExternal(externalUrl).catch(() => undefined)
          }}
        >
          <ExternalLink size={12} />
        </a>
      ) : null}
    </div>
  )
}
