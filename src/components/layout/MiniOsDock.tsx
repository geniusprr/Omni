import React from 'react'
import Clock from 'lucide-react/dist/esm/icons/clock.js'
import Download from 'lucide-react/dist/esm/icons/download.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import Folder from 'lucide-react/dist/esm/icons/folder.js'
import Home from 'lucide-react/dist/esm/icons/home.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import Star from 'lucide-react/dist/esm/icons/star.js'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { RemoteConnectionStatus } from '@/types'

export type MiniOsMode = 'home' | 'browser' | 'power' | 'alarms' | 'notes' | 'localsend' | 'remote' | 'settings'

interface MiniOsDockProps {
  activeMode: MiniOsMode
  onSelectMode: (mode: MiniOsMode) => void
  alarmsCount: number
  connectionStatus: RemoteConnectionStatus
  onQuickAction: () => void
}

export function MiniOsDock({
  activeMode,
  onSelectMode,
  alarmsCount,
  connectionStatus,
  onQuickAction,
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
              >
                <Home size={18} strokeWidth={2.2} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Anasayfa</TooltipContent>
          </Tooltip>

          {/* Browser / Bookmarks / Favorites */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`dock-btn ${activeMode === 'browser' ? 'dock-btn--active' : ''}`}
                onClick={() => onSelectMode('browser')}
                aria-label="Edge Tarayıcı, Favoriler ve Kısayollar"
              >
                <Star size={18} strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Edge Tarayıcı & Favoriler</TooltipContent>
          </Tooltip>

          {/* 3. Clock / Time & Power Management */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`dock-btn ${activeMode === 'power' || activeMode === 'alarms' ? 'dock-btn--active' : ''}`}
                onClick={() => onSelectMode('power')}
                aria-label="Güç & Alarm Sayacı"
              >
                <Clock size={18} strokeWidth={1.8} />
                {alarmsCount > 0 && <span className="dock-badge-dot" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Güç & Zamanlayıcı</TooltipContent>
          </Tooltip>

          {/* 4. Folder / Files & Vault */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`dock-btn ${activeMode === 'notes' ? 'dock-btn--active' : ''}`}
                onClick={() => onSelectMode('notes')}
                aria-label="Defter & Dosyalar"
              >
                <Folder size={18} strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Defter & Vault</TooltipContent>
          </Tooltip>

          {/* 5. Download / Tray / LocalSend Transfers */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`dock-btn ${activeMode === 'localsend' ? 'dock-btn--active' : ''}`}
                onClick={() => onSelectMode('localsend')}
                aria-label="LocalSend Paylaşım"
              >
                <Download size={18} strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Dosya Paylaşımı (LocalSend)</TooltipContent>
          </Tooltip>

          {/* 6. Document / Quick Notes */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="dock-btn"
                onClick={() => onSelectMode('notes')}
                aria-label="Notlar"
              >
                <FileText size={18} strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Notlar</TooltipContent>
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
              >
                <Plus size={18} strokeWidth={2.4} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Kapatma, Alarm & Hızlı Eylemler</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </aside>
  )
}
