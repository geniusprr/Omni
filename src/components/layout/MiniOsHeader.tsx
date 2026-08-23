import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import Search from 'lucide-react/dist/esm/icons/search.js'
import { desktop } from '@/lib/desktop'
import type { MiniOsMode } from './MiniOsDock'

interface MiniOsHeaderProps {
  activeMode?: MiniOsMode
  onBrowserSearch?: (query: string) => void
}

export function MiniOsHeader({ activeMode = 'home', onBrowserSearch }: MiniOsHeaderProps) {
  const [clockNow, setClockNow] = useState(() => new Date())
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (activeMode !== 'home') return

    function handleAddressBarShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'l') return
      event.preventDefault()
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }

    window.addEventListener('keydown', handleAddressBarShortcut)
    return () => window.removeEventListener('keydown', handleAddressBarShortcut)
  }, [activeMode])

  function handleDoubleClick(event: MouseEvent) {
    if ((event.target as HTMLElement).closest('button, input, form')) return
    void desktop.window.toggleMaximize()
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = searchQuery.trim()
    if (!query) {
      searchInputRef.current?.focus()
      return
    }

    onBrowserSearch?.(query)
    setSearchQuery('')
  }

  if (activeMode === 'browser') {
    return null
  }

  if (activeMode === 'home') {
    const timeFormatted = `${String(clockNow.getHours()).padStart(2, '0')}:${String(clockNow.getMinutes()).padStart(2, '0')}`
    const dateFormatted = clockNow.toLocaleDateString('tr-TR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })

    return (
      <header
        className="header-compact-subscreen-bar header-compact-subscreen-bar--home-browser"
        data-window-drag
        onDoubleClick={handleDoubleClick}
      >
        <div className="header-home-dashboard-row" data-window-drag>
          <div className="header-home-dashboard-spacer" aria-hidden="true" />
          <div className="header-center-col" data-window-drag>
            <div className="center-clock-block" data-window-drag aria-label={`Saat ${timeFormatted}`}>
              <div className="big-clock-digits" data-window-drag>
                <span className="digits-main">{timeFormatted}</span>
              </div>
              <div className="clock-date-line" data-window-drag>{dateFormatted}</div>
            </div>
            <form
              className="spotlight-bar-card spotlight-bar-card--browser-search"
              onSubmit={handleSearchSubmit}
              role="search"
            >
              <Search size={18} className="spotlight-glass-icon" aria-hidden="true" />
              <input
                ref={searchInputRef}
                className="spotlight-glass-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Google'da ara veya adres yaz..."
                aria-label="Google'da ara veya web adresi yaz"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <kbd className="spotlight-key-badge" aria-label="Ctrl L ile odaklan">Ctrl L</kbd>
            </form>
          </div>
          <div className="header-compact-right" data-window-drag />
        </div>
      </header>
    )
  }

  return (
    <header
      className="header-compact-subscreen-bar"
      data-window-drag
      onDoubleClick={handleDoubleClick}
    >
      <div className="header-compact-left" data-window-drag />
      <div className="header-compact-center" data-window-drag />
      <div className="header-compact-right" data-window-drag />
    </header>
  )
}
