import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import Clipboard from 'lucide-react/dist/esm/icons/clipboard.js'
import ClipboardPaste from 'lucide-react/dist/esm/icons/clipboard-paste.js'
import Copy from 'lucide-react/dist/esm/icons/copy.js'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js'
import Redo2 from 'lucide-react/dist/esm/icons/redo-2.js'
import Scissors from 'lucide-react/dist/esm/icons/scissors.js'
import Undo2 from 'lucide-react/dist/esm/icons/undo-2.js'

type EditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement

interface InputSelection {
  start: number
  end: number
  direction: 'forward' | 'backward' | 'none'
}

interface ContextMenuState {
  x: number
  y: number
  target: Element | null
  editable: EditableTarget | null
  selectionText: string
  selectionRange: Range | null
  inputSelection: InputSelection | null
}

interface MenuActionProps {
  label: string
  icon: ReactNode
  disabled?: boolean
  onClick: () => void
}

const TEXT_INPUT_TYPES = new Set([
  'email',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'url',
])

function isTextInput(element: Element): element is HTMLInputElement {
  return element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type || 'text')
}

function getEditableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  if (isTextInput(target) || target instanceof HTMLTextAreaElement) return target
  return target.closest<HTMLElement>('[contenteditable="true"]')
}

function readSelection(target: EditableTarget | null) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? 0
    const end = target.selectionEnd ?? start
    return {
      text: target.value.slice(Math.min(start, end), Math.max(start, end)),
      inputSelection: {
        start,
        end,
        direction: target.selectionDirection || 'none',
      } satisfies InputSelection,
      range: null,
    }
  }

  const selection = window.getSelection()
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null
  return {
    text: selection?.toString() || '',
    inputSelection: null,
    range,
  }
}

function runExecCommand(command: string, value?: string) {
  try {
    document.execCommand(command, false, value)
  } catch {
    // Chromium may reject clipboard commands when the target is no longer editable.
  }
}

