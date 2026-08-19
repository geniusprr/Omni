import React from 'react'
import AlarmClock from 'lucide-react/dist/esm/icons/alarm-clock.js'
import BookOpen from 'lucide-react/dist/esm/icons/book-open.js'
import LayoutGrid from 'lucide-react/dist/esm/icons/layout-grid.js'
import Power from 'lucide-react/dist/esm/icons/power.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Settings from 'lucide-react/dist/esm/icons/settings.js'
import Share2 from 'lucide-react/dist/esm/icons/share-2.js'
import Smartphone from 'lucide-react/dist/esm/icons/smartphone.js'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { RemoteConnectionStatus } from '@/types'

export type AppMode = 'home' | 'power' | 'alarms' | 'notes' | 'localsend' | 'remote' | 'settings'

interface FloatingTaskbarProps {
  activeMode: AppMode
  onSelectMode: (mode: AppMode) => void
  alarmsCount: number
  connectionStatus: RemoteConnectionStatus
  onOpenQuickSwitcher: () => void
}

interface NavItem {
  id: AppMode
  label: string
  icon: React.ReactNode
  badge?: number
}

export function FloatingTaskbar({
  activeMode,
  onSelectMode,
  alarmsCount,
  connectionStatus,
  onOpenQuickSwitcher,
}: FloatingTaskbarProps) {
  const navItems: NavItem[] = [
    {
      id: 'home',
      label: 'Anasayfa',
      icon: <LayoutGrid size={17} strokeWidth={1.9} />,
    },
    {
      id: 'power',
      label: 'Güç',
      icon: <Power size={17} strokeWidth={1.9} />,
    },
    {
      id: 'alarms',
      label: 'Alarm',
      icon: <AlarmClock size={17} strokeWidth={1.9} />,
      badge: alarmsCount > 0 ? alarmsCount : undefined,
    },
    {
      id: 'notes',
      label: 'Defter',
      icon: <BookOpen size={17} strokeWidth={1.9} />,
    },
    {
      id: 'localsend',
      label: 'Paylaş',
      icon: <Share2 size={17} strokeWidth={1.9} />,
    },
    {
      id: 'remote',
      label: 'Mobil',
      icon: <Smartphone size={17} strokeWidth={1.9} />,
    },
    {
      id: 'settings',
      label: 'Ayarlar',
      icon: <Settings size={17} strokeWidth={1.9} />,
    },
  ]

  return (
    <nav className="floating-dock-container" aria-label="Ana Uygulama Menüsü">
      <TooltipProvider delayDuration={400}>
        <div className="floating-dock">
          {/* Quick Search Action */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="dock-item dock-item--search"
                onClick={onOpenQuickSwitcher}
                aria-label="Hızlı Ara (Ctrl+K)"
              >
                <Search size={16} strokeWidth={2} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <span>Hızlı Ara</span> <kbd className="dock-kbd">Ctrl+K</kbd>
            </TooltipContent>
          </Tooltip>

          <div className="dock-separator" />

          {/* Nav Items */}
          {navItems.map((item) => {
            const isActive = activeMode === item.id
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={`dock-item ${isActive ? 'dock-item--active' : ''}`}
                    onClick={() => onSelectMode(item.id)}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className="dock-item__icon">{item.icon}</span>
                    {isActive && <span className="dock-item__label">{item.label}</span>}
                    {item.badge !== undefined && (
                      <span className="dock-badge">{item.badge}</span>
                    )}
                    {isActive && <span className="dock-active-dot" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <span>{item.label}</span>
                </TooltipContent>
              </Tooltip>
            )
          })}

          <div className="dock-separator" />

          {/* Connection Status Dot */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`dock-status-dot ${connectionStatus === 'connected' ? 'dock-status-dot--online' : ''}`}
                tabIndex={0}
                aria-label={connectionStatus === 'connected' ? 'Çevrim içi senkronize' : 'Yerel çalışma modu'}
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              {connectionStatus === 'connected' ? 'Bulut Senkronize · Çevrim içi' : 'Yerel Mod'}
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </nav>
  )
}
