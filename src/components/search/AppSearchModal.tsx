import { useEffect, useMemo, useRef, useState } from 'react'
import AlarmClock from 'lucide-react/dist/esm/icons/alarm-clock.js'
import Bot from 'lucide-react/dist/esm/icons/bot.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import Globe2 from 'lucide-react/dist/esm/icons/globe-2.js'
import Home from 'lucide-react/dist/esm/icons/home.js'
import MonitorSmartphone from 'lucide-react/dist/esm/icons/monitor-smartphone.js'
import Power from 'lucide-react/dist/esm/icons/power.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Settings from 'lucide-react/dist/esm/icons/settings.js'
import Share2 from 'lucide-react/dist/esm/icons/share-2.js'
import StickyNote from 'lucide-react/dist/esm/icons/sticky-note.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import type { MiniOsMode } from '@/components/layout/MiniOsDock'
import { tabStore } from '@/features/notes/stores/tabStore'
import { useVault } from '@/features/notes/stores/vaultStore'

interface AppSearchModalProps {
  isOpen: boolean
  onClose: () => void
  onNavigate: (mode: MiniOsMode) => void
  onExecuteCommand: (query: string) => void
}

const APP_SEARCH_ITEMS = [
  { mode: 'home' as const, label: 'Ana Sayfa', description: 'Widgetlar ve genel görünüm', keywords: 'anasayfa ana sayfa home dashboard widget başlangıç', icon: Home },
  { mode: 'browser' as const, label: 'Tarayıcı', description: 'Web, sekmeler ve geçmiş', keywords: 'tarayıcı browser web internet sekme site adres', icon: Globe2 },
  { mode: 'ai' as const, label: 'AI · LibreChat', description: 'Yapay zekâ çalışma alanı', keywords: 'ai yapay zeka librechat chat sohbet asistan', icon: Bot },
  { mode: 'power' as const, label: 'Güç & Zamanlayıcı', description: 'Kapatma ve güç planları', keywords: 'güç power kapat shutdown yeniden başlat zamanlayıcı timer /kapat', icon: Power },
  { mode: 'alarms' as const, label: 'Alarmlar', description: 'Alarm oluştur ve yönet', keywords: 'alarm saat hatırlatıcı zaman /alarm', icon: AlarmClock },
  { mode: 'notes' as const, label: 'Notlar', description: 'Not defteri ve dosyalar', keywords: 'not notes defter vault markdown dosya yazı /not', icon: StickyNote },
  { mode: 'localsend' as const, label: 'Dosya Paylaşımı', description: 'LocalSend ile cihazlara gönder', keywords: 'localsend dosya paylaş paylaşım gönder transfer /paylas', icon: Share2 },
  { mode: 'remote' as const, label: 'Uzak Bağlantı', description: 'Telefon ve uzaktan kontrol', keywords: 'remote uzak bağlantı telefon cihaz kontrol eşleştirme', icon: MonitorSmartphone },
  { mode: 'settings' as const, label: 'Ayarlar', description: 'Tema, bağlantılar ve uygulama ayarları', keywords: 'ayar ayarlar settings tema görünüm bağlantı tercih', icon: Settings },
]

function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9/.:\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function searchScore(value: string, query: string) {
  const text = normalizeSearch(value)
  const q = normalizeSearch(query)
  if (!q) return 1
  if (text === q) return 100
  if (text.startsWith(q)) return 80
  if (text.split(' ').some((part) => part.startsWith(q))) return 60
  if (text.includes(q)) return 40

  const terms = q.split(' ').filter(Boolean)
  return terms.length > 1 && terms.every((term) => text.includes(term)) ? 25 : 0
}

type AppResult = {
  kind: 'app'
  key: string
  mode: MiniOsMode
  label: string
  description: string
  icon: typeof Home
  score: number
}

type NoteResult = {
  kind: 'note'
  key: string
  path: string
  label: string
  description: string
  icon: typeof FileText
  score: number
}

type WebResult = {
  kind: 'web'
  key: string
  label: string
  description: string
  icon: typeof Globe2
  query: string
  score: number
}

type SearchResult = AppResult | NoteResult | WebResult

