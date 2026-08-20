import React, { useState } from 'react'
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left.js'
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right.js'
import Minus from 'lucide-react/dist/esm/icons/minus.js'
import PanelLeftClose from 'lucide-react/dist/esm/icons/panel-left-close.js'
import PanelLeftOpen from 'lucide-react/dist/esm/icons/panel-left-open.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Square from 'lucide-react/dist/esm/icons/square.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { desktop } from '@/lib/desktop'
import type { RemoteConnectionStatus } from '@/types'

interface SuperTitlebarProps {
  activeMode: string
  sidebarOpen: boolean
  onToggleSidebar: () => void
  onOpenQuickSwitcher: () => void
  onNavigateMode: (mode: any) => void
  connectionStatus: RemoteConnectionStatus
  historyCanGoBack?: boolean
  historyCanGoForward?: boolean
  onHistoryBack?: () => void
  onHistoryForward?: () => void
}

export function SuperTitlebar({
  activeMode,
  sidebarOpen,
  onToggleSidebar,
  onOpenQuickSwitcher,
  onNavigateMode,
  connectionStatus,
  historyCanGoBack = false,
  historyCanGoForward = false,
  onHistoryBack,
  onHistoryForward,
}: SuperTitlebarProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null)

  const modeLabels: Record<string, string> = {
    power: 'Güç Sayacı',
    alarms: 'Alarmlar',
    notes: 'Defter & Notlar',
    localsend: 'LocalSend Paylaşım',
    remote: 'Uzaktan Kontrol',
    settings: 'Ayarlar',
  }

  function handleMenuClick(menuName: string) {
    setActiveMenu(activeMenu === menuName ? null : menuName)
  }

  function handleAction(action: () => void) {
    action()
    setActiveMenu(null)
  }

  return (
    <header className="super-titlebar" data-window-drag>
      <div className="super-titlebar__left" data-window-drag>
        {/* Sidebar Toggle */}
        <TooltipProvider delayDuration={500}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="titlebar-icon-btn"
                onClick={onToggleSidebar}
                aria-label={sidebarOpen ? 'Sol paneli gizle' : 'Sol paneli göster'}
              >
                {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{sidebarOpen ? 'Paneli Daralt' : 'Paneli Genişlet'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* History Nav */}
        <div className="titlebar-history-group" data-window-drag>
          <button
            type="button"
            className="titlebar-icon-btn"
            disabled={!historyCanGoBack}
            onClick={onHistoryBack}
            aria-label="Geri"
          >
            <ArrowLeft size={14} />
          </button>
          <button
            type="button"
            className="titlebar-icon-btn"
            disabled={!historyCanGoForward}
            onClick={onHistoryForward}
            aria-label="İleri"
          >
            <ArrowRight size={14} />
          </button>
        </div>

        {/* App Menus */}
        <nav className="titlebar-menubar" aria-label="Uygulama Menüsü">
          <div className="titlebar-menu-item">
            <button
              type="button"
              className={`titlebar-menu-btn ${activeMenu === 'dosya' ? 'titlebar-menu-btn--active' : ''}`}
              onClick={() => handleMenuClick('dosya')}
            >
              Dosya
            </button>
            {activeMenu === 'dosya' && (
              <>
                <div className="menu-backdrop" onClick={() => setActiveMenu(null)} />
                <div className="titlebar-dropdown">
                  <button type="button" onClick={() => handleAction(() => onNavigateMode('notes'))}>
                    <span>Yeni Not Oluştur</span>
                    <kbd>Ctrl+N</kbd>
                  </button>
                  <button type="button" onClick={() => handleAction(onOpenQuickSwitcher)}>
                    <span>Hızlı Not / Ara</span>
                    <kbd>Ctrl+K</kbd>
                  </button>
                  <div className="dropdown-divider" />
                  <button type="button" onClick={() => handleAction(() => void desktop.window.close())}>
                    <span>Kapat / Tepsiye At</span>
                    <kbd>Alt+F4</kbd>
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="titlebar-menu-item">
            <button
              type="button"
              className={`titlebar-menu-btn ${activeMenu === 'duzenle' ? 'titlebar-menu-btn--active' : ''}`}
              onClick={() => handleMenuClick('duzenle')}
            >
              Düzenle
            </button>
            {activeMenu === 'duzenle' && (
              <>
                <div className="menu-backdrop" onClick={() => setActiveMenu(null)} />
                <div className="titlebar-dropdown">
                  <button type="button" onClick={() => handleAction(onOpenQuickSwitcher)}>
                    <span>Defterde Ara</span>
                    <kbd>Ctrl+F</kbd>
                  </button>
                  <button type="button" onClick={() => handleAction(() => onNavigateMode('notes'))}>
                    <span>Deftere Git</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="titlebar-menu-item">
            <button
              type="button"
              className={`titlebar-menu-btn ${activeMenu === 'gorunum' ? 'titlebar-menu-btn--active' : ''}`}
              onClick={() => handleMenuClick('gorunum')}
            >
              Görünüm
            </button>
            {activeMenu === 'gorunum' && (
              <>
                <div className="menu-backdrop" onClick={() => setActiveMenu(null)} />
                <div className="titlebar-dropdown">
                  <button type="button" onClick={() => handleAction(onToggleSidebar)}>
                    <span>Sol Paneli Değiştir</span>
                    <kbd>Ctrl+\</kbd>
                  </button>
                  <button type="button" onClick={() => handleAction(() => void desktop.window.toggleMaximize())}>
                    <span>Tam Ekran / Ekranı Kapla</span>
                    <kbd>F11</kbd>
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="titlebar-menu-item">
            <button
              type="button"
              className={`titlebar-menu-btn ${activeMenu === 'araclar' ? 'titlebar-menu-btn--active' : ''}`}
              onClick={() => handleMenuClick('araclar')}
            >
              Araçlar
            </button>
            {activeMenu === 'araclar' && (
              <>
                <div className="menu-backdrop" onClick={() => setActiveMenu(null)} />
                <div className="titlebar-dropdown">
                  <button type="button" onClick={() => handleAction(() => onNavigateMode('power'))}>
                    <span>⚡ Güç Sayacı</span>
                  </button>
                  <button type="button" onClick={() => handleAction(() => onNavigateMode('alarms'))}>
                    <span>⏰ Alarmlar</span>
                  </button>
                  <button type="button" onClick={() => handleAction(() => onNavigateMode('notes'))}>
                    <span>📓 Defter & Notlar</span>
                  </button>
                  <button type="button" onClick={() => handleAction(() => onNavigateMode('localsend'))}>
                    <span>📡 LocalSend Paylaşım</span>
                  </button>
                  <button type="button" onClick={() => handleAction(() => onNavigateMode('settings'))}>
                    <span>⚙️ Ayarlar</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="titlebar-menu-item">
            <button
              type="button"
              className={`titlebar-menu-btn ${activeMenu === 'yardim' ? 'titlebar-menu-btn--active' : ''}`}
              onClick={() => handleMenuClick('yardim')}
            >
              Yardım
            </button>
            {activeMenu === 'yardim' && (
              <>
                <div className="menu-backdrop" onClick={() => setActiveMenu(null)} />
                <div className="titlebar-dropdown">
                  <button type="button" onClick={() => handleAction(() => onNavigateMode('settings'))}>
                    <span>Uygulama Hakkında & Sürüm</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </nav>
      </div>

      {/* Center Breadcrumb */}
      <div className="super-titlebar__center" data-window-drag>
        <span className="titlebar-app-name" data-window-drag>kapanış.</span>
        <span className="titlebar-sep" data-window-drag>·</span>
        <span className="titlebar-active-mode" data-window-drag>{modeLabels[activeMode] || activeMode}</span>
      </div>

      {/* Right Controls */}
      <div className="super-titlebar__right" data-window-drag>
        {/* Quick Search Button */}
        <button
          type="button"
          className="titlebar-search-pill"
          onClick={onOpenQuickSwitcher}
          title="Hızlı Arama & Geçiş (Ctrl+K)"
        >
          <Search size={13} />
          <span>Hızlı Ara</span>
          <kbd>Ctrl+K</kbd>
        </button>

        {/* Connection status indicator */}
        <div
          className={`titlebar-status-dot ${connectionStatus === 'connected' ? 'titlebar-status-dot--online' : ''}`}
          title={connectionStatus === 'connected' ? 'Bulut Senkronizasyonu Aktif' : 'Yerel Mod'}
        />

        {/* Windows controls */}
        <TooltipProvider delayDuration={600}>
          <div className="super-titlebar__window-controls">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Küçült"
                  className="window-control-btn window-control-btn--minimize"
                  onClick={() => void desktop.window.minimize()}
                >
                  <Minus aria-hidden="true" size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Küçült</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Ekranı Kapla / Geri Yükle"
                  className="window-control-btn window-control-btn--maximize"
                  onClick={() => void desktop.window.toggleMaximize()}
                >
                  <Square aria-hidden="true" size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Büyüt / Geri Yükle</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Sistem tepsisine küçült"
                  className="window-control-btn window-control-btn--close"
                  onClick={() => void desktop.window.close()}
                >
                  <X aria-hidden="true" size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Tepsiye küçült</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>
    </header>
  )
}
