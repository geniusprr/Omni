import { useEffect, useRef, useState } from 'react'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { search, searchKeymap } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { desktop } from '@/lib/desktop'
import { tabStore } from '../stores/tabStore'
import { vaultStore } from '../stores/vaultStore'
import type { EditorMode, NoteTab } from '../types'
import { kapanisEditorTheme, kapanisHighlightStyle } from './kapanisTheme'
import { livePreviewExtension } from './livePreviewExtension'
import { ReadingMode } from './ReadingMode'
import {
  tagViewPlugin,
  wikilinkAutocomplete,
  wikilinkClickHandler,
  wikilinkViewPlugin,
} from './wikilinkExtension'

interface CodeMirrorEditorProps {
  tab: NoteTab
  vaultPath: string
  mode: EditorMode
  onSaveStatusChange?: (status: 'saved' | 'saving') => void
  onStatsChange?: (stats: { wordCount: number; charCount: number }) => void
}

export function CodeMirrorEditor({
  tab,
  vaultPath,
  mode,
  onSaveStatusChange,
  onStatsChange,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [content, setContent] = useState<string>('')
  const [initialLoading, setInitialLoading] = useState(true)
  const saveTimeoutRef = useRef<number | null>(null)
  const lastSavedContentRef = useRef<string>('')

  // 1. Fetch file content when tab changes
  useEffect(() => {
    let active = true
    setInitialLoading(true)

    void desktop.vault
      .readFile(vaultPath, tab.path)
      .then((fileContent) => {
        if (!active) return
        setContent(fileContent)
        lastSavedContentRef.current = fileContent
        setInitialLoading(false)
        updateStats(fileContent)
        onSaveStatusChange?.('saved')
      })
      .catch(() => {
        if (!active) return
        setContent('')
        setInitialLoading(false)
      })

    return () => {
      active = false
    }
  }, [vaultPath, tab.path])

  function updateStats(text: string) {
    const trimmed = text.trim()
    const words = trimmed ? trimmed.split(/\s+/).length : 0
    const chars = text.length
    onStatsChange?.({ wordCount: words, charCount: chars })
  }

  // 2. Initialize CodeMirror EditorView
  useEffect(() => {
    if (initialLoading || mode === 'reading' || !containerRef.current) return

    // Build extension stack
    const extensions = [
      kapanisEditorTheme,
      kapanisHighlightStyle,
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      history(),
      bracketMatching(),
      closeBrackets(),
      search(),
      EditorView.lineWrapping,
      markdown({ base: markdownLanguage }),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...closeBracketsKeymap,
        ...searchKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      wikilinkAutocomplete,
      wikilinkViewPlugin,
      tagViewPlugin,
      wikilinkClickHandler,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newDoc = update.state.doc.toString()
          setContent(newDoc)
          updateStats(newDoc)
          tabStore.setTabDirty(tab.id, true)
          onSaveStatusChange?.('saving')

          // Debounced auto-save (600ms)
          if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current)
          }

          saveTimeoutRef.current = window.setTimeout(() => {
            if (newDoc !== lastSavedContentRef.current) {
              void (async () => {
                try {
                  await desktop.vault.writeFile(vaultPath, tab.path, newDoc)
                  lastSavedContentRef.current = newDoc
                  tabStore.setTabDirty(tab.id, false)
                  await vaultStore.handleFileContentChange(tab.path, newDoc)
                  onSaveStatusChange?.('saved')
                } catch {
                  // ignore save error
                }
              })()
            } else {
              tabStore.setTabDirty(tab.id, false)
              onSaveStatusChange?.('saved')
            }
          }, 600)
        }
      }),
    ]

    if (mode === 'live') {
      extensions.push(livePreviewExtension)
    }

    if (mode === 'source') {
      extensions.push(lineNumbers())
    }

    const state = EditorState.create({
      doc: content,
      extensions,
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [initialLoading, mode, tab.id, tab.path, vaultPath])

  // Outline / Search Jump listener
  useEffect(() => {
    const handleScrollToLine = (e: CustomEvent<{ line: number }>) => {
      const lineNum = e.detail?.line
      if (viewRef.current && lineNum > 0) {
        try {
          const doc = viewRef.current.state.doc
          const targetLine = doc.line(Math.min(lineNum, doc.lines))
          viewRef.current.dispatch({
            selection: { anchor: targetLine.from },
            scrollIntoView: true,
          })
          viewRef.current.focus()
        } catch {
          // ignore
        }
      }
    }

    window.addEventListener('note:scroll-to-line' as any, handleScrollToLine as any)
    return () => {
      window.removeEventListener('note:scroll-to-line' as any, handleScrollToLine as any)
    }
  }, [])

  if (initialLoading) {
    return (
      <div className="editor-loading-state">
        <div className="editor-loading-spinner" />
        <span>Not yükleniyor...</span>
      </div>
    )
  }

  if (mode === 'reading') {
    return <ReadingMode content={content} onNavigate={(target) => handleNavigateToNote(target)} />
  }

  return <div className="codemirror-wrapper" ref={containerRef} />
}

function handleNavigateToNote(targetTitle: string) {
  const resolved = vaultStore.resolveWikilink(targetTitle)
  if (resolved) {
    tabStore.openTab(resolved)
  } else {
    const newPath = `${targetTitle}.md`
    void (async () => {
      await vaultStore.createNote(newPath, `# ${targetTitle}\n\n`)
      tabStore.openTab(newPath)
    })()
  }
}
