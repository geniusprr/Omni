import assert from 'node:assert'
import { getNextQueueIndex, getPreviousQueueIndex, insertNext, removeQueueTrack } from './queue'
import type { MusicTrack } from './types'

const track = (id: string): MusicTrack => ({
  id: `youtube:${id}`,
  provider: 'youtube',
  providerTrackId: id,
  title: id,
  artist: 'Test',
})
const queue = [track('aaaaaaaaaaa'), track('bbbbbbbbbbb'), track('ccccccccccc')]

assert.deepStrictEqual(insertNext(queue, 0, track('ddddddddddd')).map((item) => item.providerTrackId), [
  'aaaaaaaaaaa',
  'ddddddddddd',
  'bbbbbbbbbbb',
  'ccccccccccc',
])
assert.deepStrictEqual(removeQueueTrack(queue, 2, 'youtube:aaaaaaaaaaa'), { queue: [queue[1], queue[2]], queueIndex: 1 })
assert.strictEqual(getNextQueueIndex({ queue, queueIndex: 0, shuffle: false, repeatMode: 'off' }), 1)
assert.strictEqual(getNextQueueIndex({ queue, queueIndex: 2, shuffle: false, repeatMode: 'off' }), null)
assert.strictEqual(getNextQueueIndex({ queue, queueIndex: 2, shuffle: false, repeatMode: 'all' }), 0)
assert.strictEqual(getNextQueueIndex({ queue, queueIndex: 1, shuffle: false, repeatMode: 'one' }), 1)
assert.strictEqual(getNextQueueIndex({ queue, queueIndex: 0, shuffle: true, repeatMode: 'off', random: () => 0 }), 1)
assert.strictEqual(getNextQueueIndex({ queue, queueIndex: 0, shuffle: true, repeatMode: 'off', history: [queue[1]], random: () => 0 }), 2)
assert.strictEqual(getPreviousQueueIndex(queue, 2, []), 1)

console.log('✓ Queue add/remove/next/previous/shuffle/repeat tests passed')
