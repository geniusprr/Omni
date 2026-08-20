import type { MusicTrack, RepeatMode } from './types'

export interface NextQueueIndexOptions {
  queue: MusicTrack[]
  queueIndex: number
  shuffle: boolean
  repeatMode: RepeatMode
  history?: MusicTrack[]
  random?: () => number
}

export function getNextQueueIndex({
  queue,
  queueIndex,
  shuffle,
  repeatMode,
  history = [],
  random = Math.random,
}: NextQueueIndexOptions): number | null {
  if (queue.length === 0) return null
  if (repeatMode === 'one') return queueIndex >= 0 ? queueIndex : 0

  if (shuffle) {
    const currentKey = queue[queueIndex]?.id
    const candidates = queue
      .map((track, index) => ({ track, index }))
      .filter(({ track }) => track.id !== currentKey)

    if (candidates.length === 0) return queueIndex >= 0 ? queueIndex : 0

    const recentKeys = new Set(history.slice(-Math.min(history.length, 8)).map((track) => track.id))
    const freshCandidates = candidates.filter(({ track }) => !recentKeys.has(track.id))
    const pool = freshCandidates.length > 0 ? freshCandidates : candidates
    return pool[Math.min(pool.length - 1, Math.floor(Math.max(0, random()) * pool.length))].index
  }

  const nextIndex = queueIndex + 1
  if (nextIndex < queue.length) return nextIndex
  return repeatMode === 'all' ? 0 : null
}

export function getPreviousQueueIndex(
  queue: MusicTrack[],
  queueIndex: number,
  history: MusicTrack[] = [],
): number | null {
  if (queue.length === 0) return null

  const currentKey = queue[queueIndex]?.id
  for (let index = history.length - 2; index >= 0; index -= 1) {
    const previousKey = history[index]?.id
    if (!previousKey || previousKey === currentKey) continue
    const queueMatch = queue.findIndex((track) => track.id === previousKey)
    if (queueMatch >= 0) return queueMatch
  }

  return (queueIndex - 1 + queue.length) % queue.length
}

export interface QueueRemovalResult {
  queue: MusicTrack[]
  queueIndex: number
}

export function removeQueueTrack(
  queue: MusicTrack[],
  queueIndex: number,
  trackId: string,
): QueueRemovalResult {
  const removeIndex = queue.findIndex((track) => track.id === trackId)
  if (removeIndex < 0) return { queue, queueIndex }

  const nextQueue = queue.filter((track) => track.id !== trackId)
  if (nextQueue.length === 0) return { queue: nextQueue, queueIndex: -1 }

  if (removeIndex < queueIndex) return { queue: nextQueue, queueIndex: queueIndex - 1 }
  if (removeIndex > queueIndex) return { queue: nextQueue, queueIndex }

  return {
    queue: nextQueue,
    queueIndex: Math.min(queueIndex, nextQueue.length - 1),
  }
}

export function insertNext(
  queue: MusicTrack[],
  queueIndex: number,
  track: MusicTrack,
): MusicTrack[] {
  if (queue.some((item) => item.id === track.id)) return queue
  const insertAt = queueIndex >= 0 ? queueIndex + 1 : queue.length
  return [...queue.slice(0, insertAt), track, ...queue.slice(insertAt)]
}
