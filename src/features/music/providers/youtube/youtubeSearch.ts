import {
  MusicProviderError,
  trackKey,
  type MusicProviderSearchOptions,
  type MusicTrack,
} from '../../core/types'
import type {
  YouTubeOEmbedResponse,
  YouTubeSearchItem,
  YouTubeSearchResponse,
  YouTubeVideoItem,
  YouTubeVideosResponse,
} from './youtubeTypes'
import { youtubeWatchUrl } from './youtubeUrl'

const YOUTUBE_DATA_API_BASE = 'https://www.googleapis.com/youtube/v3'
const YOUTUBE_OEMBED_URL = 'https://www.youtube.com/oembed'

export interface YouTubeDataApiConfig {
  proxyUrl?: string
  apiKey?: string
}

function getEnvValue(name: string): string {
  const env = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {})
  return env[name]?.trim() || ''
}

export function getYoutubeDataApiConfig(): YouTubeDataApiConfig {
  const proxyUrl = getEnvValue('VITE_YOUTUBE_DATA_API_PROXY_URL')
  const apiKey = getEnvValue('VITE_YOUTUBE_DATA_API_KEY')
  return {
    ...(proxyUrl ? { proxyUrl: proxyUrl.replace(/\/$/, '') } : {}),
    ...(apiKey ? { apiKey } : {}),
  }
}

function apiUrl(config: YouTubeDataApiConfig, resource: 'search' | 'videos'): string {
  return config.proxyUrl ? `${config.proxyUrl}/${resource}` : `${YOUTUBE_DATA_API_BASE}/${resource}`
}

function parseDuration(value: string | undefined): number | undefined {
  if (!value) return undefined
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)
  if (!match) return undefined
  const hours = Number(match[1] || 0)
  const minutes = Number(match[2] || 0)
  const seconds = Number(match[3] || 0)
  return (hours * 3600 + minutes * 60 + seconds) * 1000
}

function getErrorReason(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const error = (payload as { error?: { errors?: Array<{ reason?: string }> } }).error
  return error?.errors?.[0]?.reason
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new MusicProviderError(
      typeof navigator !== 'undefined' && navigator.onLine === false ? 'network-offline' : 'data-api-unavailable',
      typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'İnternet bağlantısı yok. Bağlantıyı kontrol edip tekrar deneyin.'
        : 'YouTube Data API’ye ulaşılamadı.',
      'youtube',
    )
  }

  const payload = (await response.json().catch(() => ({}))) as T
  if (response.ok) return payload

  const reason = getErrorReason(payload)
  if (response.status === 403 && (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded')) {
    throw new MusicProviderError(
      'api-quota-exceeded',
      'YouTube arama kotası doldu. Bir süre sonra tekrar deneyin.',
      'youtube',
      { rawCode: reason },
    )
  }
  if (response.status === 403 && reason === 'videoEmbeddingDisabled') {
    throw new MusicProviderError(
      'embedding-disabled',
      'Bu YouTube videosu uygulama içinde oynatılamıyor.',
      'youtube',
      { rawCode: reason },
    )
  }
  throw new MusicProviderError(
    'data-api-unavailable',
    'YouTube arama servisi şu anda kullanılamıyor.',
    'youtube',
    { rawCode: reason || response.status },
  )
}

function createParams(
  params: Record<string, string>,
  config: YouTubeDataApiConfig,
): string {
  const searchParams = new URLSearchParams(params)
  if (config.apiKey && !config.proxyUrl) searchParams.set('key', config.apiKey)
  return searchParams.toString()
}

function getThumbnail(item: { snippet?: YouTubeVideoItem['snippet'] }): string | undefined {
  return item.snippet?.thumbnails?.high?.url
    || item.snippet?.thumbnails?.medium?.url
    || item.snippet?.thumbnails?.default?.url
}

