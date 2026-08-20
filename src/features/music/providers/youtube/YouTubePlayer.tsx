import { useEffect, useRef } from 'react'
import { musicStore, useMusicPlayer } from '../../core/musicStore'
import { MusicProviderError, toMusicError } from '../../core/types'
import {
  asMusicPlaybackController,
  type YouTubeNamespace,
  type YouTubePlayerApi,
} from './youtubeTypes'

let youtubeApiPromise: Promise<YouTubeNamespace> | null = null

function loadYouTubeIframeApi(): Promise<YouTubeNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new MusicProviderError('player-initialization', 'YouTube oynatıcı yalnızca masaüstü ortamında başlatılabilir.', 'youtube'))
  }
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const finish = () => {
      if (window.YT?.Player) resolve(window.YT)
      else reject(new MusicProviderError('player-initialization', 'YouTube oynatıcı API’si yüklenemedi.', 'youtube'))
    }

    const previousCallback = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.()
      finish()
    }

    const existingScript = document.getElementById('shutty-youtube-iframe-api') as HTMLScriptElement | null
    if (existingScript) {
      const poll = window.setInterval(() => {
        if (window.YT?.Player) {
          window.clearInterval(poll)
          finish()
        }
      }, 100)
      window.setTimeout(() => {
        window.clearInterval(poll)
        if (!window.YT?.Player) {
          reject(new MusicProviderError('player-initialization', 'YouTube oynatıcı API’si zamanında yanıt vermedi.', 'youtube'))
        }
      }, 15000)
      return
    }

    const script = document.createElement('script')
    script.id = 'shutty-youtube-iframe-api'
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => reject(new MusicProviderError('player-initialization', 'YouTube oynatıcı API’si yüklenemedi.', 'youtube'))
    document.head.appendChild(script)
  }).catch((error) => {
    youtubeApiPromise = null
    throw error
  })

  return youtubeApiPromise
}

function mapPlayerError(code: number): MusicProviderError {
  if (code === 2) {
    return new MusicProviderError('invalid-track', 'YouTube video kimliği geçersiz.', 'youtube', { rawCode: code })
  }
  if (code === 5) {
    return new MusicProviderError('player-initialization', 'YouTube oynatıcısı HTML5 içeriğini başlatamadı.', 'youtube', { rawCode: code })
  }
  if (code === 100) {
    return new MusicProviderError('video-unavailable', 'Bu YouTube videosu bulunamıyor veya artık herkese açık değil.', 'youtube', { rawCode: code })
  }
  if (code === 101 || code === 150) {
    return new MusicProviderError('embedding-disabled', 'Bu YouTube videosunun uygulama içinde oynatılmasına izin verilmiyor.', 'youtube', { rawCode: code })
  }
  if (code === 153) {
    return new MusicProviderError('player-initialization', 'YouTube oynatıcısı uygulama kimliğini doğrulayamadı.', 'youtube', { rawCode: code })
  }
  return new MusicProviderError('unknown', 'YouTube videosu oynatılamadı. Video sahibi kısıtlama uygulamış olabilir.', 'youtube', { rawCode: code })
}

function playerOrigin(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const origin = window.location.origin
  return origin && origin !== 'null' ? origin : undefined
}

