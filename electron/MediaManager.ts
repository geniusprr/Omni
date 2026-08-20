import type { WebContents } from 'electron'
import type { BrowserMediaProjection, SystemMediaSession, YouTubeMusicState } from '../shared/contracts.js'

const MEDIA_PROBE_SCRIPT = `(() => {
  try {
    const absolute = (value) => {
      try { return value ? new URL(value, location.href).href : null } catch { return null }
    };
    const media = [...document.querySelectorAll('video, audio')].find((element) => !element.paused && !element.ended)
      || document.querySelector('video, audio');
    const sessionMetadata = navigator.mediaSession?.metadata;
    const icon = [...document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]')]
      .map((element) => absolute(element.href)).find(Boolean);
    const meta = (name) => document.querySelector('meta[property="og:' + name + '"], meta[name="' + name + '"]')?.content || '';
    const artwork = sessionMetadata?.artwork?.[0]?.src || meta('image');
    return {
      title: document.title || '',
      favicon: icon,
      playing: Boolean(media && !media.paused && !media.ended),
      mediaTitle: sessionMetadata?.title || meta('title') || media?.getAttribute('title') || document.title || '',
      artist: sessionMetadata?.artist || meta('site_name') || '',
      album: sessionMetadata?.album || '',
      artwork: absolute(artwork),
      source: location.hostname || '',
      currentTime: Number.isFinite(media?.currentTime) ? media.currentTime : 0,
      duration: Number.isFinite(media?.duration) ? media.duration : 0,
      muted: media?.muted === true || false,
      volume: Number.isFinite(media?.volume) ? media.volume : null,
    };
  } catch {
    return { title: document.title || '', playing: false, source: location.hostname || '', currentTime: 0, duration: 0, muted: false };
  }
})()`

const TOGGLE_MEDIA_SCRIPT = `(() => {
  const media = [...document.querySelectorAll('video, audio')].find((element) => !element.paused && !element.ended)
    || document.querySelector('video, audio');
  if (!media) return false;
  if (media.paused || media.ended) { void media.play().catch(() => undefined); return true; }
  media.pause();
  return true;
})()`

const YOUTUBE_MUSIC_CONTROL_SCRIPTS: Record<string, string> = {
  'toggle-play': `(() => { const root = document.querySelector('ytmusic-player-bar') || document; const button = root.querySelector('#play-pause-button, .play-pause-button, button[aria-label*="Play" i], button[aria-label*="Pause" i], button[aria-label*="Oynat" i], button[aria-label*="Duraklat" i]'); if (button && !button.disabled) { button.click(); return true; } return false; })()`,
  next: `(() => { const root = document.querySelector('ytmusic-player-bar') || document; const button = root.querySelector('.next-button, button[aria-label*="Next" i], button[aria-label*="Sonraki" i]'); if (button && !button.disabled) { button.click(); return true; } return false; })()`,
  previous: `(() => { const root = document.querySelector('ytmusic-player-bar') || document; const button = root.querySelector('.previous-button, button[aria-label*="Previous" i], button[aria-label*="Önceki" i]'); if (button && !button.disabled) { button.click(); return true; } return false; })()`,
  'toggle-mute': `(() => { const root = document.querySelector('ytmusic-player-bar') || document; const button = root.querySelector('.mute-button, #volume-button, button[aria-label*="mute" i], button[aria-label*="ses" i]'); if (button && !button.disabled) { button.click(); return true; } return false; })()`,
}

interface MediaEntry {
  webContents: WebContents
  removeListeners: () => void
  last: BrowserMediaProjection | null
}

export class MediaManager {
  private readonly entries = new Map<string, MediaEntry>()
  private readonly media = new Map<string, BrowserMediaProjection>()
  private readonly emitUpdate: (projection: BrowserMediaProjection) => void

  constructor(emitUpdate: (projection: BrowserMediaProjection) => void) {
    this.emitUpdate = emitUpdate
  }

  register(tabId: string, webContents: WebContents) {
    this.unregister(tabId)
    const probe = () => { void this.probe(tabId, webContents) }
    const onStarted = () => probe()
    const onPaused = () => probe()
    const onAudioChanged = () => probe()
    const onDomReady = () => probe()
    webContents.on('media-started-playing', onStarted)
    webContents.on('media-paused', onPaused)
    webContents.on('audio-state-changed', onAudioChanged)
    webContents.on('dom-ready', onDomReady)
    this.entries.set(tabId, {
      webContents,
      removeListeners: () => {
        webContents.removeListener('media-started-playing', onStarted)
        webContents.removeListener('media-paused', onPaused)
        webContents.removeListener('audio-state-changed', onAudioChanged)
        webContents.removeListener('dom-ready', onDomReady)
      },
      last: null,
    })
    probe()
  }

  unregister(tabId: string) {
    const entry = this.entries.get(tabId)
    if (entry) entry.removeListeners()
    this.entries.delete(tabId)
    this.media.delete(tabId)
  }

