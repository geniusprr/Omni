export interface VaultFileEntry {
  path: string // e.g. "Üniversite/Betonarme.md"
  name: string // "Betonarme.md"
  isDir: boolean
  modifiedAt: number
  size: number
}

export interface HeadingItem {
  level: number // 1 to 6
  text: string
  line: number
}

export interface WikilinkItem {
  raw: string
  targetTitle: string
  targetAnchor?: string
  alias?: string
  line: number
  contextSnippet: string
}

export interface BacklinkItem {
  sourcePath: string
  sourceTitle: string
  line: number
  contextSnippet: string
  alias?: string
}

export interface NoteMetadata {
  path: string
  title: string
  frontmatter: Record<string, unknown>
  headings: HeadingItem[]
  tags: string[]
  outgoingLinks: WikilinkItem[]
  modifiedAt: number
  size: number
}

export interface VaultIndex {
  files: Map<string, NoteMetadata>
  titleToPath: Map<string, string> // normalized lowercase title -> relative path
  outgoingLinks: Map<string, WikilinkItem[]> // sourcePath -> links
  backlinks: Map<string, BacklinkItem[]> // targetPath -> backlinks
  tags: Map<string, Set<string>> // tag -> set of note paths
}

export type EditorMode = 'live' | 'source' | 'reading'

export interface NoteTab {
  id: string
  path: string // e.g. "Üniversite/Betonarme.md"
  title: string
  isDirty?: boolean
  viewType?: 'editor' | 'graph'
}

export interface NoteCommand {
  id: string
  label: string
  shortcut?: string
  category?: 'Dosya' | 'Görünüm' | 'Düzenleme' | 'Gezinti' | 'Sistem'
  execute: () => void
}

export interface SearchResultItem {
  path: string
  title: string
  matches: {
    line: number
    content: string
    highlightIndices: [number, number]
  }[]
}

export interface GraphNode {
  id: string // path
  title: string
  degree: number
  x?: number
  y?: number
  vx?: number
  vy?: number
}

export interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
}
