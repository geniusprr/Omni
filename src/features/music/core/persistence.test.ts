import assert from 'node:assert'
import { MUSIC_PRESETS } from './catalog'
import {
  MUSIC_PERSISTENCE_KEY,
  loadMusicPersistence,
  saveMusicPersistence,
  type StorageLike,
} from './persistence'

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) || null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
  setRaw(key: string, value: string): void { this.values.set(key, value) }
}

const storage = new MemoryStorage()
const initial = loadMusicPersistence(storage, MUSIC_PRESETS)
assert.strictEqual(initial.version, 2)
assert.strictEqual(initial.favorites.length, 0)

const next = { ...initial, favorites: [MUSIC_PRESETS[0]], history: [MUSIC_PRESETS[1]], volume: 42 }
saveMusicPersistence(next, storage)
const loaded = loadMusicPersistence(storage, MUSIC_PRESETS)
assert.strictEqual(loaded.favorites[0].id, MUSIC_PRESETS[0].id)
assert.strictEqual(loaded.history[0].id, MUSIC_PRESETS[1].id)
assert.strictEqual(loaded.volume, 42)
assert.ok(storage.getItem(MUSIC_PERSISTENCE_KEY))

const legacyStorage = new MemoryStorage()
legacyStorage.setRaw('minios_yt_custom_track', JSON.stringify({
  id: 'legacy-custom',
  title: 'Legacy track',
  artist: 'Legacy artist',
  youtubeId: 'dQw4w9WgXcQ',
  coverUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
}))
legacyStorage.setRaw('minios_yt_favorites', JSON.stringify([{ id: 'legacy-fav', title: 'Fav', artist: 'Artist', youtubeId: 'aaaaaaaaaaa' }]))
legacyStorage.setRaw('minios_yt_volume', '55')
const migrated = loadMusicPersistence(legacyStorage, MUSIC_PRESETS)
assert.strictEqual(migrated.queue[0].id, 'youtube:dQw4w9WgXcQ')
assert.strictEqual(migrated.favorites[0].id, 'youtube:aaaaaaaaaaa')
assert.strictEqual(migrated.volume, 55)

const malformedStorage = new MemoryStorage()
malformedStorage.setRaw(MUSIC_PERSISTENCE_KEY, '{malformed')
const recovered = loadMusicPersistence(malformedStorage, MUSIC_PRESETS)
assert.strictEqual(recovered.queue.length, MUSIC_PRESETS.length)

const retiredCatalogStorage = new MemoryStorage()
retiredCatalogStorage.setRaw(MUSIC_PERSISTENCE_KEY, JSON.stringify({
  ...initial,
  queue: [
    {
      ...MUSIC_PRESETS[0],
      id: 'youtube:retired-catalog-video',
      providerTrackId: 'retired-catalog-video',
      metadata: { category: 'popular', source: 'shutty-catalog' },
    },
    ...MUSIC_PRESETS,
  ],
  queueIndex: 0,
}))
const retiredRecovered = loadMusicPersistence(retiredCatalogStorage, MUSIC_PRESETS)
assert.strictEqual(retiredRecovered.queue[0].id, MUSIC_PRESETS[0].id)
assert.strictEqual(retiredRecovered.queueIndex, 0)

console.log('✓ Music persistence, migration and malformed storage tests passed')
