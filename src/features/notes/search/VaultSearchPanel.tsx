import { useEffect, useState } from 'react'
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.js'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { desktop } from '@/lib/desktop'
import { tabStore } from '../stores/tabStore'
import { useVault } from '../stores/vaultStore'
import type { SearchResultItem } from '../types'

export function VaultSearchPanel() {
  const { vaultPath, entries } = useVault()
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q || !vaultPath) {
      setResults([])
      return
    }

    let active = true
    setIsSearching(true)

    const timer = setTimeout(async () => {
      const searchResults: SearchResultItem[] = []
      const mdFiles = entries.filter((e) => !e.isDir && e.path.toLowerCase().endsWith('.md'))

      for (const file of mdFiles) {
        if (!active) return
        try {
          const content = await desktop.vault.readFile(vaultPath, file.path)
          const lines = content.split(/\r?\n/)
          const fileTitle = file.name.replace(/\.md$/i, '')
          const fileMatches: SearchResultItem['matches'] = []

          // Check title match
          if (fileTitle.toLowerCase().includes(q)) {
            fileMatches.push({
              line: 1,
              content: `Başlık: ${fileTitle}`,
              highlightIndices: [
                8 + fileTitle.toLowerCase().indexOf(q),
                8 + fileTitle.toLowerCase().indexOf(q) + q.length,
              ],
            })
          }

          // Check line matches
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            const lowerLine = line.toLowerCase()
            const matchIdx = lowerLine.indexOf(q)

            if (matchIdx !== -1) {
              fileMatches.push({
                line: i + 1,
                content: line.length > 120 ? line.substring(0, 120) + '...' : line,
                highlightIndices: [matchIdx, matchIdx + q.length],
              })
            }
          }

          if (fileMatches.length > 0) {
            searchResults.push({
              path: file.path,
              title: fileTitle,
              matches: fileMatches,
            })
          }
        } catch {
          // ignore
        }
      }

      if (active) {
        setResults(searchResults)
        setIsSearching(false)
      }
    }, 250)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [entries, searchQuery, vaultPath])

  function toggleFileCollapse(path: string) {
    setCollapsedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function handleJumpToMatch(path: string, line: number) {
    tabStore.openTab(path)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('note:scroll-to-line', { detail: { line } }))
    }, 120)
  }

  return (
    <div className="vault-search-panel">
      {/* Search Header */}
      <div className="search-panel-header">
        <div className="search-panel-input-box">
          <Search size={14} className="search-panel-icon" />
          <input
            type="text"
            placeholder="Tüm notlarda ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-panel-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-panel-clear"
              onClick={() => setSearchQuery('')}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Results area */}
      <div className="search-panel-results">
        {isSearching && <div className="search-panel-status">Aranıyor...</div>}

        {!isSearching && searchQuery && results.length === 0 && (
          <div className="search-panel-empty">Eşleşen not bulunamadı.</div>
        )}

        {!searchQuery && (
          <div className="search-panel-empty">Aramak için kelime veya etiket yazın.</div>
        )}

        {results.map((res) => {
          const isCollapsed = collapsedFiles.has(res.path)

          return (
            <div key={res.path} className="search-result-group">
              <div
                className="search-result-file-header"
                onClick={() => toggleFileCollapse(res.path)}
              >
                {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                <FileText size={13} className="text-slate-400" />
                <span className="search-result-file-title">{res.title}</span>
                <span className="search-result-badge">{res.matches.length}</span>
              </div>

              {!isCollapsed && (
                <div className="search-result-matches">
                  {res.matches.map((m, idx) => (
                    <div
                      key={idx}
                      className="search-result-match-item"
                      onClick={() => handleJumpToMatch(res.path, m.line)}
                      title={`Satır ${m.line}`}
                    >
                      <span className="search-result-line-num">{m.line}:</span>
                      <span className="search-result-snippet">{m.content}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
