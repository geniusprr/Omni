import assert from 'node:assert'
import { parseMarkdownFile, normalizeNoteTitle } from './markdownParser'

console.log('Testing Markdown Parser and Wikilinks Engine...')

// 1. Test Frontmatter & Headings & Wikilinks & Tags
const sampleDoc = `---
tags:
  - statik
  - insaat
created: 2026-08-19
status: active
title: Betonarme Tasarımı
---

# Betonarme Tasarımı

Betonarme yapıların analizinde [[Statik]] prensipleri ve [[Yapı Statiği#Mukavemet|Mukavemet Kuralları]] esastır.

## Hesaplamalar
- [x] Temel yük analizi
- [ ] Kesit kontrolü

#muhendislik ve #hesap etiketleri.
`

const meta = parseMarkdownFile('Muhendislik/Betonarme.md', sampleDoc, 1000, sampleDoc.length)

// Assertions
assert.strictEqual(meta.title, 'Betonarme Tasarımı')
assert.strictEqual(meta.headings.length, 2)
assert.strictEqual(meta.headings[0].level, 1)
assert.strictEqual(meta.headings[0].text, 'Betonarme Tasarımı')
assert.strictEqual(meta.headings[1].level, 2)
assert.strictEqual(meta.headings[1].text, 'Hesaplamalar')

// Wikilinks
assert.strictEqual(meta.outgoingLinks.length, 2)
assert.strictEqual(meta.outgoingLinks[0].targetTitle, 'Statik')
assert.strictEqual(meta.outgoingLinks[1].targetTitle, 'Yapı Statiği')
assert.strictEqual(meta.outgoingLinks[1].targetAnchor, 'Mukavemet')
assert.strictEqual(meta.outgoingLinks[1].alias, 'Mukavemet Kuralları')

// Tags (frontmatter + inline)
assert.ok(meta.tags.includes('statik'))
assert.ok(meta.tags.includes('insaat'))
assert.ok(meta.tags.includes('muhendislik'))
assert.ok(meta.tags.includes('hesap'))

// Normalize title
assert.strictEqual(normalizeNoteTitle('Betonarme.md'), 'betonarme')
assert.strictEqual(normalizeNoteTitle('  Yapı Statiği  '), 'yapı statiği')

console.log('✓ All Markdown parser & Wikilink tests passed successfully!')
