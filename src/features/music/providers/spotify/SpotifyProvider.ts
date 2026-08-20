import { MusicProviderError, type MusicProvider, type MusicProviderSearchOptions, type MusicTrack } from '../../core/types'

/**
 * Spotify is intentionally a capability boundary for now. It documents the
 * provider contract without pretending that credentials or DRM-backed playback
 * are available in the Electron renderer.
 */
export class SpotifyProvider implements MusicProvider {
  readonly id = 'spotify' as const

  search(_query: string, _options?: MusicProviderSearchOptions): Promise<MusicTrack[]> {
    return Promise.reject(new MusicProviderError(
      'provider-unsupported',
      'Spotify tam oynatma bu sistemde henüz desteklenmiyor. Spotify uygulamasında açabilirsiniz.',
      'spotify',
    ))
  }

  resolveTrack(_providerTrackId: string): Promise<MusicTrack> {
    return Promise.reject(new MusicProviderError(
      'provider-unsupported',
      'Spotify tam oynatma bu sistemde henüz desteklenmiyor. Spotify uygulamasında açabilirsiniz.',
      'spotify',
    ))
  }
}

export const spotifyProvider = new SpotifyProvider()
