import type {
  MusicProvider,
  MusicProviderSearchOptions,
  MusicTrack,
} from '../../core/types'
import { fetchYouTubeTrackMetadata, searchYouTubeVideos } from './youtubeSearch'

export class YouTubeProvider implements MusicProvider {
  readonly id = 'youtube' as const

  search(query: string, options?: MusicProviderSearchOptions): Promise<MusicTrack[]> {
    return searchYouTubeVideos(query, options)
  }

  resolveTrack(providerTrackId: string, options?: { signal?: AbortSignal }): Promise<MusicTrack> {
    return fetchYouTubeTrackMetadata(providerTrackId, options?.signal)
  }
}

export const youtubeProvider = new YouTubeProvider()
