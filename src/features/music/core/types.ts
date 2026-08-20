export type MusicProviderId = 'youtube' | 'spotify'

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'

export type RepeatMode = 'off' | 'all' | 'one'

export type MusicErrorCode =
  | 'video-unavailable'
  | 'embedding-disabled'
  | 'region-restricted'
  | 'age-restricted'
  | 'network-offline'
  | 'api-quota-exceeded'
  | 'data-api-unavailable'
  | 'player-initialization'
  | 'autoplay-blocked'
  | 'provider-unsupported'
  | 'invalid-track'
  | 'unknown'

export interface MusicError {
  code: MusicErrorCode
  message: string
  provider?: MusicProviderId
  rawCode?: string | number
  recoverable: boolean
}

export class MusicProviderError extends Error {
  readonly code: MusicErrorCode
  readonly provider: MusicProviderId
  readonly rawCode?: string | number
  readonly recoverable: boolean

  constructor(
    code: MusicErrorCode,
    message: string,
    provider: MusicProviderId,
    options: { rawCode?: string | number; recoverable?: boolean } = {},
  ) {
    super(message)
    this.name = 'MusicProviderError'
    this.code = code
    this.provider = provider
    this.rawCode = options.rawCode
    this.recoverable = options.recoverable ?? true
  }
}

export interface MusicTrack {
  /** Stable, provider-aware key. Example: youtube:dQw4w9WgXcQ. */
  id: string
  provider: MusicProviderId
  providerTrackId: string

  title: string
  artist: string
  album?: string

  artworkUrl?: string
  durationMs?: number
  externalUrl?: string

  /** App-level or provider-specific metadata that is not part of the common model. */
  metadata?: Record<string, unknown>
}

export interface MusicProviderSearchOptions {
  signal?: AbortSignal
  limit?: number
  regionCode?: string
}

export interface MusicProvider {
  readonly id: MusicProviderId
  search(query: string, options?: MusicProviderSearchOptions): Promise<MusicTrack[]>
  resolveTrack(providerTrackId: string, options?: { signal?: AbortSignal }): Promise<MusicTrack>
}

export interface MusicPlaybackController {
  readonly provider: MusicProviderId
  load(providerTrackId: string, autoplay: boolean): void
  play(): void
  pause(): void
  seek(seconds: number): void
  setVolume(volume: number): void
  setMuted(muted: boolean): void
  stop?(): void
  destroy(): void
}

export function trackKey(provider: MusicProviderId, providerTrackId: string): string {
  return `${provider}:${providerTrackId}`
}

export function isMusicTrack(value: unknown): value is MusicTrack {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<MusicTrack>
  return (
    typeof item.id === 'string' &&
    (item.provider === 'youtube' || item.provider === 'spotify') &&
    typeof item.providerTrackId === 'string' &&
    item.providerTrackId.trim().length > 0 &&
    typeof item.title === 'string' &&
    item.title.trim().length > 0 &&
    typeof item.artist === 'string' &&
    item.artist.trim().length > 0
  )
}

export function trackCategory(track: MusicTrack): string | undefined {
  const category = track.metadata?.category
  return typeof category === 'string' ? category : undefined
}

export function trackDurationLabel(track: MusicTrack): string | undefined {
  const label = track.metadata?.durationLabel
  return typeof label === 'string' ? label : undefined
}

export function toMusicError(error: unknown, fallback = 'Müzik oynatılamadı.'): MusicError {
  if (error instanceof MusicProviderError) {
    return {
      code: error.code,
      message: error.message,
      provider: error.provider,
      rawCode: error.rawCode,
      recoverable: error.recoverable,
    }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      code: 'network-offline',
      message: 'İnternet bağlantısı yok. Bağlantıyı kontrol edip tekrar deneyin.',
      recoverable: true,
    }
  }

  return {
    code: 'unknown',
    message: error instanceof Error && error.message ? error.message : fallback,
    recoverable: true,
  }
}
