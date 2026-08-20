import { useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime } from '@/lib/desktop'

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
  if (!isTauriRuntime()) return
  await invoke<void>('youtube_music_control', { action })
}

export async function setYouTubeMusicVolume(volume: number): Promise<void> {
  if (!isTauriRuntime()) return
  await invoke<void>('youtube_music_set_volume', { volume })
}

export async function syncYouTubeMusicState(): Promise<void> {
  if (!isTauriRuntime()) return
  await invoke<void>('youtube_music_sync_state')
}
