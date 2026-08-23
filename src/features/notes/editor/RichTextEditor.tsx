import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.js'
import ChevronUp from 'lucide-react/dist/esm/icons/chevron-up.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import X from 'lucide-react/dist/esm/icons/x.js'

export type RichTextFormatCommand =
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

export interface RichTextFormatState {
  blockType: 'paragraph' | 'heading1' | 'heading2' | 'heading3'
  bold: boolean
  italic: boolean
  strike: boolean
  inlineCode: boolean
  bulletList: boolean
  orderedList: boolean
  taskList: boolean
  quote: boolean
  codeBlock: boolean
  link: boolean
}

export const EMPTY_RICH_TEXT_FORMAT_STATE: RichTextFormatState = {
  blockType: 'paragraph',
  bold: false,
  italic: false,
  strike: false,
  inlineCode: false,
  bulletList: false,
  orderedList: false,
  taskList: false,
  quote: false,
  codeBlock: false,
  link: false,
}

export interface RichTextEditorHandle {
  format: (command: RichTextFormatCommand) => void
  undo: () => void
  redo: () => void
  search: () => void
  focus: () => void
}

interface RichTextEditorProps {
  markdown: string
  onChange: (markdown: string) => void
  onNavigate: (targetTitle: string) => void
  onFormatStateChange?: (state: RichTextFormatState) => void
}

function splitFrontmatter(markdown: string) {
  const match = markdown.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/)
  if (!match) return { frontmatter: '', body: markdown }
  return { frontmatter: match[1], body: markdown.slice(match[1].length) }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, '&#096;')
}

function inlineMarkdownToHtml(value: string) {
  const codeTokens: string[] = []
  let text = value.replace(/`([^`]+)`/g, (_match, code: string) => {
    const index = codeTokens.push(`<code>${escapeHtml(code)}</code>`) - 1
    return `\u0000CODE${index}\u0000`
  })

  text = escapeHtml(text)
  text = text.replace(
    /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g,
    (_match, target: string, anchor: string | undefined, alias: string | undefined) => {
      const cleanTarget = target.trim()
      const fullTarget = anchor?.trim() ? `${cleanTarget}#${anchor.trim()}` : cleanTarget
      const label = alias?.trim() || cleanTarget
      return `<a href="#" data-wikilink="${escapeAttribute(fullTarget)}" class="wysiwyg-wikilink">${escapeHtml(label)}</a>`
    },
  )
  text = text.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_match, label: string, href: string) => `<a href="${escapeAttribute(href)}" class="wysiwyg-link">${label}</a>`,
  )
  text = text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|\s)(#[a-zA-Z0-9_\u00C0-\u017F\u0180-\u024F\u0400-\u04FF-]+)/g, '$1<span class="wysiwyg-tag">$2</span>')
    .replace(/\n/g, '<br>')

  return text.replace(/\u0000CODE(\d+)\u0000/g, (_match, rawIndex: string) => codeTokens[Number(rawIndex)] || '')
}

