import assert from 'node:assert'
import { parseMarkdownFile, normalizeNoteTitle } from './markdownParser'
import type { BacklinkItem, WikilinkItem } from '../types'

console.log('Testing Bidirectional Linking and Search Indexing...')

// Note A: Statik.md links to [[Betonarme]] and [[Yapı Statiği]]
const noteAContent = `# Statik\n\nStatik analizinde [[Betonarme]] hesabı ve [[Yapı Statiği]] kullanılır.`
const metaA = parseMarkdownFile('Muhendislik/Statik.md', noteAContent)

// Note B: Betonarme.md links to [[Yapı Statiği]]
const noteBContent = `# Betonarme\n\nBetonarme elemanların tasarımı [[Yapı Statiği]] verileriyle yapılır.`
const metaB = parseMarkdownFile('Muhendislik/Betonarme.md', noteBContent)

// Note C: YapiStatigi.md
const noteCContent = `# Yapı Statiği\n\nYapı statiği temel ilkeleri.`
const metaC = parseMarkdownFile('Muhendislik/Yapı Statiği.md', noteCContent)

const files = new Map([
  [metaA.path, metaA],
  [metaB.path, metaB],
  [metaC.path, metaC],
])

const titleToPath = new Map<string, string>()
for (const [path, meta] of files.entries()) {
  titleToPath.set(normalizeNoteTitle(meta.title), path)
  titleToPath.set(normalizeNoteTitle(path.split('/').pop() || ''), path)
}

// Compute backlinks
const backlinks = new Map<string, BacklinkItem[]>()
for (const [sourcePath, meta] of files.entries()) {
  for (const link of meta.outgoingLinks) {
    const targetNorm = normalizeNoteTitle(link.targetTitle)
    const resolvedPath = titleToPath.get(targetNorm)
    if (resolvedPath) {
      if (!backlinks.has(resolvedPath)) backlinks.set(resolvedPath, [])
      backlinks.get(resolvedPath)?.push({
        sourcePath,
        sourceTitle: meta.title,
        line: link.line,
        contextSnippet: link.contextSnippet,
        alias: link.alias,
      })
    }
  }
}

// Assertions on Backlinks
// 1. Betonarme should have 1 backlink from Statik
const betonarmeBacklinks = backlinks.get('Muhendislik/Betonarme.md') || []
assert.strictEqual(betonarmeBacklinks.length, 1)
assert.strictEqual(betonarmeBacklinks[0].sourceTitle, 'Statik')
assert.ok(betonarmeBacklinks[0].contextSnippet.includes('[[Betonarme]]'))

// 2. Yapı Statiği should have 2 backlinks (from Statik and Betonarme)
const yapiStatiğiBacklinks = backlinks.get('Muhendislik/Yapı Statiği.md') || []
assert.strictEqual(yapiStatiğiBacklinks.length, 2)
assert.strictEqual(yapiStatiğiBacklinks[0].sourceTitle, 'Statik')
assert.strictEqual(yapiStatiğiBacklinks[1].sourceTitle, 'Betonarme')

console.log('✓ All Bidirectional Linking tests passed successfully!')
