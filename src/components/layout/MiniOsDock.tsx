import React from 'react'
import Bot from 'lucide-react/dist/esm/icons/bot.js'
import Clock from 'lucide-react/dist/esm/icons/clock.js'
import Download from 'lucide-react/dist/esm/icons/download.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import Folder from 'lucide-react/dist/esm/icons/folder.js'
import Globe2 from 'lucide-react/dist/esm/icons/globe-2.js'
import Home from 'lucide-react/dist/esm/icons/home.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Settings from 'lucide-react/dist/esm/icons/settings.js'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { RemoteConnectionStatus } from '@/types'

export type MiniOsMode = 'home' | 'browser' | 'ai' | 'power' | 'alarms' | 'notes' | 'localsend' | 'remote' | 'settings'

interface MiniOsDockProps {
  activeMode: MiniOsMode
  onSelectMode: (mode: MiniOsMode) => void
  alarmsCount: number
  connectionStatus: RemoteConnectionStatus
  onQuickAction: () => void
  onOpenQuickSwitcher: () => void
}

export function MiniOsDock({
  activeMode,
  onSelectMode,
  alarmsCount,
  connectionStatus,
  onQuickAction,
  onOpenQuickSwitcher,
}: MiniOsDockProps) {
  return (
    <aside className="dock-rail" aria-label="Mini-OS Dock">
      <TooltipProvider delayDuration={300}>
        <div className="dock-pill-body">
          {/* 1. Home / Dashboard */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`dock-btn ${activeMode === 'home' ? 'dock-btn--active' : ''}`}
                onClick={() => onSelectMode('home')}
                aria-label="Anasayfa / Dashboard"
                title="Anasayfa"
              >
                <Home size={18} strokeWidth={2.2} />
              </button>
            </TooltipTrigger>
            <TooltipContent className="dock-tooltip" side="bottom">Anasayfa</TooltipContent>
          </Tooltip>

          {/* Search / Quick Switcher */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="dock-btn"
                onClick={onOpenQuickSwitcher}
                aria-label="Arama ve komutlar"
                title="Arama ve Komutlar"
              >
                <Search size={18} strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent className="dock-tooltip" side="bottom">Arama ve Komutlar</TooltipContent>
          </Tooltip>

          {/* Settings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`dock-btn ${activeMode === 'settings' ? 'dock-btn--active' : ''}`}
                onClick={() => onSelectMode('settings')}
                aria-label="Ayarlar"
                title="Ayarlar"
              >
                <Settings size={18} strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent className="dock-tooltip" side="bottom">Ayarlar</TooltipContent>
          </Tooltip>

          {/* Browser */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`dock-btn ${activeMode === 'browser' ? 'dock-btn--active' : ''}`}
                onClick={() => onSelectMode('browser')}
                aria-label="Tarayıcı"
                title="Tarayıcı"
              >
                <Globe2 size={18} strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent className="dock-tooltip" side="bottom">Tarayıcı</TooltipContent>
          </Tooltip>

          {/* Official LibreChat workspace */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`dock-btn ${activeMode === 'ai' ? 'dock-btn--active' : ''}`}
                onClick={() => onSelectMode('ai')}
                aria-label="LibreChat"
                title="LibreChat"
              >
                <Bot size={18} strokeWidth={1.9} />
              </button>
            </TooltipTrigger>
            <TooltipContent className="dock-tooltip" side="bottom">LibreChat</TooltipContent>
          </Tooltip>

          {/* 3. Clock / Time & Power Management */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`dock-btn ${activeMode === 'power' || activeMode === 'alarms' ? 'dock-btn--active' : ''}`}
                onClick={() => onSelectMode('power')}
                aria-label="Güç & Alarm Sayacı"
                title="Güç & Zamanlayıcı"
              >
                <Clock size={18} strokeWidth={1.8} />
                {alarmsCount > 0 && <span className="dock-badge-dot" />}
              </button>
            </TooltipTrigger>
            <TooltipContent className="dock-tooltip" side="bottom">Güç & Zamanlayıcı</TooltipContent>
          </Tooltip>

          {/* 4. Folder / Files & Vault */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`dock-btn ${activeMode === 'notes' ? 'dock-btn--active' : ''}`}
                onClick={() => onSelectMode('notes')}
                aria-label="Defter & Dosyalar"
                title="Defter & Vault"
              >
                <Folder size={18} strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent className="dock-tooltip" side="bottom">Defter & Vault</TooltipContent>
          </Tooltip>

          {/* 5. Download / Tray / LocalSend Transfers */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`dock-btn ${activeMode === 'localsend' ? 'dock-btn--active' : ''}`}
                onClick={() => onSelectMode('localsend')}
                aria-label="LocalSend Paylaşım"
                title="Dosya Paylaşımı (LocalSend)"
              >
                <Download size={18} strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent className="dock-tooltip" side="bottom">Dosya Paylaşımı (LocalSend)</TooltipContent>
          </Tooltip>

          {/* 6. Document / Quick Notes */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="dock-btn"
                onClick={() => onSelectMode('notes')}
                aria-label="Notlar"
                title="Notlar"
              >
                <FileText size={18} strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent className="dock-tooltip" side="bottom">Notlar</TooltipContent>
          </Tooltip>
        </div>

        {/* 7. Bottom Plus (+) Action Button */}
        <div className="dock-bottom-pill">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="dock-btn dock-btn--plus"
                onClick={onQuickAction}
                aria-label="Hızlı Eylemler"
                title="Kapatma, Alarm & Hızlı Eylemler"
              >
                <Plus size={18} strokeWidth={2.4} />
              </button>
            </TooltipTrigger>
            <TooltipContent className="dock-tooltip" side="bottom">Kapatma, Alarm & Hızlı Eylemler</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </aside>
  )
}
