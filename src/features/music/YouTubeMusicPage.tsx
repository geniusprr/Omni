import { useEffect, useRef, useState } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi'
import { Webview, getCurrentWebview } from '@tauri-apps/api/webview'
import { desktop, isTauriRuntime } from '@/lib/desktop'
import { setYouTubeMusicSession, syncYouTubeMusicState } from './youtubeMusicSession'

const YOUTUBE_MUSIC_URL = 'https://music.youtube.com/'
const YOUTUBE_MUSIC_WEBVIEW_LABEL = 'youtube-music'

type WebviewState = 'loading' | 'ready' | 'error'

/**
 * Hosts the real YouTube Music site in a native child webview.
 *
 * YouTube Music rejects iframe embedding in some WebView/browser combinations,
 * so this deliberately does not use an iframe or a second custom player.
 */
interface YouTubeMusicPageProps {
  isVisible?: boolean
}

export function YouTubeMusicPage({ isVisible = true }: YouTubeMusicPageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const webviewRef = useRef<Webview | null>(null)
  const isVisibleRef = useRef(isVisible)
  const isCreatedRef = useRef(false)
  const [webviewState, setWebviewState] = useState<WebviewState>(() => (
    isTauriRuntime() ? 'loading' : 'ready'
  ))
  const [error, setError] = useState<string | null>(null)

  isVisibleRef.current = isVisible

  useEffect(() => {
    setYouTubeMusicSession({ visible: isVisible })
    const childWebview = webviewRef.current
    if (!childWebview || !isCreatedRef.current) return

    const visibilityTask = isVisible
      ? childWebview.show()
      : childWebview.hide()

    void visibilityTask
      .then(() => {
        if (isVisible && hostRef.current) {
          updateHostBounds(hostRef.current, childWebview)
          void syncYouTubeMusicState().catch(() => undefined)
          window.requestAnimationFrame(() => {
            if (hostRef.current) {
              updateHostBounds(hostRef.current, childWebview)
              void syncYouTubeMusicState().catch(() => undefined)
            }
          })
          window.setTimeout(() => {
            if (hostRef.current) updateHostBounds(hostRef.current, childWebview)
          }, 80)
          window.setTimeout(() => {
            if (hostRef.current) updateHostBounds(hostRef.current, childWebview)
          }, 250)
        }
      })
      .catch((cause) => {
        console.error('[youtube-music] webview visibility update failed', cause)
      })
  }, [isVisible])

  useEffect(() => {
    if (!isTauriRuntime()) return

    let disposed = false
    let unlisten: UnlistenFn | null = null
    const syncInterval = window.setInterval(() => {
      void syncYouTubeMusicState().catch(() => undefined)
    }, 1_000)

    void listen<string>('youtube-music-state', (event) => {
      if (disposed) return
      try {
        const decoded = JSON.parse(event.payload) as unknown
        const payload = typeof decoded === 'string' ? JSON.parse(decoded) as Record<string, unknown> : decoded as Record<string, unknown>
        const currentTime = readFiniteNumber(payload.currentTime)
        const duration = readFiniteNumber(payload.duration)
        const volume = readFiniteNumber(payload.volume)
        setYouTubeMusicSession({
          trackTitle: typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : null,
          artist: typeof payload.artist === 'string' && payload.artist.trim() ? payload.artist.trim() : null,
          isPlaying: payload.isPlaying === true,
          currentTime: currentTime === null ? 0 : Math.max(0, currentTime),
          duration: duration === null ? 0 : Math.max(0, duration),
          volume: volume === null ? null : Math.min(100, Math.max(0, volume)),
          muted: payload.muted === true,
          artworkUrl: typeof payload.artworkUrl === 'string' && payload.artworkUrl.trim()
            ? payload.artworkUrl.trim()
            : null,
        })
      } catch (cause) {
        console.error('[youtube-music] state payload could not be parsed', cause)
      }
    }).then((cleanup) => {
      if (disposed) cleanup()
      else unlisten = cleanup
    }).catch((cause) => {
      console.error('[youtube-music] state listener could not be registered', cause)
    })

    return () => {
      disposed = true
      window.clearInterval(syncInterval)
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    if (!isTauriRuntime()) {
      setYouTubeMusicSession({ ready: true, error: null })
      return
    }

    const hostNode = hostRef.current
    if (!hostNode) return

    let disposed = false
    let childWebview: Webview | null = null
    let resizeObserver: ResizeObserver | null = null
    let boundsFrame = 0

    function getHostBounds() {
      const rect = hostNode!.getBoundingClientRect()
      return {
        x: Math.max(0, Math.round(rect.left)),
        y: Math.max(0, Math.round(rect.top)),
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      }
    }

    function updateBounds() {
      if (disposed || !childWebview) return
      if (boundsFrame) window.cancelAnimationFrame(boundsFrame)

      boundsFrame = window.requestAnimationFrame(() => {
        if (disposed || !childWebview) return
        const { x, y, width, height } = getHostBounds()
        if (width < 10 || height < 10) return
        void Promise.all([
          childWebview.setPosition(new LogicalPosition(x, y)),
          childWebview.setSize(new LogicalSize(width, height)),
        ]).catch((cause) => {
          if (disposed) return
          console.error('[youtube-music] webview bounds update failed', cause)
        })
      })
    }

    function handleWebviewError(cause: unknown) {
      if (disposed) return
      console.error('[youtube-music] webview creation failed', cause)
      if (isCreatedRef.current) return
      setError('YouTube Music gömülü görünümü başlatılamadı.')
      setWebviewState('error')
      setYouTubeMusicSession({ ready: false, error: 'YouTube Music gömülü görünümü başlatılamadı.' })
    }

    const { x, y, width, height } = getHostBounds()
    try {
      childWebview = new Webview(getCurrentWebview().window, YOUTUBE_MUSIC_WEBVIEW_LABEL, {
        url: YOUTUBE_MUSIC_URL,
        x,
        y,
        width,
        height,
        focus: false,
        transparent: true,
      })
      webviewRef.current = childWebview

      void childWebview.once('tauri://created', () => {
        if (disposed) return
        isCreatedRef.current = true
        setError(null)
        setWebviewState('ready')
        setYouTubeMusicSession({ ready: true, error: null })
        updateBounds()
        void syncYouTubeMusicState().catch(() => undefined)
        const visibilityTask = isVisibleRef.current
          ? childWebview?.show()
          : childWebview?.hide()
        void visibilityTask?.catch(handleWebviewError)
      }).catch(handleWebviewError)

      void childWebview.once('tauri://error', (event) => {
        handleWebviewError(event)
      }).catch(handleWebviewError)

      resizeObserver = new ResizeObserver(updateBounds)
      resizeObserver.observe(hostNode!)
      window.addEventListener('resize', updateBounds)
      updateBounds()
    } catch (cause) {
      handleWebviewError(cause)
    }

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateBounds)
      if (boundsFrame) window.cancelAnimationFrame(boundsFrame)

      const currentWebview = webviewRef.current
      webviewRef.current = null
      isCreatedRef.current = false
      setYouTubeMusicSession({
        ready: false,
        visible: false,
        trackTitle: null,
        artist: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: null,
        muted: false,
        artworkUrl: null,
      })
      if (currentWebview) void currentWebview.close().catch(() => undefined)
    }
  }, [])

  return (
    <div ref={hostRef} className="youtube-music-webview-host" data-youtube-music-webview>
      {!isTauriRuntime() ? (
        <div className="youtube-music-browser-fallback">
          <p>YouTube Music, masaüstü uygulamasının gömülü tarayıcısında açılır.</p>
          <a
            href={YOUTUBE_MUSIC_URL}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              event.preventDefault()
              void desktop.openExternal(YOUTUBE_MUSIC_URL).catch(() => undefined)
            }}
          >
            YouTube Music’i tarayıcıda aç
          </a>
        </div>
      ) : null}

      {webviewState === 'error' ? (
        <div className="youtube-music-browser-fallback" role="alert">
          <p>{error || 'YouTube Music açılamadı.'}</p>
          <a
            href={YOUTUBE_MUSIC_URL}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              event.preventDefault()
              void desktop.openExternal(YOUTUBE_MUSIC_URL).catch(() => undefined)
            }}
          >
            Tarayıcıda aç
          </a>
        </div>
      ) : null}
    </div>
  )
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function updateHostBounds(hostNode: HTMLDivElement | null, childWebview: Webview) {
  if (!hostNode) return
  const rect = hostNode.getBoundingClientRect()
  if (rect.width < 10 || rect.height < 10) return
  const x = Math.max(0, Math.round(rect.left))
  const y = Math.max(0, Math.round(rect.top))
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  void Promise.all([
    childWebview.setPosition(new LogicalPosition(x, y)),
    childWebview.setSize(new LogicalSize(width, height)),
  ]).catch((cause) => {
    console.error('[youtube-music] webview bounds update failed', cause)
  })
}