export function YouTubePlayer() {
  const { activeTrack, playbackState, providerReady } = useMusicPlayer()
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YouTubePlayerApi | null>(null)
  const controllerRef = useRef<ReturnType<typeof asMusicPlaybackController> | null>(null)
  const loadedTrackIdRef = useRef<string | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    let disposed = false

    void loadYouTubeIframeApi()
      .then((api) => {
        if (disposed || !containerRef.current) return
        const mountNode = document.createElement('div')
        mountNode.className = 'youtube-player-api-mount'
        containerRef.current.replaceChildren(mountNode)
        const origin = playerOrigin()

        const player = new api.Player(mountNode, {
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 1,
            enablejsapi: 1,
            fs: 1,
            hl: 'tr',
            iv_load_policy: 3,
            playsinline: 1,
            rel: 0,
            ...(origin ? { origin } : {}),
          },
          events: {
            onReady: (event) => {
              if (disposed) return
              playerRef.current = event.target
              const controller = asMusicPlaybackController(event.target)
              controllerRef.current = controller
              musicStore.registerPlaybackController(controller)
              const current = musicStore.getState()
              controller.setVolume(current.volume)
              controller.setMuted(current.muted)
            },
            onStateChange: (event) => {
              if (disposed) return
              if (event.data === 1) {
                musicStore.setPlaybackState('playing')
              } else if (event.data === 2) {
                musicStore.setPlaybackState('paused')
              } else if (event.data === 0) {
                musicStore.onTrackEnded()
              } else if (event.data === 3) {
                musicStore.setPlaybackState('loading')
              }
            },
            onError: (event) => {
              if (disposed) return
              musicStore.setPlaybackError(toMusicError(mapPlayerError(event.data || 0)))
            },
            onAutoplayBlocked: () => {
              if (disposed) return
              musicStore.setPlaybackError(toMusicError(new MusicProviderError(
                'autoplay-blocked',
                'Tarayıcı otomatik oynatmayı engelledi. Oynat düğmesine basarak devam edin.',
                'youtube',
              )))
              musicStore.setPlaybackState('paused')
            },
          },
        })
        playerRef.current = player
      })
      .catch((error) => {
        if (!disposed) musicStore.setPlaybackError(toMusicError(error, 'YouTube oynatıcısı başlatılamadı.'))
      })

    return () => {
      disposed = true
      isMountedRef.current = false
      const controller = controllerRef.current
      if (controller) musicStore.unregisterPlaybackController(controller)
      controllerRef.current = null
      loadedTrackIdRef.current = null
      const player = playerRef.current
      playerRef.current = null
      try {
        player?.destroy()
      } catch {
        // The player mount may already have been removed by the renderer.
      }
    }
  }, [])

  useEffect(() => {
    const controller = controllerRef.current
    if (!controller || !providerReady || !activeTrack || activeTrack.provider !== 'youtube') return
    if (loadedTrackIdRef.current === activeTrack.id) return
    loadedTrackIdRef.current = activeTrack.id
    const shouldPlay = playbackState === 'loading' || playbackState === 'playing'
    controller.load(activeTrack.providerTrackId, shouldPlay)
  }, [activeTrack, playbackState, providerReady])

  useEffect(() => {
    const controller = controllerRef.current
    if (!controller || !providerReady || !activeTrack) return
    if (loadedTrackIdRef.current !== activeTrack.id) return
    if (playbackState === 'paused' || playbackState === 'ended' || playbackState === 'error') {
      controller.pause()
    } else if (playbackState === 'playing') {
      controller.play()
    }
  }, [activeTrack, playbackState, providerReady])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!isMountedRef.current || !playerRef.current) return
      try {
        musicStore.setTimeAndDuration(
          playerRef.current.getCurrentTime() || 0,
          playerRef.current.getDuration() || 0,
        )
      } catch {
        // The player may be between renderer navigation states.
      }
    }, 500)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !activeTrack) return
    const mediaSession = navigator.mediaSession
    try {
      mediaSession.metadata = new MediaMetadata({
        title: activeTrack.title,
        artist: activeTrack.artist,
        album: activeTrack.album || 'YouTube',
        artwork: activeTrack.artworkUrl ? [{ src: activeTrack.artworkUrl }] : undefined,
      })

      const actionHandlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
        ['play', () => {
          if (musicStore.getState().playbackState !== 'playing') musicStore.togglePlay()
        }],
        ['pause', () => {
          if (musicStore.getState().playbackState === 'playing') musicStore.togglePlay()
        }],
        ['nexttrack', () => musicStore.nextTrack()],
        ['previoustrack', () => musicStore.prevTrack()],
        ['seekto', (details) => {
          if (details.seekTime !== undefined) musicStore.seekTo(details.seekTime)
        }],
      ]
      for (const [action, handler] of actionHandlers) mediaSession.setActionHandler(action, handler)
      return () => {
        for (const [action] of actionHandlers) {
          try {
            mediaSession.setActionHandler(action, null)
          } catch {
            // Some WebViews reject clearing unsupported action handlers.
          }
        }
      }
    } catch {
      // Media Session is optional in Electron renderer environments.
      return undefined
    }
  }, [activeTrack])

  return (
    <div
      ref={containerRef}
      className="youtube-player-viewport"
      aria-label="Resmi YouTube video oynatıcısı"
    />
  )
}
