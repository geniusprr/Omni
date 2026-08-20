import { useSyncExternalStore } from 'react'
import { desktop, isElectronRuntime, type YouTubeMusicState } from '@/lib/desktop'

export type YouTubeMusicControl = 'toggle-play' | 'next' | 'previous' | 'toggle-mute'

interface YouTubeMusicSessionState {
  ready: boolean
  visible: boolean
  error: string | null
  trackTitle: string | null
  artist: string | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number | null
  muted: boolean
  artworkUrl: string | null
}

let state: YouTubeMusicSessionState = {
  ready: false,
  visible: false,
  error: null,
  trackTitle: null,
  artist: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: null,
  muted: false,
  artworkUrl: null,
}

const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function applyState(payload: YouTubeMusicState) {
  state = {
    ...state,
    ready: true,
    error: null,
    trackTitle: payload.title || null,
    artist: payload.artist || null,
    isPlaying: payload.isPlaying,
    currentTime: Math.max(0, payload.currentTime || 0),
    duration: Math.max(0, payload.duration || 0),
    volume: typeof payload.volume === 'number' ? Math.min(100, Math.max(0, payload.volume)) : null,
    muted: payload.muted,
    artworkUrl: payload.artworkUrl || null,
  }
  notify()
}

export function setYouTubeMusicSession(next: Partial<YouTubeMusicSessionState>) {
  state = { ...state, ...next }
  notify()
}

export function useYouTubeMusicSession() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => state,
  )
}

export async function controlYouTubeMusic(action: YouTubeMusicControl): Promise<void> {
  if (!isElectronRuntime()) return
  await desktop.youtubeMusic.control(action)
}

export async function setYouTubeMusicVolume(volume: number): Promise<void> {
  if (!isElectronRuntime()) return
  await desktop.youtubeMusic.setVolume(volume)
}

export async function syncYouTubeMusicState(): Promise<void> {
  if (!isElectronRuntime()) return
  const payload = await desktop.youtubeMusic.syncState()
  if (payload) applyState(payload)
}

let stateListenerStarted = false
if (typeof window !== 'undefined' && !stateListenerStarted) {
  stateListenerStarted = true
  desktop.youtubeMusic.onState(applyState)
}
