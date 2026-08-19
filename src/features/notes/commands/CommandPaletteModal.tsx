import { useEffect, useMemo, useState } from 'react'
import Command from 'lucide-react/dist/esm/icons/command.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import type { NoteCommand } from '../types'

interface CommandPaletteModalProps {
  isOpen: boolean
  onClose: () => void
  commands: NoteCommand[]
}

export function CommandPaletteModal({ isOpen, onClose, commands }: CommandPaletteModalProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands

    return commands.filter((cmd) => {
      return (
        cmd.label.toLowerCase().includes(q) ||
        (cmd.category && cmd.category.toLowerCase().includes(q)) ||
        (cmd.shortcut && cmd.shortcut.toLowerCase().includes(q))
      )
    })
  }, [commands, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [isOpen])

  function handleExecute(cmd: NoteCommand) {
    onClose()
    setTimeout(() => {
      cmd.execute()
    }, 50)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (filteredCommands.length > 0 ? (prev + 1) % filteredCommands.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) =>
        filteredCommands.length > 0
          ? (prev - 1 + filteredCommands.length) % filteredCommands.length
          : 0,
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredCommands[selectedIndex]) {
        handleExecute(filteredCommands[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="notes-modal-overlay" onClick={onClose}>
      <div className="command-palette-card" onClick={(e) => e.stopPropagation()}>
        <div className="command-palette-input-box">
          <Command size={16} className="text-sky-400" />
          <input
            autoFocus
            type="text"
            placeholder="Bir komut yazın veya arayın..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="command-palette-input"
          />
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="command-palette-results">
          {filteredCommands.map((cmd, idx) => {
            const isSelected = idx === selectedIndex

            return (
              <div
                key={cmd.id}
                className={`command-palette-item ${isSelected ? 'command-palette-item--selected' : ''}`}
                onClick={() => handleExecute(cmd)}
              >
                <div className="command-palette-item-left">
                  {cmd.category && <span className="command-category-tag">{cmd.category}</span>}
                  <span className="command-palette-item-label">{cmd.label}</span>
                </div>
                {cmd.shortcut && <kbd className="command-shortcut-kbd">{cmd.shortcut}</kbd>}
              </div>
            )
          })}

          {filteredCommands.length === 0 && (
            <div className="command-palette-empty">Eşleşen komut bulunamadı.</div>
          )}
        </div>
      </div>
    </div>
  )
}
