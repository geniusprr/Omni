import { useEffect, useState, type FormEvent, type MouseEvent } from 'react'
import Minus from 'lucide-react/dist/esm/icons/minus.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Square from 'lucide-react/dist/esm/icons/square.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { desktop } from '@/lib/desktop'
import type { MiniOsMode } from './MiniOsDock'

interface MiniOsHeaderProps {
  activeMode?: MiniOsMode
  onOpenQuickSwitcher?: () => void
  onExecuteCommand?: (query: string) => void
}

export function MiniOsHeader({ activeMode = 'home', onOpenQuickSwitcher, onExecuteCommand }: MiniOsHeaderProps) {
  const [clockNow, setClockNow] = useState(() => new Date())
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  function handleDoubleClick(event: MouseEvent) {
    if ((event.target as HTMLElement).closest('button, input, form')) return
    void desktop.window.toggleMaximize()
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = searchQuery.trim()
    if (!query) {
      onOpenQuickSwitcher?.()
      return
    }

    if (onExecuteCommand) {
      onExecuteCommand(query)
    } else {
      onOpenQuickSwitcher?.()
    }
    setSearchQuery('')
  }

  const windowControls = (
    <div className="window-control-strip window-control-strip--top-right" data-window-drag>
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="window-control-button window-control-button--minimize"
              onClick={() => void desktop.window.minimize()}
              aria-label="Küçült"
            >
              <Minus size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Küçült</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="window-control-button window-control-button--maximize"
              onClick={() => void desktop.window.toggleMaximize()}
              aria-label="Ekranı Kapla"
            >
              <Square size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Ekranı Kapla</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="window-control-button window-control-button--close"
              onClick={() => void desktop.window.close()}
              aria-label="Kapat"
            >
              <X size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Kapat / Tepsiye Küçült</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )

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
            <form className="spotlight-bar-card spotlight-bar-card--inapp" onSubmit={handleSearchSubmit}>
              <Search size={18} className="spotlight-glass-icon" aria-hidden="true" />
              <input
                className="spotlight-glass-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Web'de ara veya adres yaz; /alarm, /kapat ve /not komutlarını kullan..."
                aria-label="Web'de ara veya komut çalıştır"
              />
              <button
                type="button"
                className="spotlight-key-badge"
                onClick={onOpenQuickSwitcher}
                aria-label="Arama ve komut paletini aç"
                title="Arama ve komut paleti (Ctrl+K)"
              >
                ⌘K
              </button>
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
