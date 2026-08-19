import { load } from 'js-yaml'
import type { HeadingItem, NoteMetadata, WikilinkItem } from '../types'

export function parseMarkdownFile(
  path: string,
  content: string,
  modifiedAt = Date.now(),
  size = 0,
): NoteMetadata {
  const lines = content.split(/\r?\n/)
  let frontmatter: Record<string, unknown> = {}
  let bodyLines = lines
  let bodyLineOffset = 0

  // 1. Extract YAML frontmatter if present
  if (lines.length > 0 && lines[0].trim() === '---') {
    const endIdx = lines.slice(1).findIndex((l) => l.trim() === '---')
    if (endIdx !== -1) {
      const yamlContent = lines.slice(1, endIdx + 1).join('\n')
      try {
        const parsed = load(yamlContent)
        if (parsed && typeof parsed === 'object') {
          frontmatter = parsed as Record<string, unknown>
        }
      } catch {
        // invalid yaml frontmatter, ignore
      }
      bodyLineOffset = endIdx + 2
      bodyLines = lines.slice(bodyLineOffset)
    }
  }

  // Determine Title: from frontmatter title, or first # H1, or filename
  const fileName = path.split('/').pop()?.replace(/\.md$/i, '') || 'Not'
  let title = typeof frontmatter.title === 'string' ? frontmatter.title : fileName

  const headings: HeadingItem[] = []
  const outgoingLinks: WikilinkItem[] = []
  const tagsSet = new Set<string>()

  // Extract tags from frontmatter
  if (Array.isArray(frontmatter.tags)) {
    for (const t of frontmatter.tags) {
      if (typeof t === 'string') {
        tagsSet.add(t.replace(/^#/, '').toLowerCase().trim())
      }
    }
  } else if (typeof frontmatter.tags === 'string') {
    for (const t of frontmatter.tags.split(',')) {
      const clean = t.replace(/^#/, '').toLowerCase().trim()
      if (clean) tagsSet.add(clean)
    }
  }

  let inCodeBlock = false

  // Regex for wikilinks: [[Target]] or [[Target|Alias]] or [[Target#Anchor]] or [[Target#Anchor|Alias]]
  const wikilinkRegex = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g

  // Regex for inline #tags: starts with # followed by alphanumeric/turkish chars/underscore/hyphen
  // Lookbehind or boundary to prevent matching URLs (http://...#hash) or hex colors
  const tagRegex = /(?:^|\s)(#[a-zA-Z0-9_\u00C0-\u017F\u0180-\u024F\u0400-\u04FF-]+)/g

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i]
    const actualLineNumber = bodyLineOffset + i + 1

    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }

    if (inCodeBlock) continue

    // Check headings (# H1 ... ###### H6)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const text = headingMatch[2].trim()
      headings.push({
        level,
        text,
        line: actualLineNumber,
      })
      if (level === 1 && !frontmatter.title && title === fileName) {
        title = text
      }
    }

    // Check wikilinks
    let linkMatch: RegExpExecArray | null
    wikilinkRegex.lastIndex = 0
    while ((linkMatch = wikilinkRegex.exec(line)) !== null) {
      const raw = linkMatch[0]
      const targetTitle = linkMatch[1]?.trim() || ''
      const targetAnchor = linkMatch[2]?.trim()
      const alias = linkMatch[3]?.trim()

      if (targetTitle) {
        // Get clean snippet around the link
        const contextSnippet = line.length > 180 ? line.slice(0, 180) + '...' : line

        outgoingLinks.push({
          raw,
          targetTitle,
          targetAnchor,
          alias,
          line: actualLineNumber,
          contextSnippet: contextSnippet.trim(),
        })
      }
    }

    // Check inline tags
    let tagMatch: RegExpExecArray | null
    tagRegex.lastIndex = 0
    while ((tagMatch = tagRegex.exec(line)) !== null) {
      const rawTag = tagMatch[1]
      // ensure it's not just # (which is a heading) or numeric only
      const cleanTag = rawTag.substring(1).trim().toLowerCase()
      if (cleanTag && !/^\d+$/.test(cleanTag)) {
        tagsSet.add(cleanTag)
      }
    }
  }

  return {
    path,
    title,
    frontmatter,
    headings,
    tags: Array.from(tagsSet),
    outgoingLinks,
    modifiedAt,
    size,
  }
}

export function normalizeNoteTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\.md$/i, '')
}