function createTrack(
  videoId: string,
  title: string,
  artist: string,
  artworkUrl: string | undefined,
  durationMs: number | undefined,
  source: 'youtube-data-api-v3' | 'youtube-oembed' = 'youtube-data-api-v3',
): MusicTrack {
  return {
    id: trackKey('youtube', videoId),
    provider: 'youtube',
    providerTrackId: videoId,
    title,
    artist,
    ...(artworkUrl ? { artworkUrl } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    externalUrl: youtubeWatchUrl(videoId),
    metadata: { source },
  }
}

function getConfiguredApiError(): MusicProviderError {
  return new MusicProviderError(
    'data-api-unavailable',
    'YouTube Data API yapılandırılmadı. VITE_YOUTUBE_DATA_API_PROXY_URL önerilir; doğrudan API anahtarı yalnızca kısıtlanmış bir geliştirme anahtarı olmalıdır.',
    'youtube',
  )
}

async function fetchVideoDetails(
  ids: string[],
  config: YouTubeDataApiConfig,
  signal?: AbortSignal,
): Promise<Map<string, YouTubeVideoItem>> {
  if (ids.length === 0) return new Map()
  const payload = await fetchJson<YouTubeVideosResponse>(
    `${apiUrl(config, 'videos')}?${createParams({ part: 'snippet,contentDetails,status', id: ids.join(',') }, config)}`,
    signal,
  )
  return new Map((payload.items || []).filter((item): item is YouTubeVideoItem & { id: string } => Boolean(item.id)).map((item) => [item.id, item]))
}

export async function searchYouTubeVideos(
  query: string,
  options: MusicProviderSearchOptions = {},
): Promise<MusicTrack[]> {
  const q = query.trim()
  if (!q) return []

  const config = getYoutubeDataApiConfig()
  if (!config.proxyUrl && !config.apiKey) throw getConfiguredApiError()

  const limit = Math.max(1, Math.min(25, options.limit || 12))
  const searchPayload = await fetchJson<YouTubeSearchResponse>(
    `${apiUrl(config, 'search')}?${createParams({
      part: 'snippet',
      q,
      type: 'video',
      maxResults: String(limit),
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      regionCode: options.regionCode || 'TR',
    }, config)}`,
    options.signal,
  )

  const candidates = (searchPayload.items || []).filter(
    (item: YouTubeSearchItem): item is YouTubeSearchItem & { id: { videoId: string } } =>
      Boolean(item.id?.videoId && item.snippet?.title && item.snippet?.channelTitle),
  )
  const details = await fetchVideoDetails(
    candidates.map((item) => item.id.videoId),
    config,
    options.signal,
  )

  return candidates.flatMap((item) => {
    const videoId = item.id.videoId
    const detail = details.get(videoId)
    if (detail?.status?.embeddable === false) return []
    return [createTrack(
      videoId,
      item.snippet?.title || detail?.snippet?.title || 'YouTube videosu',
      item.snippet?.channelTitle || detail?.snippet?.channelTitle || 'YouTube',
      getThumbnail(detail || item),
      parseDuration(detail?.contentDetails?.duration),
    )]
  })
}

async function fetchOEmbedTrack(videoId: string, signal?: AbortSignal): Promise<MusicTrack> {
  const response = await fetch(
    `${YOUTUBE_OEMBED_URL}?url=${encodeURIComponent(youtubeWatchUrl(videoId))}&format=json`,
    { signal, headers: { Accept: 'application/json' } },
  ).catch((error) => {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new MusicProviderError(
      typeof navigator !== 'undefined' && navigator.onLine === false ? 'network-offline' : 'video-unavailable',
      'YouTube videosunun bilgileri alınamadı.',
      'youtube',
    )
  })

  if (!response.ok) {
    throw new MusicProviderError(
      'video-unavailable',
      'YouTube videosu bulunamadı veya kullanılamıyor.',
      'youtube',
      { rawCode: response.status },
    )
  }
  const payload = (await response.json()) as YouTubeOEmbedResponse
  if (!payload.title || !payload.author_name) {
    throw new MusicProviderError('video-unavailable', 'YouTube video metadata’sı eksik.', 'youtube')
  }
  return createTrack(videoId, payload.title, payload.author_name, payload.thumbnail_url, undefined, 'youtube-oembed')
}

export async function fetchYouTubeTrackMetadata(
  videoId: string,
  signal?: AbortSignal,
): Promise<MusicTrack> {
  const config = getYoutubeDataApiConfig()
  if (!config.proxyUrl && !config.apiKey) return fetchOEmbedTrack(videoId, signal)

  const details = await fetchVideoDetails([videoId], config, signal)
  const detail = details.get(videoId)
  if (!detail) {
    throw new MusicProviderError('video-unavailable', 'YouTube videosu bulunamadı veya kullanılamıyor.', 'youtube')
  }
  if (detail.status?.embeddable === false) {
    throw new MusicProviderError('embedding-disabled', 'Bu YouTube videosu uygulama içinde oynatılamıyor.', 'youtube')
  }
  if (detail.status?.privacyStatus === 'private') {
    throw new MusicProviderError('video-unavailable', 'Bu YouTube videosu herkese açık değil.', 'youtube')
  }
  return createTrack(
    videoId,
    detail.snippet?.title || 'YouTube videosu',
    detail.snippet?.channelTitle || 'YouTube',
    getThumbnail(detail),
    parseDuration(detail.contentDetails?.duration),
  )
}
