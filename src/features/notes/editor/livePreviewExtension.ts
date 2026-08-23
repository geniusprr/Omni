import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) {
    super()
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.pos === this.pos
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'cm-task-checkbox-wrap'

    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = this.checked
    input.className = 'cm-task-checkbox'

    input.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const newSymbol = this.checked ? ' ' : 'x'
      view.dispatch({
        changes: {
          from: this.pos + 3,
          to: this.pos + 4,
          insert: newSymbol,
        },
      })
    })

    wrap.appendChild(input)
    return wrap
  }

  ignoreEvent() {
    return false
  }
}

class HrWidget extends WidgetType {
  toDOM(): HTMLElement {
    const hr = document.createElement('div')
    hr.className = 'cm-hr-divider'
    return hr
  }
}

class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const bullet = document.createElement('span')
    bullet.className = 'cm-rich-list-bullet'
    bullet.textContent = '•'
    return bullet
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  const activeLineNumber = doc.lineAt(view.state.selection.main.head).number

  const pending: Array<{ from: number; to: number; decoration: Decoration }> = []
  const add = (from: number, to: number, decoration: Decoration) => {
    if (to > from) pending.push({ from, to, decoration })
  }

  const hideInlineMarkers = (lineFrom: number, text: string, pattern: RegExp, markerLength: number) => {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue
      const start = lineFrom + match.index
      const full = match[0]
      add(start, start + markerLength, Decoration.replace({}))
      add(start + full.length - markerLength, start + full.length, Decoration.replace({}))
    }
  }

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const text = line.text

    // 1. Task Checkbox: Match "- [ ] " or "- [x] " or "* [ ] " or "* [x] "
    const taskMatch = text.match(/^(\s*[-*]\s+)\[([ xX])\]\s/)
    if (taskMatch) {
      const prefixLen = taskMatch[1].length
      const checkboxPos = line.from + prefixLen - 1
      const isChecked = taskMatch[2].toLowerCase() === 'x'

      add(
        checkboxPos,
        checkboxPos + 4,
        Decoration.replace({
          widget: new CheckboxWidget(isChecked, checkboxPos),
        }),
      )
    }

    // 2. Horizontal Rule: "---" or "***" on their own line
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(text.trim())) {
      add(
        line.from,
        line.to,
        Decoration.replace({
          widget: new HrWidget(),
        }),
      )
    }

    // Obsidian-style live editing: markdown syntax stays available on the
    // active line, while settled lines read like rich text instead of source.
    if (i !== activeLineNumber && !taskMatch && !/^(\*{3,}|-{3,}|_{3,})$/.test(text.trim())) {
      const heading = text.match(/^(\s{0,3}#{1,6}\s+)/)
      if (heading) add(line.from, line.from + heading[1].length, Decoration.replace({}))

      const quote = text.match(/^(\s*>\s?)/)
      if (quote) add(line.from, line.from + quote[1].length, Decoration.replace({}))

      const bullet = text.match(/^(\s*)[-*+]\s+/)
      if (bullet) {
        const markerFrom = line.from + bullet[1].length
        add(markerFrom, line.from + bullet[0].length, Decoration.replace({ widget: new BulletWidget() }))
      }

      hideInlineMarkers(line.from, text, /\*\*[^*\n]+\*\*/g, 2)
      hideInlineMarkers(line.from, text, /(?<!\*)\*[^*\n]+\*(?!\*)/g, 1)
      hideInlineMarkers(line.from, text, /~~[^~\n]+~~/g, 2)
      hideInlineMarkers(line.from, text, /`[^`\n]+`/g, 1)

      for (const match of text.matchAll(/\[([^\]\n]+)\]\(([^)\n]+)\)/g)) {
        if (match.index === undefined) continue
        const start = line.from + match.index
        const labelLength = match[1].length
        add(start, start + 1, Decoration.replace({}))
        add(start + 1 + labelLength, start + match[0].length, Decoration.replace({}))
      }
    }
  }

  pending.sort((a, b) => a.from - b.from || a.to - b.to)
  for (const range of pending) {
    builder.add(range.from, range.to, range.decoration)
  }

  return builder.finish()
}

export const livePreviewExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)