function startsMarkdownBlock(line: string) {
  return /^\s*$/.test(line)
    || /^```/.test(line.trim())
    || /^#{1,6}\s+/.test(line)
    || /^\s*>\s?/.test(line)
    || /^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)
    || /^\s*[-*+]\s+/.test(line)
    || /^\s*\d+[.)]\s+/.test(line)
    || /^(?:\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())
}

function markdownBodyToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []

  for (let i = 0; i < lines.length;) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) {
      i += 1
      continue
    }
    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim()
      const code: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      html.push(`<pre data-language="${escapeAttribute(language)}"><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = Math.min(6, heading[1].length)
      html.push(`<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`)
      i += 1
      continue
    }
    if (/^(?:\*{3,}|-{3,}|_{3,})\s*$/.test(trimmed)) {
      html.push('<hr>')
      i += 1
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      html.push(`<blockquote>${inlineMarkdownToHtml(quoteLines.join('\n'))}</blockquote>`)
      continue
    }
    if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length) {
        const task = lines[i].match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/)
        if (!task) break
        const checked = task[1].toLowerCase() === 'x'
        items.push(`<li data-task-item="true" data-checked="${checked ? 'true' : 'false'}"><span class="wysiwyg-task-checkbox" contenteditable="false" role="checkbox" aria-checked="${checked ? 'true' : 'false'}">${checked ? '✓' : ''}</span><span class="wysiwyg-task-copy">${inlineMarkdownToHtml(task[2])}</span></li>`)
        i += 1
      }
      html.push(`<ul data-task-list="true">${items.join('')}</ul>`)
      continue
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length) {
        const bullet = lines[i].match(/^\s*[-*+]\s+(.*)$/)
        if (!bullet || /^\[[ xX]\]\s+/.test(bullet[1])) break
        items.push(`<li>${inlineMarkdownToHtml(bullet[1])}</li>`)
        i += 1
      }
      html.push(`<ul>${items.join('')}</ul>`)
      continue
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length) {
        const ordered = lines[i].match(/^\s*\d+[.)]\s+(.*)$/)
        if (!ordered) break
        items.push(`<li>${inlineMarkdownToHtml(ordered[1])}</li>`)
        i += 1
      }
      html.push(`<ol>${items.join('')}</ol>`)
      continue
    }
    const paragraphLines = [line]
    i += 1
    while (i < lines.length && !startsMarkdownBlock(lines[i])) {
      paragraphLines.push(lines[i])
      i += 1
    }
    html.push(`<p>${inlineMarkdownToHtml(paragraphLines.join('\n'))}</p>`)
  }

  return html.join('') || '<p><br></p>'
}

function inlineNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').replace(/\u00a0/g, ' ')
  if (!(node instanceof HTMLElement)) return ''
  const tag = node.tagName.toLowerCase()
  const inner = Array.from(node.childNodes).map(inlineNodeToMarkdown).join('')
  if (tag === 'br') return '\n'
  if (tag === 'strong' || tag === 'b') return `**${inner}**`
  if (tag === 'em' || tag === 'i') return `*${inner}*`
  if (tag === 's' || tag === 'strike' || tag === 'del') return `~~${inner}~~`
  if (tag === 'code') return `\`${inner.replace(/`/g, '\\`')}\``
  if (tag === 'a') {
    const wikilink = node.dataset.wikilink
    if (wikilink) {
      const baseLabel = wikilink.split('#')[0]
      return inner && inner !== baseLabel ? `[[${wikilink}|${inner}]]` : `[[${wikilink}]]`
    }
    const href = node.getAttribute('href') || ''
    return href ? `[${inner || href}](${href})` : inner
  }
  if (node.classList.contains('wysiwyg-task-checkbox')) return ''
  return inner
}

function listItemToMarkdown(item: Element) {
  const copy = item.querySelector(':scope > .wysiwyg-task-copy')
  if (copy) return Array.from(copy.childNodes).map(inlineNodeToMarkdown).join('').trimEnd()
  return Array.from(item.childNodes)
    .filter((child) => !(child instanceof HTMLElement && child.matches('ul, ol')))
    .map(inlineNodeToMarkdown)
    .join('')
    .trimEnd()
}

function blockNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').trim()
  if (!(node instanceof HTMLElement)) return ''
  const tag = node.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1))
    return `${'#'.repeat(level)} ${Array.from(node.childNodes).map(inlineNodeToMarkdown).join('').trim()}`
  }
  if (tag === 'p' || tag === 'div') return Array.from(node.childNodes).map(inlineNodeToMarkdown).join('').trimEnd()
  if (tag === 'blockquote') {
    return Array.from(node.childNodes).map(inlineNodeToMarkdown).join('').split('\n').map((line) => `> ${line}`.trimEnd()).join('\n')
  }
  if (tag === 'pre') {
    const language = node.dataset.language || ''
    const code = node.querySelector('code')?.textContent ?? node.textContent ?? ''
    return `\`\`\`${language}\n${code.replace(/\n$/, '')}\n\`\`\``
  }
  if (tag === 'hr') return '---'
  if (tag === 'ul') {
    const items = Array.from(node.children).filter((child) => child.tagName.toLowerCase() === 'li')
    if (node.dataset.taskList === 'true') {
      return items.map((item) => `- [${item.getAttribute('data-checked') === 'true' ? 'x' : ' '}] ${listItemToMarkdown(item)}`.trimEnd()).join('\n')
    }
    return items.map((item) => `- ${listItemToMarkdown(item)}`.trimEnd()).join('\n')
  }
  if (tag === 'ol') {
    return Array.from(node.children).filter((child) => child.tagName.toLowerCase() === 'li').map((item, index) => `${index + 1}. ${listItemToMarkdown(item)}`.trimEnd()).join('\n')
  }
  return Array.from(node.childNodes).map(inlineNodeToMarkdown).join('').trimEnd()
}

function editorToMarkdown(editor: HTMLElement) {
  return Array.from(editor.childNodes).map(blockNodeToMarkdown).join('\n\n').replace(/\n{4,}/g, '\n\n\n').trimEnd()
}

function closestElement(node: Node | null, selector: string): HTMLElement | null {
  if (!node) return null
  const element = node instanceof HTMLElement ? node : node.parentElement
  return element?.closest(selector) as HTMLElement | null
}

function createTaskCheckbox(checked = false) {
  const checkbox = document.createElement('span')
  checkbox.className = 'wysiwyg-task-checkbox'
  checkbox.contentEditable = 'false'
  checkbox.setAttribute('role', 'checkbox')
  checkbox.setAttribute('aria-checked', checked ? 'true' : 'false')
  checkbox.textContent = checked ? '✓' : ''
  return checkbox
}

function normalizeTaskList(list: HTMLElement) {
  list.dataset.taskList = 'true'
  for (const child of Array.from(list.children)) {
    if (!(child instanceof HTMLLIElement)) continue
    child.dataset.taskItem = 'true'
    child.dataset.checked ||= 'false'
    if (!child.querySelector(':scope > .wysiwyg-task-checkbox')) child.prepend(createTaskCheckbox(child.dataset.checked === 'true'))
    if (!child.querySelector(':scope > .wysiwyg-task-copy')) {
      const copy = document.createElement('span')
      copy.className = 'wysiwyg-task-copy'
      const movable = Array.from(child.childNodes).filter((node) => !(node instanceof HTMLElement && node.classList.contains('wysiwyg-task-checkbox')))
      for (const node of movable) copy.append(node)
      child.append(copy)
    }
  }
}

