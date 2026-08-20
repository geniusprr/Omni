export interface SpotifyTrackReference {
  id: string
  uri: string
  name: string
  artists: Array<{ name: string }>
  album?: { name?: string; images?: Array<{ url: string }> }
  duration_ms?: number
  external_urls?: { spotify?: string }
}

export type SpotifyPlaybackMode = 'embed' | 'web-playback-sdk'