function MenuAction({ label, icon, disabled = false, onClick }: MenuActionProps) {
  return (
    <button
      type="button"
      className="kapanis-context-menu__item"
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <span className="kapanis-context-menu__icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function MenuSeparator() {
  return <div className="kapanis-context-menu__separator" role="separator" />
}

export function GlobalContextMenu() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.classList.add('kapanis-focus-free')

    const preventTabTraversal = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const target = event.target instanceof Element ? event.target : null
      // CodeMirror uses Tab for indentation. Keep that editor shortcut intact;
      // all regular application controls stay out of the Tab focus loop.
      if (target?.closest('.cm-editor')) return
      event.preventDefault()
    }

    const closeOnPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      setContextMenu(null)
    }
    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null)
    }
    const closeOnViewportChange = () => setContextMenu(null)

    window.addEventListener('keydown', preventTabTraversal, true)
    window.addEventListener('pointerdown', closeOnPointerDown)
    window.addEventListener('keydown', closeOnKeyDown)
    window.addEventListener('resize', closeOnViewportChange)
    window.addEventListener('scroll', closeOnViewportChange, true)

    return () => {
      document.documentElement.classList.remove('kapanis-focus-free')
      window.removeEventListener('keydown', preventTabTraversal, true)
      window.removeEventListener('pointerdown', closeOnPointerDown)
      window.removeEventListener('keydown', closeOnKeyDown)
      window.removeEventListener('resize', closeOnViewportChange)
      window.removeEventListener('scroll', closeOnViewportChange, true)
    }
  }, [])

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      // Existing note/explorer/tab menus intentionally own their own event.
      if (event.defaultPrevented) return

      const target = event.target instanceof HTMLElement ? event.target : null
      const editable = getEditableTarget(event.target)
      const selection = readSelection(editable)

      event.preventDefault()
      setPosition({ x: event.clientX, y: event.clientY })
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        target,
        editable,
        selectionText: selection.text,
        selectionRange: selection.range,
        inputSelection: selection.inputSelection,
      })
    }

    document.addEventListener('contextmenu', handleContextMenu)
    return () => document.removeEventListener('contextmenu', handleContextMenu)
  }, [])

  useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) return

    const rect = menuRef.current.getBoundingClientRect()
    const margin = 8
    const next = {
      x: Math.max(margin, Math.min(contextMenu.x, window.innerWidth - rect.width - margin)),
      y: Math.max(margin, Math.min(contextMenu.y, window.innerHeight - rect.height - margin)),
    }
    setPosition((current) => current.x === next.x && current.y === next.y ? current : next)
  }, [contextMenu])

  if (!contextMenu) return null

  const hasSelection = contextMenu.selectionText.length > 0
  const link = contextMenu.target?.closest<HTMLAnchorElement>('a[href]')
  const hasEditableSelection = Boolean(contextMenu.editable && hasSelection)

  function restoreEditableSelection() {
    const editable = contextMenu?.editable
    if (!editable) return
    editable.focus({ preventScroll: true })

    if (contextMenu.inputSelection && (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement)) {
      editable.setSelectionRange(
        contextMenu.inputSelection.start,
        contextMenu.inputSelection.end,
        contextMenu.inputSelection.direction,
      )
      return
    }

    if (contextMenu.selectionRange) {
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(contextMenu.selectionRange.cloneRange())
    }
  }

  function close() {
    setContextMenu(null)
  }

  function execute(command: string, value?: string) {
    restoreEditableSelection()
    runExecCommand(command, value)
    close()
  }

  function copyText(text: string) {
    if (!text) return
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => undefined)
    } else {
      runExecCommand('copy')
    }
    close()
  }

  function paste() {
    restoreEditableSelection()
    if (navigator.clipboard?.readText) {
      void navigator.clipboard.readText().then((text) => {
        if (text) runExecCommand('insertText', text)
      }).catch(() => runExecCommand('paste'))
    } else {
      runExecCommand('paste')
    }
    close()
  }

  const copyIcon = <Copy size={14} />

  return (
    <div
      ref={menuRef}
      className="kapanis-context-menu"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="Eon menüsü"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {contextMenu.editable && (
        <>
          <MenuAction label="Geri Al" icon={<Undo2 size={14} />} onClick={() => execute('undo')} />
          <MenuAction label="Yinele" icon={<Redo2 size={14} />} onClick={() => execute('redo')} />
          <MenuSeparator />
          <MenuAction
            label="Kes"
            icon={<Scissors size={14} />}
            disabled={!hasEditableSelection}
            onClick={() => execute('cut')}
          />
          <MenuAction
            label="Kopyala"
            icon={copyIcon}
            disabled={!hasEditableSelection}
            onClick={() => execute('copy')}
          />
          <MenuAction label="Yapıştır" icon={<ClipboardPaste size={14} />} onClick={paste} />
          <MenuAction
            label="Tümünü Seç"
            icon={<Clipboard size={14} />}
            disabled={!contextMenu.editable.textContent && !(contextMenu.editable instanceof HTMLInputElement || contextMenu.editable instanceof HTMLTextAreaElement)}
            onClick={() => execute('selectAll')}
          />
        </>
      )}

      {!contextMenu.editable && hasSelection && (
        <MenuAction label="Seçimi Kopyala" icon={copyIcon} onClick={() => copyText(contextMenu.selectionText)} />
      )}

      {link && (
        <>
          {(contextMenu.editable || hasSelection) && <MenuSeparator />}
          <MenuAction label="Bağlantıyı Kopyala" icon={copyIcon} onClick={() => copyText(link.href)} />
        </>
      )}

      {(contextMenu.editable || hasSelection || link) && <MenuSeparator />}
      <MenuAction
        label="Uygulamayı Yenile"
        icon={<RefreshCw size={14} />}
        onClick={() => window.location.reload()}
      />
    </div>
  )
}