function getFormatState(editor: HTMLElement): RichTextFormatState {
  const selection = window.getSelection()
  const anchor = selection?.anchorNode || null
  if (!anchor || !editor.contains(anchor)) return EMPTY_RICH_TEXT_FORMAT_STATE
  const block = closestElement(anchor, 'h1, h2, h3, p, div, blockquote, pre, li')
  const blockTag = block?.tagName.toLowerCase()
  let blockType: RichTextFormatState['blockType'] = 'paragraph'
  if (blockTag === 'h1') blockType = 'heading1'
  if (blockTag === 'h2') blockType = 'heading2'
  if (blockTag === 'h3') blockType = 'heading3'
  const list = closestElement(anchor, 'ul, ol')
  return {
    blockType,
    bold: document.queryCommandState('bold') || Boolean(closestElement(anchor, 'strong, b')),
    italic: document.queryCommandState('italic') || Boolean(closestElement(anchor, 'em, i')),
    strike: document.queryCommandState('strikeThrough') || Boolean(closestElement(anchor, 's, strike, del')),
    inlineCode: Boolean(closestElement(anchor, 'code')) && !Boolean(closestElement(anchor, 'pre')),
    bulletList: list?.tagName.toLowerCase() === 'ul' && list.dataset.taskList !== 'true',
    orderedList: list?.tagName.toLowerCase() === 'ol',
    taskList: list?.dataset.taskList === 'true',
    quote: Boolean(closestElement(anchor, 'blockquote')),
    codeBlock: Boolean(closestElement(anchor, 'pre')),
    link: Boolean(closestElement(anchor, 'a')),
  }
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor({ markdown, onChange, onNavigate, onFormatStateChange }, ref) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const frontmatterRef = useRef('')
  const lastEmittedMarkdownRef = useRef<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchCursor, setSearchCursor] = useState(0)
  const [searchTotal, setSearchTotal] = useState(0)

  useEffect(() => {
    if (markdown === lastEmittedMarkdownRef.current) return
    const editor = editorRef.current
    if (!editor) return
    const split = splitFrontmatter(markdown)
    frontmatterRef.current = split.frontmatter
    editor.innerHTML = markdownBodyToHtml(split.body)
    lastEmittedMarkdownRef.current = null
  }, [markdown])

  useEffect(() => {
    const listener = () => {
      const editor = editorRef.current
      const selection = window.getSelection()
      const anchor = selection?.anchorNode
      if (editor && anchor && editor.contains(anchor)) {
        if (selection && selection.rangeCount > 0) {
          savedRangeRef.current = selection.getRangeAt(0).cloneRange()
        }
        onFormatStateChange?.(getFormatState(editor))
      }
    }
    document.addEventListener('selectionchange', listener)
    return () => document.removeEventListener('selectionchange', listener)
  }, [onFormatStateChange])

  function emitChange() {
    const editor = editorRef.current
    if (!editor) return
    for (const taskList of Array.from(editor.querySelectorAll('ul[data-task-list="true"]'))) {
      normalizeTaskList(taskList as HTMLElement)
    }
    const body = editorToMarkdown(editor)
    const nextMarkdown = `${frontmatterRef.current}${body}${body ? '\n' : ''}`
    lastEmittedMarkdownRef.current = nextMarkdown
    onChange(nextMarkdown)
    onFormatStateChange?.(getFormatState(editor))
  }

  function focusEditor() {
    editorRef.current?.focus()
  }

  function restoreEditorSelection() {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()

    const range = savedRangeRef.current
    if (!range || !editor.contains(range.commonAncestorContainer)) return
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  function wrapSelection() {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!editorRef.current?.contains(range.commonAncestorContainer)) return

    if (selection.isCollapsed) {
      const code = document.createElement('code')
      code.textContent = 'kod'
      range.insertNode(code)
      const nextRange = document.createRange()
      nextRange.selectNodeContents(code)
      selection.removeAllRanges()
      selection.addRange(nextRange)
      savedRangeRef.current = nextRange.cloneRange()
      emitChange()
      return
    }

    const wrapper = document.createElement('code')
    try {
      range.surroundContents(wrapper)
    } catch {
      const fragment = range.extractContents()
      wrapper.append(fragment)
      range.insertNode(wrapper)
    }
    selection.removeAllRanges()
    const nextRange = document.createRange()
    nextRange.selectNodeContents(wrapper)
    selection.addRange(nextRange)
    emitChange()
  }

  function applyFormat(command: RichTextFormatCommand) {
    restoreEditorSelection()
    switch (command) {
      case 'paragraph': document.execCommand('formatBlock', false, 'p'); break
      case 'heading1': document.execCommand('formatBlock', false, 'h1'); break
      case 'heading2': document.execCommand('formatBlock', false, 'h2'); break
      case 'heading3': document.execCommand('formatBlock', false, 'h3'); break
      case 'bold': document.execCommand('bold'); break
      case 'italic': document.execCommand('italic'); break
      case 'strike': document.execCommand('strikeThrough'); break
      case 'inlineCode': wrapSelection(); return
      case 'bulletList': document.execCommand('insertUnorderedList'); break
      case 'orderedList': document.execCommand('insertOrderedList'); break
      case 'taskList': {
        const existingList = closestElement(window.getSelection()?.anchorNode || null, 'ul')
        if (existingList?.dataset.taskList === 'true') {
          delete existingList.dataset.taskList
          for (const child of Array.from(existingList.children)) {
            if (!(child instanceof HTMLLIElement)) continue
            delete child.dataset.taskItem
            delete child.dataset.checked
            child.querySelector(':scope > .wysiwyg-task-checkbox')?.remove()
            const copy = child.querySelector(':scope > .wysiwyg-task-copy')
            if (copy) copy.replaceWith(...Array.from(copy.childNodes))
          }
        } else if (existingList) {
          normalizeTaskList(existingList)
        } else {
          document.execCommand('insertUnorderedList')
          const list = closestElement(window.getSelection()?.anchorNode || null, 'ul')
          if (list) normalizeTaskList(list)
        }
        break
      }
      case 'quote': document.execCommand('formatBlock', false, 'blockquote'); break
      case 'link': {
        const selection = window.getSelection()
        const existingLink = closestElement(selection?.anchorNode || null, 'a')
        const currentHref = existingLink?.dataset.wikilink || existingLink?.getAttribute('href') || 'https://'
        const href = window.prompt('Bağlantı adresi', currentHref)
        if (!href) return
        restoreEditorSelection()
        if (existingLink) {
          existingLink.removeAttribute('data-wikilink')
          existingLink.setAttribute('href', href)
          existingLink.className = 'wysiwyg-link'
        } else if (window.getSelection()?.isCollapsed) {
          const anchor = document.createElement('a')
          anchor.href = href
          anchor.className = 'wysiwyg-link'
          anchor.textContent = href.replace(/^https?:\/\//, '') || 'bağlantı'
          document.execCommand('insertHTML', false, anchor.outerHTML)
        } else {
          document.execCommand('createLink', false, href)
        }
        break
      }
      case 'codeBlock': document.execCommand('formatBlock', false, 'pre'); break
      case 'horizontalRule': document.execCommand('insertHorizontalRule'); break
    }
    emitChange()
  }

  function getSearchMatches(query: string) {
    const editor = editorRef.current
    if (!editor || !query.trim()) return []
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
    const matches: Array<{ node: Text; start: number; end: number }> = []
    const needle = query.toLocaleLowerCase('tr-TR')
    let current = walker.nextNode()
    while (current) {
      const parent = current.parentElement
      if (!parent?.closest('[contenteditable="false"]')) {
        const haystack = (current.textContent || '').toLocaleLowerCase('tr-TR')
        let start = 0
        while (start <= haystack.length - needle.length) {
          const index = haystack.indexOf(needle, start)
          if (index < 0) break
          matches.push({ node: current as Text, start: index, end: index + needle.length })
          start = index + Math.max(needle.length, 1)
        }
      }
      current = walker.nextNode()
    }
    return matches
  }

  function jumpToSearchMatch(direction: 1 | -1, query = searchQuery, cursor = searchCursor) {
    const matches = getSearchMatches(query)
    setSearchTotal(matches.length)
    if (matches.length === 0) {
      setSearchCursor(0)
      return
    }
    const nextIndex = ((cursor + direction - 1 + matches.length) % matches.length) + 1
    const match = matches[nextIndex - 1]
    const range = document.createRange()
    range.setStart(match.node, match.start)
    range.setEnd(match.node, match.end)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    match.node.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setSearchCursor(nextIndex)
  }

  function openSearch() {
    setSearchOpen(true)
    window.setTimeout(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }, 0)
  }

  useImperativeHandle(ref, () => ({
    format: applyFormat,
    undo: () => { focusEditor(); document.execCommand('undo'); emitChange() },
    redo: () => { focusEditor(); document.execCommand('redo'); emitChange() },
    search: openSearch,
    focus: focusEditor,
  }))

  return (
    <div className="wysiwyg-editor-shell">
      {searchOpen && (
        <div className="wysiwyg-search-bar" role="search">
          <Search size={14} aria-hidden="true" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => {
              const nextQuery = event.target.value
              setSearchQuery(nextQuery)
              const matches = getSearchMatches(nextQuery)
              setSearchTotal(matches.length)
              setSearchCursor(0)
              if (matches.length > 0) window.setTimeout(() => jumpToSearchMatch(1, nextQuery, 0), 0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); jumpToSearchMatch(event.shiftKey ? -1 : 1) }
              if (event.key === 'Escape') { event.preventDefault(); setSearchOpen(false); focusEditor() }
            }}
            placeholder="Not içinde ara..."
            aria-label="Not içinde ara"
          />
          <span className="wysiwyg-search-count">{searchTotal > 0 ? `${searchCursor}/${searchTotal}` : '0/0'}</span>
          <button type="button" onClick={() => jumpToSearchMatch(-1)} aria-label="Önceki eşleşme"><ChevronUp size={14} /></button>
          <button type="button" onClick={() => jumpToSearchMatch(1)} aria-label="Sonraki eşleşme"><ChevronDown size={14} /></button>
          <button type="button" onClick={() => { setSearchOpen(false); focusEditor() }} aria-label="Aramayı kapat"><X size={14} /></button>
        </div>
      )}
      <div className="wysiwyg-editor-scroll">
        <div
          ref={editorRef}
          className="wysiwyg-editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="WYSIWYG not düzenleyici"
          spellCheck
          onInput={emitChange}
          onMouseUp={() => { if (editorRef.current) onFormatStateChange?.(getFormatState(editorRef.current)) }}
          onKeyUp={() => { if (editorRef.current) onFormatStateChange?.(getFormatState(editorRef.current)) }}
          onKeyDown={(event) => {
            const mod = event.ctrlKey || event.metaKey
            if (mod && event.key.toLowerCase() === 'b') { event.preventDefault(); applyFormat('bold') }
            else if (mod && event.key.toLowerCase() === 'i') { event.preventDefault(); applyFormat('italic') }
            else if (mod && event.key.toLowerCase() === 'k') { event.preventDefault(); applyFormat('link') }
            else if (mod && event.key.toLowerCase() === 'f') { event.preventDefault(); openSearch() }
            else if (event.key === 'Tab') {
              const listItem = closestElement(window.getSelection()?.anchorNode || null, 'li')
              if (listItem) { event.preventDefault(); document.execCommand(event.shiftKey ? 'outdent' : 'indent'); emitChange() }
            }
          }}
          onPaste={(event) => {
            event.preventDefault()
            document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
          }}
          onClick={(event) => {
            const target = event.target as HTMLElement
            const checkbox = target.closest('.wysiwyg-task-checkbox') as HTMLElement | null
            if (checkbox) {
              event.preventDefault()
              const item = checkbox.closest('[data-task-item="true"]') as HTMLElement | null
              if (!item) return
              const checked = item.dataset.checked !== 'true'
              item.dataset.checked = checked ? 'true' : 'false'
              checkbox.setAttribute('aria-checked', checked ? 'true' : 'false')
              checkbox.textContent = checked ? '✓' : ''
              emitChange()
              return
            }
            const wikilink = target.closest('a[data-wikilink]') as HTMLAnchorElement | null
            if (wikilink && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              const targetTitle = wikilink.dataset.wikilink?.split('#')[0]?.trim()
              if (targetTitle) onNavigate(targetTitle)
            }
          }}
        />
      </div>
    </div>
  )
})