  async probe(tabId: string, webContents?: WebContents) {
    const entry = this.entries.get(tabId)
    if (!entry) return null
    const target = webContents || entry?.webContents
    if (!target || target.isDestroyed()) return null
    try {
      const value = await target.executeJavaScript(MEDIA_PROBE_SCRIPT, true) as Partial<ProbeResult>
      // A probe can finish after a tab was closed. Do not let that stale
      // promise recreate media state for an entry that was unregistered.
      if (this.entries.get(tabId) !== entry || target.isDestroyed()) return null
      const prior = entry?.last
      const projection: BrowserMediaProjection = {
        tabId,
        playing: value.playing === true,
        title: cleanText(value.mediaTitle || value.title) || 'Medya',
        artist: cleanText(value.artist),
        album: cleanText(value.album),
        artwork: validAsset(value.artwork),
        source: cleanText(value.source) || safeHostname(target.getURL()),
        favicon: validAsset(value.favicon),
        lastPlayingAt: value.playing === true ? Date.now() : prior?.lastPlayingAt || 0,
        currentTime: finiteNumber(value.currentTime),
        duration: finiteNumber(value.duration),
        muted: value.muted === true || target.isAudioMuted(),
        volume: typeof value.volume === 'number' && Number.isFinite(value.volume) ? Math.min(1, Math.max(0, value.volume)) : null,
      }
      if (entry) entry.last = projection
      this.media.set(tabId, projection)
      this.emitUpdate({ ...projection })
      return projection
    } catch {
      return null
    }
  }

  async syncAll() {
    await Promise.all([...this.entries].map(([tabId, entry]) => this.probe(tabId, entry.webContents)))
  }

  async toggle(tabId: string) {
    const entry = this.require(tabId)
    if (entry.webContents.isDestroyed()) throw new Error('Medya sekmesi artık mevcut değil.')
    await entry.webContents.executeJavaScript(TOGGLE_MEDIA_SCRIPT, true)
    await this.probe(tabId, entry.webContents)
  }

  async control(tabId: string, action: keyof typeof YOUTUBE_MUSIC_CONTROL_SCRIPTS) {
    const entry = this.require(tabId)
    const script = YOUTUBE_MUSIC_CONTROL_SCRIPTS[action]
    if (!script) throw new Error('Geçersiz medya komutu.')
    await entry.webContents.executeJavaScript(script, true)
    await this.probe(tabId, entry.webContents)
  }

  async setVolume(tabId: string, volume: number) {
    const entry = this.require(tabId)
    const normalized = Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : 0
    const script = `(() => { const value = ${normalized / 100}; const media = document.querySelector('video, audio'); if (media) { media.volume = value; media.muted = value <= 0; } return true; })()`
    await entry.webContents.executeJavaScript(script, true)
    await this.probe(tabId, entry.webContents)
  }

  async stop(tabId: string) {
    const entry = this.entries.get(tabId)
    if (!entry || entry.webContents.isDestroyed()) return
    try {
      await entry.webContents.executeJavaScript(`(() => { for (const media of document.querySelectorAll('video, audio')) { media.pause(); media.removeAttribute('src'); media.load(); } })()`, true)
    } catch { /* renderer may already be gone */ }
    try { entry.webContents.setAudioMuted(true) } catch { /* best effort */ }
  }

  current(): BrowserMediaProjection | null {
    return [...this.media.values()]
      .filter((item) => item.playing || item.lastPlayingAt > 0)
      .sort((a, b) => b.lastPlayingAt - a.lastPlayingAt)[0] ?? null
  }

  get(tabId: string) {
    return this.media.get(tabId) ?? null
  }

  snapshot() {
    return [...this.media.values()].map((item) => ({ ...item }))
  }

  async getYouTubeMusicState() {
    const match = [...this.entries].find(([, entry]) => /music\.youtube\.com/i.test(entry.webContents.getURL()))
    if (!match) return null
    const [tabId, entry] = match
    const projection = await this.probe(tabId, entry.webContents)
    if (!projection) return null
    const state: YouTubeMusicState = {
      title: projection.title === 'Medya' ? '' : projection.title,
      artist: projection.artist,
      isPlaying: projection.playing,
      currentTime: projection.currentTime,
      duration: projection.duration,
      volume: projection.muted ? 0 : projection.volume === null || projection.volume === undefined ? null : Math.round(projection.volume * 100),
      muted: projection.muted,
      artworkUrl: projection.artwork,
    }
    return { tabId, state }
  }

  toSystemSession(): SystemMediaSession | null {
    const current = this.current()
    if (!current) return null
    return {
      sourceAppId: `kapanis:${current.source}`,
      title: current.title,
      artist: current.artist,
      albumTitle: current.album,
      playbackStatus: current.playing ? 'playing' : 'paused',
      positionSeconds: current.currentTime,
      durationSeconds: current.duration,
      canPlay: true,
      canPause: true,
      canSkipNext: false,
      canSkipPrevious: false,
    }
  }

  destroyAll() {
    for (const tabId of [...this.entries.keys()]) this.unregister(tabId)
    this.media.clear()
  }

  private require(tabId: string) {
    const entry = this.entries.get(tabId)
    if (!entry) throw new Error('Tarayıcı sekmesi bulunamadı.')
    return entry
  }
}

interface ProbeResult {
  title?: string
  favicon?: string | null
  playing?: boolean
  mediaTitle?: string
  artist?: string
  album?: string
  artwork?: string | null
  source?: string
  currentTime?: number
  duration?: number
  muted?: boolean
  volume?: number | null
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 512) : ''
}

function validAsset(value: unknown) {
  if (typeof value !== 'string' || value.length > 4_000) return null
  return /^(?:https?:|data:image\/|blob:)/i.test(value) ? value : null
}

function safeHostname(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, '') } catch { return '' }
}