export function AppSearchModal({
  isOpen,
  onClose,
  onNavigate,
  onExecuteCommand,
}: AppSearchModalProps) {
  const { entries } = useVault()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const resultsRef = useRef<HTMLDivElement>(null)

  const mdFiles = useMemo(() => {
    return entries.filter((entry) => !entry.isDir && entry.path.toLowerCase().endsWith('.md'))
  }, [entries])

  const appResults = useMemo<AppResult[]>(() => {
    return APP_SEARCH_ITEMS
      .map((item) => ({
        kind: 'app' as const,
        key: `app:${item.mode}`,
        mode: item.mode,
        label: item.label,
        description: item.description,
        icon: item.icon,
        score: query.trim() ? searchScore(`${item.label} ${item.description} ${item.keywords}`, query) : 1,
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
  }, [query])

  const noteResults = useMemo<NoteResult[]>(() => {
    const trimmed = query.trim()
    if (!trimmed) return []

    return mdFiles
      .map((file) => {
        const label = file.name.replace(/\.md$/i, '')
        return {
          kind: 'note' as const,
          key: `note:${file.path}`,
          path: file.path,
          label,
          description: file.path,
          icon: FileText,
          score: searchScore(`${label} ${file.path}`, trimmed),
        }
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'tr'))
      .slice(0, 8)
  }, [mdFiles, query])

  const webResult = useMemo<WebResult | null>(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) return null
    return {
      kind: 'web',
      key: 'web:query',
      label: `Tarayıcıda ara: “${trimmed}”`,
      description: 'İstersen web aramasına geç',
      icon: Globe2,
      query: trimmed,
      score: 0,
    }
  }, [query])

  const allResults = useMemo<SearchResult[]>(() => {
    return [...appResults, ...noteResults, ...(webResult ? [webResult] : [])]
  }, [appResults, noteResults, webResult])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setSelectedIndex(0)
  }, [isOpen])

  useEffect(() => {
    if (selectedIndex >= allResults.length) setSelectedIndex(Math.max(0, allResults.length - 1))
    const selected = resultsRef.current?.querySelector<HTMLElement>('[data-selected="true"]')
    selected?.scrollIntoView({ block: 'nearest' })
  }, [allResults.length, selectedIndex])

  function handleSelect(result: SearchResult) {
    if (result.kind === 'app') {
      onNavigate(result.mode)
    } else if (result.kind === 'note') {
      onNavigate('notes')
      tabStore.openTab(result.path)
    } else {
      onExecuteCommand(result.query)
    }
    onClose()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((current) => allResults.length ? (current + 1) % allResults.length : 0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((current) => allResults.length ? (current - 1 + allResults.length) % allResults.length : 0)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const selected = allResults[selectedIndex]
      if (selected) handleSelect(selected)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  if (!isOpen) return null

  let runningIndex = 0

  const renderResult = (result: SearchResult) => {
    const index = runningIndex++
    const Icon = result.icon
    const selected = index === selectedIndex

    return (
      <button
        type="button"
        key={result.key}
        className={`quick-switcher-item quick-switcher-item--${result.kind} ${selected ? 'quick-switcher-item--selected' : ''}`}
        data-selected={selected ? 'true' : 'false'}
        onMouseEnter={() => setSelectedIndex(index)}
        onClick={() => handleSelect(result)}
      >
        <span className="quick-switcher-item-icon"><Icon size={16} strokeWidth={1.9} /></span>
        <span className="quick-switcher-item-info">
          <span className="quick-switcher-item-title">{result.label}</span>
          <span className="quick-switcher-item-path">{result.description}</span>
        </span>
        <span className="quick-switcher-enter-hint" aria-hidden="true">↵</span>
      </button>
    )
  }

  return (
    <div className="notes-modal-overlay quick-switcher-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="quick-switcher-card"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Program içi arama"
      >
        <div className="quick-switcher-input-wrapper">
          <Search size={18} className="quick-switcher-search-icon" aria-hidden="true" />
          <input
            autoFocus
            type="text"
            placeholder="Uygulama, ayar, komut veya not ara..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            className="quick-switcher-input"
            aria-label="Program içinde ara"
            aria-controls="app-search-results"
          />
          <kbd className="quick-switcher-esc">ESC</kbd>
          <button type="button" className="modal-close-btn quick-switcher-close" onClick={onClose} aria-label="Aramayı kapat">
            <X size={14} />
          </button>
        </div>

        <div className="quick-switcher-results" id="app-search-results" ref={resultsRef}>
          {appResults.length > 0 && (
            <section className="quick-switcher-group" aria-label="Uygulamalar ve araçlar">
              <div className="quick-switcher-group-label">Uygulamalar ve araçlar</div>
              {appResults.map(renderResult)}
            </section>
          )}

          {noteResults.length > 0 && (
            <section className="quick-switcher-group" aria-label="Notlar">
              <div className="quick-switcher-group-label">Notlar</div>
              {noteResults.map(renderResult)}
            </section>
          )}

          {webResult && (
            <section className="quick-switcher-group quick-switcher-group--web" aria-label="Web">
              <div className="quick-switcher-group-label">Web</div>
              {renderResult(webResult)}
            </section>
          )}

          {allResults.length === 0 && (
            <div className="quick-switcher-empty">
              <Search size={18} aria-hidden="true" />
              <span>Eşleşen bir uygulama, ayar veya not bulunamadı.</span>
            </div>
          )}
        </div>

        <div className="quick-switcher-footer" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> gezin</span>
          <span><kbd>↵</kbd> aç</span>
          <span><kbd>Esc</kbd> kapat</span>
        </div>
      </div>
    </div>
  )
}
