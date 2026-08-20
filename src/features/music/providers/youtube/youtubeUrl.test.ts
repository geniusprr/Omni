import assert from 'node:assert'
import { extractYoutubeVideoId, youtubeMusicUrl, youtubeWatchUrl } from './youtubeUrl'

assert.strictEqual(extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
assert.strictEqual(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=42'), 'dQw4w9WgXcQ')
assert.strictEqual(extractYoutubeVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123'), 'dQw4w9WgXcQ')
assert.strictEqual(extractYoutubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
assert.strictEqual(extractYoutubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
assert.strictEqual(extractYoutubeVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
assert.strictEqual(extractYoutubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), null)
assert.strictEqual(extractYoutubeVideoId('invalid-id'), null)
assert.strictEqual(youtubeWatchUrl('dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
assert.strictEqual(youtubeMusicUrl('dQw4w9WgXcQ'), 'https://music.youtube.com/watch?v=dQw4w9WgXcQ')

console.log('✓ YouTube URL parsing tests passed')
