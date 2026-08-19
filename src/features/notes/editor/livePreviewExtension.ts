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

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const text = line.text

    // 1. Task Checkbox: Match "- [ ] " or "- [x] " or "* [ ] " or "* [x] "
    const taskMatch = text.match(/^(\s*[-*]\s+)\[([ xX])\]\s/)
    if (taskMatch) {
      const prefixLen = taskMatch[1].length
      const checkboxPos = line.from + prefixLen - 1
      const isChecked = taskMatch[2].toLowerCase() === 'x'

      builder.add(
        checkboxPos,
        checkboxPos + 4,
        Decoration.replace({
          widget: new CheckboxWidget(isChecked, checkboxPos),
        }),
      )
    }

    // 2. Horizontal Rule: "---" or "***" on their own line
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(text.trim())) {
      builder.add(
        line.from,
        line.to,
        Decoration.replace({
          widget: new HrWidget(),
        }),
      )
    }
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
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)
