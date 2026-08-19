import { useEffect, useState } from 'react'
import { desktop } from '@/lib/desktop'
import { normalizeNoteTitle, parseMarkdownFile } from '../lib/markdownParser'
import type {
  BacklinkItem,
  NoteMetadata,
  VaultFileEntry,
  VaultIndex,
  WikilinkItem,
} from '../types'

interface VaultStoreState {
  vaultPath: string | null
  entries: VaultFileEntry[]
  index: VaultIndex
  loading: boolean
  error: string | null
}

const initialIndex: VaultIndex = {
  files: new Map(),
  titleToPath: new Map(),
  outgoingLinks: new Map(),
  backlinks: new Map(),
  tags: new Map(),
}

let state: VaultStoreState = {
  vaultPath: null,
  entries: [],
  index: initialIndex,
  loading: false,
  error: null,
}

const listeners = new Set<() => void>()

function notifyListeners() {
  for (const listener of listeners) {
    listener()
  }
}

function updateState(partial: Partial<VaultStoreState>) {
  state = { ...state, ...partial }
  notifyListeners()
}

export const vaultStore = {
  getState: () => state,

  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  async init(preferredPath?: string) {
    if (state.loading) return
    updateState({ loading: true, error: null })

    try {
      let targetPath = preferredPath
      if (!targetPath) {
        targetPath = localStorage.getItem('kapanis_vault_path') || undefined
      }
      if (!targetPath) {
        targetPath = await desktop.vault.getDefaultPath()
      }

      localStorage.setItem('kapanis_vault_path', targetPath)
      await desktop.vault.startWatcher(targetPath)

      const entries = await desktop.vault.listEntries(targetPath)
      const index = await this.buildFullIndex(targetPath, entries)

      updateState({
        vaultPath: targetPath,
        entries,
        index,
        loading: false,
        error: null,
      })
    } catch (err) {
      updateState({
        loading: false,
        error: err instanceof Error ? err.message : 'Vault açılamadı.',
      })
    }
  },

  async buildFullIndex(vaultPath: string, entries: VaultFileEntry[]): Promise<VaultIndex> {
    const files = new Map<string, NoteMetadata>()
    const titleToPath = new Map<string, string>()
    const outgoingLinks = new Map<string, WikilinkItem[]>()
    const tags = new Map<string, Set<string>>()

    const mdFiles = entries.filter((e) => !e.isDir && e.path.toLowerCase().endsWith('.md'))

    for (const file of mdFiles) {
      try {
        const content = await desktop.vault.readFile(vaultPath, file.path)
        const metadata = parseMarkdownFile(file.path, content, file.modifiedAt, file.size)
        files.set(file.path, metadata)

        // Title index mapping
        const normTitle = normalizeNoteTitle(metadata.title)
        titleToPath.set(normTitle, file.path)
        // Also map filename without path
        const fileBaseName = normalizeNoteTitle(file.name)
        if (!titleToPath.has(fileBaseName)) {
          titleToPath.set(fileBaseName, file.path)
        }

        outgoingLinks.set(file.path, metadata.outgoingLinks)

        for (const tag of metadata.tags) {
          if (!tags.has(tag)) tags.set(tag, new Set())
          tags.get(tag)?.add(file.path)
        }
      } catch {
        // ignore unreadable file
      }
    }

    // Compute Backlinks
    const backlinks = new Map<string, BacklinkItem[]>()
    for (const [sourcePath, links] of outgoingLinks.entries()) {
      const sourceMeta = files.get(sourcePath)
      const sourceTitle = sourceMeta?.title || sourcePath.split('/').pop()?.replace(/\.md$/i, '') || sourcePath

      for (const link of links) {
        const targetNorm = normalizeNoteTitle(link.targetTitle)
        const resolvedPath = titleToPath.get(targetNorm)
        if (resolvedPath) {
          if (!backlinks.has(resolvedPath)) backlinks.set(resolvedPath, [])
          backlinks.get(resolvedPath)?.push({
            sourcePath,
            sourceTitle,
            line: link.line,
            contextSnippet: link.contextSnippet,
            alias: link.alias,
          })
        }
      }
    }

    return {
      files,
      titleToPath,
      outgoingLinks,
      backlinks,
      tags,
    }
  },

  async reload() {
    if (!state.vaultPath) return
    try {
      const entries = await desktop.vault.listEntries(state.vaultPath)
      const index = await this.buildFullIndex(state.vaultPath, entries)
      updateState({ entries, index })
    } catch {
      // ignore
    }
  },

  async handleFileContentChange(relPath: string, newContent: string) {
    if (!state.vaultPath) return
    const metadata = parseMarkdownFile(relPath, newContent, Date.now(), newContent.length)

    const nextFiles = new Map(state.index.files)
    nextFiles.set(relPath, metadata)

    const nextTitleToPath = new Map(state.index.titleToPath)
    nextTitleToPath.set(normalizeNoteTitle(metadata.title), relPath)
    const baseName = normalizeNoteTitle(relPath.split('/').pop() || '')
    nextTitleToPath.set(baseName, relPath)

    const nextOutgoing = new Map(state.index.outgoingLinks)
    nextOutgoing.set(relPath, metadata.outgoingLinks)

    const nextTags = new Map<string, Set<string>>()
    for (const [, meta] of nextFiles.entries()) {
      for (const tag of meta.tags) {
        if (!nextTags.has(tag)) nextTags.set(tag, new Set())
        nextTags.get(tag)?.add(meta.path)
      }
    }

    // Recompute Backlinks
    const nextBacklinks = new Map<string, BacklinkItem[]>()
    for (const [sourcePath, links] of nextOutgoing.entries()) {
      const sourceMeta = nextFiles.get(sourcePath)
      const sourceTitle = sourceMeta?.title || sourcePath.split('/').pop()?.replace(/\.md$/i, '') || sourcePath

      for (const link of links) {
        const targetNorm = normalizeNoteTitle(link.targetTitle)
        const resolvedPath = nextTitleToPath.get(targetNorm)
        if (resolvedPath) {
          if (!nextBacklinks.has(resolvedPath)) nextBacklinks.set(resolvedPath, [])
          nextBacklinks.get(resolvedPath)?.push({
            sourcePath,
            sourceTitle,
            line: link.line,
            contextSnippet: link.contextSnippet,
            alias: link.alias,
          })
        }
      }
    }

    updateState({
      index: {
        files: nextFiles,
        titleToPath: nextTitleToPath,
        outgoingLinks: nextOutgoing,
        backlinks: nextBacklinks,
        tags: nextTags,
      },
    })
  },

  resolveWikilink(targetTitle: string): string | null {
    const norm = normalizeNoteTitle(targetTitle)
    return state.index.titleToPath.get(norm) || null
  },

  async selectNewVault() {
    const selected = await desktop.vault.selectFolder()
    if (selected) {
      await this.init(selected)
    }
  },

  async createNote(relPath: string, initialContent?: string) {
    if (!state.vaultPath) return
    await desktop.vault.createFile(state.vaultPath, relPath, initialContent)
    await this.reload()
  },

  async createFolder(relPath: string) {
    if (!state.vaultPath) return
    await desktop.vault.createFolder(state.vaultPath, relPath)
    await this.reload()
  },

  async renameEntry(oldRelPath: string, newRelPath: string) {
    if (!state.vaultPath) return
    await desktop.vault.renameEntry(state.vaultPath, oldRelPath, newRelPath)
    await this.reload()
  },

  async deleteEntry(relPath: string) {
    if (!state.vaultPath) return
    await desktop.vault.deleteEntry(state.vaultPath, relPath)
    await this.reload()
  },

  async revealInExplorer(relPath?: string) {
    if (!state.vaultPath) return
    await desktop.vault.revealInExplorer(state.vaultPath, relPath)
  },
}

export function useVault() {
  const [store, setStore] = useState(vaultStore.getState())

  useEffect(() => {
    const unsubscribe = vaultStore.subscribe(() => {
      setStore(vaultStore.getState())
    })
    return unsubscribe
  }, [])

  return store
}
