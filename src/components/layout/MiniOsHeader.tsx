import type { MouseEvent } from 'react'
import LayoutTemplate from 'lucide-react/dist/esm/icons/layout-template.js'
import Minus from 'lucide-react/dist/esm/icons/minus.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Settings from 'lucide-react/dist/esm/icons/settings.js'
import Square from 'lucide-react/dist/esm/icons/square.js'
import Sun from 'lucide-react/dist/esm/icons/sun.js'
import Moon from 'lucide-react/dist/esm/icons/moon.js'
import QrCode from 'lucide-react/dist/esm/icons/qr-code.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { desktop } from '@/lib/desktop'
import type { MiniOsMode } from './MiniOsDock'

interface MiniOsHeaderProps {
  activeMode?: MiniOsMode
  onOpenQuickSwitcher: () => void
  onOpenPairingModal?: () => void
  onNavigateSettings: () => void
  onOpenCustomizeWidgets?: () => void
  themeMode: 'dark' | 'light'
  onToggleTheme: () => void
}

export function MiniOsHeader({
  activeMode = 'home',
  onOpenQuickSwitcher,
  onOpenPairingModal,
  onNavigateSettings,
  onOpenCustomizeWidgets,
  themeMode,
  onToggleTheme,
}: MiniOsHeaderProps) {
  function handleDoubleClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button, input, form')) return
    void desktop.window.toggleMaximize()
  }

  const windowControls = (
    <div className="window-control-strip" data-window-drag>
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

  const homeActions = (
    <div className="header-home-actions" data-window-drag>
      <TooltipProvider delayDuration={400}>
        {onOpenCustomizeWidgets && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="header-home-action-button"
                onClick={onOpenCustomizeWidgets}
                aria-label="Widgetları Düzenle"
                title="Widgetları Düzenle"
              >
                <LayoutTemplate size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Widgetları Düzenle & Sıfırla</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="header-home-action-button"
              onClick={onOpenQuickSwitcher}
              aria-label="Komut Paleti (Ctrl+K)"
              title="Komut Paleti (Ctrl+K)"
            >
              <Search size={15} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Hızlı Arama & Komutlar (Ctrl+K)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="header-home-action-button"
              onClick={onToggleTheme}
              aria-label="Tema Değiştir"
            >
              {themeMode === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </TooltipTrigger>
          <TooltipContent>Açık / Koyu Tema</TooltipContent>
        </Tooltip>

        {onOpenPairingModal && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="header-home-action-button"
                onClick={onOpenPairingModal}
                aria-label="Telefon / Kumanda Eşleştir (QR)"
                title="Telefon / Kumanda Eşleştir (QR)"
              >
                <QrCode size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Telefon / Kumanda Eşleştir (QR)</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="header-home-action-button"
              onClick={onNavigateSettings}
              aria-label="Ayarlar"
            >
              <Settings size={15} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Ayarlar</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )

  // Home and browser use the same real browser chrome. The home-only actions
  // sit beside it like browser extensions, while the actual chrome is owned by
  // BrowserPage and portaled into the matching slot.
  if (activeMode === 'home' || activeMode === 'browser') {
    const isHome = activeMode === 'home'

    return (
      <header
        className={`header-compact-subscreen-bar header-compact-subscreen-bar--browser ${isHome ? 'header-compact-subscreen-bar--home-browser' : ''}`}
        data-window-drag
        onDoubleClick={handleDoubleClick}
      >
        <div
          id={isHome ? 'browser-home-titlebar-slot' : 'browser-titlebar-slot'}
          className="browser-titlebar-slot"
          data-window-drag
          aria-label={isHome ? 'Ana sayfa tarayıcı başlık çubuğu' : 'Tarayıcı başlık çubuğu'}
        />

        {/* Home actions behave like browser extensions; other screens keep QR pairing here. */}
        <div className="header-compact-right" data-window-drag>
          {isHome ? homeActions : onOpenPairingModal && (
            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="window-control-button"
                    onClick={onOpenPairingModal}
                    aria-label="Telefon / Kumanda Eşleştir (QR)"
                    title="Telefon / Kumanda Eşleştir (QR)"
                  >
                    <QrCode size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Telefon / Kumanda Eşleştir (QR)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {windowControls}
        </div>
      </header>
    )
  }

  // Other utility screens keep a minimal draggable titlebar.
  return (
    <header
      className="header-compact-subscreen-bar"
      data-window-drag
      onDoubleClick={handleDoubleClick}
    >
      <div className="header-compact-left" data-window-drag />
      <div className="header-compact-center" data-window-drag />
      <div className="header-compact-right" data-window-drag>
        {onOpenPairingModal && (
          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="window-control-button"
                  onClick={onOpenPairingModal}
                  aria-label="Telefon / Kumanda Eşleştir (QR)"
                  title="Telefon / Kumanda Eşleştir (QR)"
                >
                  <QrCode size={13} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Telefon / Kumanda Eşleştir (QR)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {windowControls}
      </div>
    </header>
  )
}
