import React, { useEffect, useRef } from 'react'
import { musicStore, useMusicPlayer } from './musicStore'

export function GlobalMusicEngine() {
  const { activeTrack, isPlaying, volume, isMuted } = useMusicPlayer()
  const iframeContainerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const timerIntervalRef = useRef<number | null>(null)
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const isMutedRef = useRef(isMuted)
  isMutedRef.current = isMuted
  const activeTrackIdRef = useRef(activeTrack?.youtubeId)
  activeTrackIdRef.current = activeTrack?.youtubeId

  // Initial YouTube API and Player Mount
  useEffect(() => {
    let isMounted = true
    let checkInterval: number | null = null

    function setupPlayer() {
      if (!isMounted) return
      if (!window.YT || !window.YT.Player) return
      if (!iframeContainerRef.current) return
      const targetYoutubeId = activeTrack?.youtubeId || 'jfKfPfyJRdk'

      // If player already exists, load video
      if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
        try {
          if (isPlayingRef.current) {
            playerRef.current.loadVideoById({
              videoId: targetYoutubeId,
              startSeconds: 0,
            })
            playerRef.current.unMute()
            playerRef.current.setVolume(isMutedRef.current ? 0 : volumeRef.current || 70)
            playerRef.current.playVideo()
          } else {
            playerRef.current.cueVideoById({
              videoId: targetYoutubeId,
              startSeconds: 0,
            })
          }
          return
        } catch {
          // If loadVideoById fails, re-create below
        }
      }

      if (playerRef.current) {
        try {
          playerRef.current.destroy()
        } catch {
          // ignore
        }
        playerRef.current = null
      }

      const targetDiv = document.createElement('div')
      targetDiv.id = 'yt-global-engine-node'
      iframeContainerRef.current.innerHTML = ''
      iframeContainerRef.current.appendChild(targetDiv)

      try {
        playerRef.current = new window.YT.Player(targetDiv, {
          height: '180',
          width: '320',
          videoId: targetYoutubeId,
          playerVars: {
            autoplay: isPlayingRef.current ? 1 : 0,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: (event: any) => {
              if (!isMounted) return
              const target = event.target
              musicStore.setPlayerInstance(target)
              try {
                if (isMutedRef.current) {
                  target.mute()
                } else {
                  target.unMute()
                }
                target.setVolume(isMutedRef.current ? 0 : volumeRef.current || 70)
                if (isPlayingRef.current) {
                  target.playVideo()
                }
              } catch (e) {
                console.warn('YouTube Player ready init error:', e)
              }
            },
            onStateChange: (event: any) => {
              if (!isMounted) return
              const state = event.data
              if (state === 1) {
                // YT.PlayerState.PLAYING
                musicStore.setPlaying(true)
              } else if (state === 2) {
                // YT.PlayerState.PAUSED
                musicStore.setPlaying(false)
              } else if (state === 0) {
                // YT.PlayerState.ENDED -> auto advance!
                musicStore.onTrackEnded()
              } else if (state === 3) {
                // YT.PlayerState.BUFFERING
                musicStore.setPlayerStatus('loading')
              }
            },
            onError: (event: any) => {
              if (!isMounted) return
              console.warn('YouTube Player playback error:', event.data)
              musicStore.setPlayerStatus(
                'error',
                'Bu parça kısıtlı veya yüklenemedi. Sonraki parçaya geçiliyor...',
              )
              window.setTimeout(() => {
                if (isMounted) {
                  musicStore.nextTrack()
                }
              }, 1800)
            },
          },
        })
      } catch (err) {
        console.error('Failed to create YouTube player:', err)
      }
    }

    // Load YouTube API script if not loaded
    if (!window.YT || !window.YT.Player) {
      if (!document.getElementById('yt-iframe-api-script')) {
        const tag = document.createElement('script')
        tag.id = 'yt-iframe-api-script'
        tag.src = 'https://www.youtube.com/iframe_api'
        const firstScriptTag = document.getElementsByTagName('script')[0]
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag)
      }

      const prevCb = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevCb === 'function') prevCb()
        setupPlayer()
      }

      checkInterval = window.setInterval(() => {
        if (window.YT && window.YT.Player) {
          if (checkInterval) clearInterval(checkInterval)
          checkInterval = null
          setupPlayer()
        }
      }, 200)
    } else {
      setupPlayer()
    }

    return () => {
      isMounted = false
      if (checkInterval) clearInterval(checkInterval)
    }
  }, [activeTrack?.youtubeId])

  // Play / Pause synchronizer
  useEffect(() => {
    if (playerRef.current) {
      try {
        if (isPlaying) {
          playerRef.current.unMute()
          playerRef.current.setVolume(isMuted ? 0 : volume || 70)
          if (typeof playerRef.current.playVideo === 'function') {
            playerRef.current.playVideo()
          }
        } else {
          if (typeof playerRef.current.pauseVideo === 'function') {
            playerRef.current.pauseVideo()
          }
        }
      } catch {
        // ignore
      }
    }
  }, [isPlaying])

  // Volume synchronizer
  useEffect(() => {
    if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
      try {
        if (isMuted) {
          playerRef.current.mute()
        } else {
          playerRef.current.unMute()
          playerRef.current.setVolume(volume)
        }
      } catch {
        // ignore
      }
    }
  }, [volume, isMuted])

  // Progress time updater
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
      }, 500)
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
        bottom: 0,
        right: 0,
        width: 320,
        height: 180,
        opacity: 0.01,
        pointerEvents: 'none',
        zIndex: 1,
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
