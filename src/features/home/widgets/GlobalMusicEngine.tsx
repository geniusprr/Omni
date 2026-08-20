import React, { useEffect, useRef } from 'react'
import { musicStore, useMusicPlayer } from './musicStore'

export function GlobalMusicEngine() {
  const { activeTrack, isPlaying, volume, isMuted, viewMode } = useMusicPlayer()
  const iframeContainerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const timerIntervalRef = useRef<number | null>(null)
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying

  useEffect(() => {
    let checkInterval: number | null = null

    function initPlayer() {
      if (!window.YT || !window.YT.Player) return false
      if (!iframeContainerRef.current) return false

      if (playerRef.current) {
        try {
          playerRef.current.destroy()
        } catch {
          // ignore
        }
      }

      const targetDiv = document.createElement('div')
      targetDiv.id = 'yt-global-engine-node'
      iframeContainerRef.current.innerHTML = ''
      iframeContainerRef.current.appendChild(targetDiv)

      playerRef.current = new window.YT.Player(targetDiv, {
        height: '100%',
        width: '100%',
        videoId: activeTrack.youtubeId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          playsinline: 1,
        },
        events: {
          onReady: (event: any) => {
            musicStore.setPlayerInstance(event.target)
            event.target.setVolume(isMuted ? 0 : volume)
            if (isPlayingRef.current) {
              event.target.playVideo()
            }
          },
          onStateChange: (event: any) => {
            if (event.data === 1) {
              musicStore.setPlaying(true)
            } else if (event.data === 2 || event.data === 0) {
              musicStore.setPlaying(false)
            }
          },
        },
      })

      return true
    }

    if (!window.YT) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      const firstScriptTag = document.getElementsByTagName('script')[0]
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag)

      window.onYouTubeIframeAPIReady = () => {
        initPlayer()
      }
    } else {
      initPlayer()
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval)
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [activeTrack.youtubeId])

  // Track playback time update
  useEffect(() => {
    if (isPlaying) {
      timerIntervalRef.current = window.setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          try {
            const cur = playerRef.current.getCurrentTime() || 0
            const dur = playerRef.current.getDuration() || 0
            musicStore.setTimeAndDuration(cur, dur)
          } catch {
            // ignore
          }
        }
      }, 800)
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [isPlaying])

  return (
    <div
      id="yt-global-engine-container"
      ref={iframeContainerRef}
      style={{
        position: 'fixed',
        top: -9999,
        left: -9999,
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: 'none',
        zIndex: -999,
      }}
      aria-hidden="true"
    />
  )
}

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady: () => void
  }
}
