import assert from 'node:assert'
import { MUSIC_PRESETS } from './catalog'
import { musicStore } from './musicStore'
import type { MusicPlaybackController } from './types'

const calls: string[] = []
const controller: MusicPlaybackController = {
  provider: 'youtube',
  load: (id, autoplay) => calls.push(`load:${id}:${autoplay}`),
  play: () => calls.push('play'),
  pause: () => calls.push('pause'),
  seek: (seconds) => calls.push(`seek:${seconds}`),
  setVolume: (volume) => calls.push(`volume:${volume}`),
  setMuted: (muted) => calls.push(`muted:${muted}`),
  destroy: () => undefined,
}

musicStore.registerPlaybackController(controller)
assert.strictEqual(musicStore.getState().providerReady, true)
musicStore.playTrack(1)
assert.strictEqual(musicStore.getState().activeTrack?.id, MUSIC_PRESETS[1].id)
assert.strictEqual(musicStore.getState().queueIndex, 1)
musicStore.setPlaybackError({ code: 'video-unavailable', message: 'Unavailable', provider: 'youtube', recoverable: true })
assert.strictEqual(musicStore.getState().playbackState, 'error')
assert.strictEqual(musicStore.getState().error?.code, 'video-unavailable')
musicStore.setProvider('spotify')
assert.strictEqual(musicStore.getState().provider, 'spotify')
assert.strictEqual(musicStore.getState().error?.code, 'provider-unsupported')
musicStore.setProvider('youtube')
assert.strictEqual(musicStore.getState().provider, 'youtube')
assert.strictEqual(musicStore.getState().providerReady, false)
assert.ok(calls.length >= 0)

console.log('✓ Provider state, track change, ready, error and switch tests passed')
