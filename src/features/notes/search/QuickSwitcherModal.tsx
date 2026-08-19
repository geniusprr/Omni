import { useEffect, useMemo, useState } from 'react'
import FilePlus from 'lucide-react/dist/esm/icons/file-plus.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { tabStore } from '../stores/tabStore'
import { useVault, vaultStore } from '../stores/vaultStore'

interface QuickSwitcherModalProps {
  isOpen: boolean
  onClose: () => void
}

export function QuickSwitcherModal({ isOpen, onClose }: QuickSwitcherModalProps) {
  const { entries } = useVault()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const mdFiles = useMemo(() => {
    return entries.filter((e) => !e.isDir && e.path.toLowerCase().endsWith('.md'))
  }, [entries])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      return mdFiles.slice(0, 15)
    }

    return mdFiles
      .filter((file) => {
        const title = file.name.replace(/\.md$/i, '').toLowerCase()
        const path = file.path.toLowerCase()
        return title.includes(q) || path.includes(q)
      })
      .slice(0, 20)
  }, [mdFiles, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [isOpen])

  function handleSelect(path: string) {
    tabStore.openTab(path)
    onClose()
  }

  function handleCreateAndOpen() {
    const trimmed = query.trim()
    if (!trimmed) return
    const newPath = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`
    void (async () => {
      await vaultStore.createNote(newPath)
      tabStore.openTab(newPath)
      onClose()
    })()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % (results.length + (query ? 1 : 0)) : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) =>
        results.length > 0
          ? (prev - 1 + (results.length + (query ? 1 : 0))) % (results.length + (query ? 1 : 0))
          : 0,
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex < results.length) {
        handleSelect(results[selectedIndex].path)
      } else if (query) {
        handleCreateAndOpen()
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="notes-modal-overlay" onClick={onClose}>
      <div className="quick-switcher-card" onClick={(e) => e.stopPropagation()}>
        <div className="quick-switcher-input-wrapper">
          <Search size={16} className="text-sky-400" />
          <input
            autoFocus
            type="text"
            placeholder="Not aç veya oluştur..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="quick-switcher-input"
          />
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="quick-switcher-results">
          {results.map((file, idx) => {
            const isSelected = idx === selectedIndex
            const title = file.name.replace(/\.md$/i, '')
            const relDir = file.path.includes('/')
              ? file.path.substring(0, file.path.lastIndexOf('/'))
              : ''

            return (
              <div
                key={file.path}
                className={`quick-switcher-item ${isSelected ? 'quick-switcher-item--selected' : ''}`}
                onClick={() => handleSelect(file.path)}
              >
                <FileText size={14} className="text-slate-400" />
                <div className="quick-switcher-item-info">
                  <span className="quick-switcher-item-title">{title}</span>
                  {relDir && <span className="quick-switcher-item-path">{relDir}</span>}
                </div>
              </div>
            )
          })}

          {query && !results.some((r) => r.name.toLowerCase() === `${query.toLowerCase()}.md`) && (
            <div
              className={`quick-switcher-item quick-switcher-item--create ${
                selectedIndex === results.length ? 'quick-switcher-item--selected' : ''
              }`}
              onClick={handleCreateAndOpen}
            >
              <FilePlus size={14} className="text-emerald-400" />
              <div className="quick-switcher-item-info">
                <span className="quick-switcher-item-title">
                  Oluştur: <strong>"{query}"</strong>
                </span>
                <span className="quick-switcher-item-path">Yeni not olarak kaydet ve aç</span>
              </div>
            </div>
          )}

          {results.length === 0 && !query && (
            <div className="quick-switcher-empty">Not bulunamadı.</div>
          )}
        </div>
      </div>
    </div>
  )
}
