const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

function isYouTubeHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '')
  return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be'
}

export function extractYoutubeVideoId(value: string): string | null {
  const input = value.trim()
  if (!input) return null
  if (VIDEO_ID_PATTERN.test(input)) return input

  let url: URL
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`)
  } catch {
    return null
  }

  if (!isYouTubeHost(url.hostname)) return null

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const pathParts = url.pathname.split('/').filter(Boolean)
  let candidate: string | null = null

  if (host === 'youtu.be') {
    candidate = pathParts[0] || null
  } else if (url.pathname === '/watch' || url.pathname === '/watch/') {
    candidate = url.searchParams.get('v')
  } else if (pathParts[0] === 'shorts' || pathParts[0] === 'embed' || pathParts[0] === 'v') {
    candidate = pathParts[1] || null
  }

  return candidate && VIDEO_ID_PATTERN.test(candidate) ? candidate : null
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
}

export function youtubeMusicUrl(videoId: string): string {
  return `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`
}
