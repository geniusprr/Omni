import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab, redo as redoCommand, undo as undoCommand } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { desktop } from '@/lib/desktop'
import { tabStore } from '../stores/tabStore'
import { vaultStore } from '../stores/vaultStore'
import type { EditorMode, NoteTab } from '../types'
import { kapanisEditorTheme, kapanisHighlightStyle } from './kapanisTheme'
import { ReadingMode } from './ReadingMode'
import {
  RichTextEditor,
  type RichTextEditorHandle,
  type RichTextFormatState,
} from './RichTextEditor'
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
  onFormatStateChange?: (state: RichTextFormatState) => void
}

export type EditorFormatCommand =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inlineCode'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'quote'
  | 'link'
  | 'codeBlock'
  | 'horizontalRule'

export interface CodeMirrorEditorHandle {
  format: (command: EditorFormatCommand) => void
  undo: () => void
  redo: () => void
  search: () => void
  focus: () => void
}

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, CodeMirrorEditorProps>(function CodeMirrorEditor({
  tab,
  vaultPath,
  mode,
  onSaveStatusChange,
  onStatsChange,
  onFormatStateChange,
}, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const richEditorRef = useRef<RichTextEditorHandle | null>(null)
  const [content, setContent] = useState<string>('')
  const [initialLoading, setInitialLoading] = useState(true)
  const saveTimeoutRef = useRef<number | null>(null)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())
  const lastSavedContentRef = useRef<string>('')
  const pendingContentRef = useRef<string | null>(null)
  const vaultPathRef = useRef(vaultPath)
  const tabPathRef = useRef(tab.path)
  vaultPathRef.current = vaultPath
  tabPathRef.current = tab.path

  useEffect(() => () => {
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current)
    }
    const pending = pendingContentRef.current
    if (!pending || pending === lastSavedContentRef.current) return
    enqueueSave(pending, false)
  }, [])

  useImperativeHandle(ref, () => ({
    format: applyFormatting,
    undo: () => {
      if (mode === 'live') {
        richEditorRef.current?.undo()
        return
      }
      if (viewRef.current) undoCommand(viewRef.current)
    },
    redo: () => {
      if (mode === 'live') {
        richEditorRef.current?.redo()
        return
      }
      if (viewRef.current) redoCommand(viewRef.current)
    },
    search: () => {
      if (mode === 'live') {
        richEditorRef.current?.search()
        return
      }
      if (viewRef.current) openSearchPanel(viewRef.current)
    },
    focus: () => {
      if (mode === 'live') richEditorRef.current?.focus()
      else viewRef.current?.focus()
    },
  }))

  function applyFormatting(command: EditorFormatCommand) {
    if (mode === 'live') {
      richEditorRef.current?.format(command)
      return
    }

    const view = viewRef.current
    if (!view || mode === 'reading') return

    const selection = view.state.selection.main
    const selectedText = view.state.doc.sliceString(selection.from, selection.to)

    const replaceSelection = (before: string, after: string, placeholder: string) => {
      const core = selectedText || placeholder
      const insert = `${before}${core}${after}`
      const coreFrom = selection.from + before.length
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert },
        selection: selectedText
          ? { anchor: selection.from + insert.length }
          : { anchor: coreFrom, head: coreFrom + core.length },
        scrollIntoView: true,
      })
      view.focus()
    }

    const transformSelectedLines = (transform: (line: string, index: number) => string) => {
      const doc = view.state.doc
      const startLine = doc.lineAt(selection.from)
      const effectiveTo = selection.to > selection.from && selection.to === doc.lineAt(selection.to).from
        ? selection.to - 1
        : selection.to
      const endLine = doc.lineAt(Math.max(selection.from, effectiveTo))
      const lines: string[] = []
      for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
        lines.push(doc.line(lineNumber).text)
      }
      const insert = lines.map(transform).join('\n')
      view.dispatch({
        changes: { from: startLine.from, to: endLine.to, insert },
        selection: { anchor: startLine.from, head: startLine.from + insert.length },
        scrollIntoView: true,
      })
      view.focus()
    }

    const stripBlockPrefix = (line: string) => line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, '')

    switch (command) {
      case 'paragraph':
        transformSelectedLines((line) => stripBlockPrefix(line))
        break
      case 'heading1':
        transformSelectedLines((line) => `# ${stripBlockPrefix(line)}`)
        break
      case 'heading2':
        transformSelectedLines((line) => `## ${stripBlockPrefix(line)}`)
        break
      case 'heading3':
        transformSelectedLines((line) => `### ${stripBlockPrefix(line)}`)
        break
      case 'bold':
        replaceSelection('**', '**', 'kalın metin')
        break
      case 'italic':
        replaceSelection('*', '*', 'italik metin')
        break
      case 'strike':
        replaceSelection('~~', '~~', 'üstü çizili metin')
        break
      case 'inlineCode':
        replaceSelection('`', '`', 'kod')
        break
      case 'bulletList':
        transformSelectedLines((line) => `- ${stripBlockPrefix(line)}`)
        break
      case 'orderedList':
        transformSelectedLines((line, index) => `${index + 1}. ${stripBlockPrefix(line)}`)
        break
      case 'taskList':
        transformSelectedLines((line) => `- [ ] ${stripBlockPrefix(line)}`)
        break
      case 'quote':
        transformSelectedLines((line) => `> ${stripBlockPrefix(line)}`)
        break
      case 'link': {
        const label = selectedText || 'bağlantı metni'
        const insert = `[${label}](https://)`
        const urlFrom = selection.from + insert.length - 'https://)'.length
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert },
          selection: { anchor: urlFrom, head: urlFrom + 'https://'.length },
          scrollIntoView: true,
        })
        view.focus()
        break
      }
      case 'codeBlock': {
        const core = selectedText || 'kodunuzu buraya yazın'
        const insert = `\`\`\`\n${core}\n\`\`\``
        const coreFrom = selection.from + 4
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert },
          selection: selectedText
            ? { anchor: selection.from + insert.length }
            : { anchor: coreFrom, head: coreFrom + core.length },
          scrollIntoView: true,
        })
        view.focus()
        break
      }
      case 'horizontalRule': {
        const insert = `${selection.from > 0 ? '\n' : ''}---\n`
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert },
          selection: { anchor: selection.from + insert.length },
          scrollIntoView: true,
        })
        view.focus()
        break
      }
    }
  }

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
        pendingContentRef.current = null
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

  function enqueueSave(newDoc: string, reportStatus = true) {
    saveChainRef.current = saveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        // A newer edit can supersede a queued (but not yet started) write.
        if (pendingContentRef.current !== newDoc) return

        const targetVaultPath = vaultPathRef.current
        const targetTabPath = tabPathRef.current
        await desktop.vault.writeFile(targetVaultPath, targetTabPath, newDoc)
        lastSavedContentRef.current = newDoc
        await vaultStore.handleFileContentChange(targetTabPath, newDoc)

        // Never announce an older write as "saved" while newer content is
        // still waiting. The queued saves are serial, so the newest write wins.
        if (pendingContentRef.current === newDoc) {
          pendingContentRef.current = null
          tabStore.setTabDirty(tab.id, false)
          if (reportStatus) onSaveStatusChange?.('saved')
        }
      })
      .catch(() => {
        // Keep the pending content and dirty state so the next edit retries.
      })
  }

  function handleContentChange(newDoc: string) {
    setContent(newDoc)
    pendingContentRef.current = newDoc
    updateStats(newDoc)
    tabStore.setTabDirty(tab.id, true)
    onSaveStatusChange?.('saving')

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      if (newDoc !== lastSavedContentRef.current) {
        enqueueSave(newDoc)
      } else {
        if (pendingContentRef.current === newDoc) pendingContentRef.current = null
        tabStore.setTabDirty(tab.id, false)
        onSaveStatusChange?.('saved')
      }
    }, 600)
  }

  // 2. Initialize CodeMirror EditorView
  useEffect(() => {
    if (initialLoading || mode === 'reading' || mode === 'live' || !containerRef.current) return

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
        { key: 'Mod-b', run: () => { applyFormatting('bold'); return true } },
        { key: 'Mod-i', run: () => { applyFormatting('italic'); return true } },
        { key: 'Mod-k', run: () => { applyFormatting('link'); return true } },
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
          handleContentChange(newDoc)
        }
      }),
    ]

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

  if (mode === 'live') {
    return (
      <RichTextEditor
        ref={richEditorRef}
        markdown={content}
        onChange={handleContentChange}
        onNavigate={handleNavigateToNote}
        onFormatStateChange={onFormatStateChange}
      />
    )
  }

  return <div className="codemirror-wrapper" ref={containerRef} />
})

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
