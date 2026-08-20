import type { MusicPlaybackController } from '../../core/types'

export interface YouTubeSearchItem {
  id?: { kind?: string; videoId?: string }
  snippet?: {
    title?: string
    channelTitle?: string
    thumbnails?: {
      default?: { url?: string }
      medium?: { url?: string }
      high?: { url?: string }
    }
  }
}

export interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[]
  error?: { errors?: Array<{ reason?: string }>; message?: string }
}

export interface YouTubeVideoItem {
  id?: string
  snippet?: {
    title?: string
    channelTitle?: string
    thumbnails?: {
      default?: { url?: string }
      medium?: { url?: string }
      high?: { url?: string }
    }
  }
  contentDetails?: {
    duration?: string
    regionRestriction?: { allowed?: string[]; blocked?: string[] }
  }
  status?: {
    embeddable?: boolean
    privacyStatus?: string
    uploadStatus?: string
  }
}

export interface YouTubeVideosResponse {
  items?: YouTubeVideoItem[]
  error?: { errors?: Array<{ reason?: string }>; message?: string }
}

export interface YouTubeOEmbedResponse {
  title?: string
  author_name?: string
  thumbnail_url?: string
}

export interface YouTubePlayerEvent<T = number> {
  target: YouTubePlayerApi
  data?: T
}

export interface YouTubePlayerApi {
  loadVideoById(videoIdOrOptions: string | { videoId: string; startSeconds?: number }): void
  cueVideoById(videoIdOrOptions: string | { videoId: string; startSeconds?: number }): void
  playVideo(): void
  pauseVideo(): void
  stopVideo?(): void
  seekTo(seconds: number, allowSeekAhead?: boolean): void
  setVolume(volume: number): void
  mute(): void
  unMute(): void
  destroy(): void
  getCurrentTime(): number
  getDuration(): number
}

export interface YouTubePlayerOptions {
  width?: string | number
  height?: string | number
  videoId?: string
  playerVars?: Record<string, string | number>
  events?: {
    onReady?: (event: YouTubePlayerEvent<void>) => void
    onStateChange?: (event: YouTubePlayerEvent<number>) => void
    onError?: (event: YouTubePlayerEvent<number>) => void
    onAutoplayBlocked?: (event: YouTubePlayerEvent<void>) => void
  }
}

export interface YouTubeNamespace {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayerApi
  PlayerState?: {
    UNSTARTED: -1
    ENDED: 0
    PLAYING: 1
    PAUSED: 2
    BUFFERING: 3
    CUED: 5
  }
}

export function asMusicPlaybackController(player: YouTubePlayerApi): MusicPlaybackController {
  return {
    provider: 'youtube',
    load(providerTrackId, autoplay) {
      if (autoplay) {
        player.loadVideoById({ videoId: providerTrackId, startSeconds: 0 })
      } else {
        player.cueVideoById({ videoId: providerTrackId, startSeconds: 0 })
      }
    },
    play: () => player.playVideo(),
    pause: () => player.pauseVideo(),
    seek: (seconds) => player.seekTo(Math.max(0, seconds), true),
    setVolume: (volume) => player.setVolume(Math.max(0, Math.min(100, volume))),
    setMuted: (muted) => (muted ? player.mute() : player.unMute()),
    stop: () => player.stopVideo?.(),
    destroy: () => player.destroy(),
  }
}

declare global {
  interface Window {
    YT?: YouTubeNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}
