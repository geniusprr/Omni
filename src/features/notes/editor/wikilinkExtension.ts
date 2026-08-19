import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  autocompletion,
} from '@codemirror/autocomplete'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { tabStore } from '../stores/tabStore'
import { vaultStore } from '../stores/vaultStore'

// 1. Autocompletion source for `[[`
export function wikilinkCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\[\[([^\]]*)$/)
  if (!word) return null

  const query = word.text.slice(2).trim().toLowerCase()
  const state = vaultStore.getState()
  const entries = state.entries.filter((e) => !e.isDir && e.path.toLowerCase().endsWith('.md'))

  const options: Completion[] = entries
    .map((entry) => {
      const title = entry.name.replace(/\.md$/i, '')
      const relDir = entry.path.includes('/') ? entry.path.substring(0, entry.path.lastIndexOf('/')) : ''
      return {
        label: title,
        detail: relDir ? `(${relDir})` : undefined,
        type: 'text',
        apply: `${title}]]`,
        boost: title.toLowerCase().startsWith(query) ? 99 : 50,
      }
    })
    .filter((opt) => !query || opt.label.toLowerCase().includes(query))

  // If query is not empty and not matching any existing note, offer to create it
  if (query && !options.some((o) => o.label.toLowerCase() === query)) {
    const rawQuery = word.text.slice(2).trim()
    options.push({
      label: rawQuery,
      detail: '(Yeni Not Oluştur)',
      type: 'keyword',
      apply: `${rawQuery}]]`,
      boost: 10,
    })
  }

  return {
    from: word.from + 2,
    options,
    filter: false, // already filtered
  }
}

// 2. Click Handler for wikilinks and tags
export const wikilinkClickHandler = EditorView.domEventHandlers({
  click(event, view) {
    const target = event.target as HTMLElement
    if (!target) return

    // Clicked on a wikilink chip
    if (target.classList.contains('cm-wikilink-link')) {
      event.preventDefault()
      const rawTarget = target.getAttribute('data-target')
      if (rawTarget) {
        handleNavigateToWikilink(rawTarget)
      }
      return true
    }

    // Ctrl+Click anywhere inside a wikilink or tag
    if (event.ctrlKey || event.metaKey) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos !== null) {
        const line = view.state.doc.lineAt(pos)
        const lineText = line.text
        const col = pos - line.from

        const wikilinkRegex = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g
        let match: RegExpExecArray | null
        while ((match = wikilinkRegex.exec(lineText)) !== null) {
          if (col >= match.index && col <= match.index + match[0].length) {
            event.preventDefault()
            const linkTarget = match[1]?.trim()
            if (linkTarget) {
              handleNavigateToWikilink(linkTarget)
            }
            return true
          }
        }
      }
    }
  },
})

function handleNavigateToWikilink(targetTitle: string) {
  const resolved = vaultStore.resolveWikilink(targetTitle)
  if (resolved) {
    tabStore.openTab(resolved)
  } else {
    // Note doesn't exist yet, ask or create it directly!
    const newPath = `${targetTitle}.md`
    void (async () => {
      await vaultStore.createNote(newPath, `# ${targetTitle}\n\n`)
      tabStore.openTab(newPath)
    })()
  }
}

// 3. Match Decorators for Wikilinks and Tags
const wikilinkDecorator = new MatchDecorator({
  regexp: /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g,
  decoration: (match) => {
    const target = match[1]?.trim() || ''
    const alias = match[3]?.trim() || target
    return Decoration.mark({
      class: 'cm-wikilink-chip',
      attributes: {
        'data-target': target,
        title: `Notu Aç: ${target}`,
      },
    })
  },
})

const tagDecorator = new MatchDecorator({
  regexp: /(?:^|\s)(#[a-zA-Z0-9_\u00C0-\u017F\u0180-\u024F\u0400-\u04FF-]+)/g,
  decoration: (match) => {
    return Decoration.mark({
      class: 'cm-tag-chip',
    })
  },
})

export const wikilinkViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = wikilinkDecorator.createDeco(view)
    }

    update(update: ViewUpdate) {
      this.decorations = wikilinkDecorator.updateDeco(update, this.decorations)
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)

export const tagViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = tagDecorator.createDeco(view)
    }

    update(update: ViewUpdate) {
      this.decorations = tagDecorator.updateDeco(update, this.decorations)
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)

export const wikilinkAutocomplete = autocompletion({
  override: [wikilinkCompletionSource],
  defaultKeymap: true,
})
