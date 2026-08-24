import type { ReactNode } from 'react'
import AlarmClock from 'lucide-react/dist/esm/icons/alarm-clock.js'
import Bot from 'lucide-react/dist/esm/icons/bot.js'
import CalendarDays from 'lucide-react/dist/esm/icons/calendar-days.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import Globe2 from 'lucide-react/dist/esm/icons/globe-2.js'
import Home from 'lucide-react/dist/esm/icons/home.js'
import PanelLeftClose from 'lucide-react/dist/esm/icons/panel-left-close.js'
import PanelLeftOpen from 'lucide-react/dist/esm/icons/panel-left-open.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import QrCode from 'lucide-react/dist/esm/icons/qr-code.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Settings from 'lucide-react/dist/esm/icons/settings.js'
import Share2 from 'lucide-react/dist/esm/icons/share-2.js'
import Smartphone from 'lucide-react/dist/esm/icons/smartphone.js'
import SunMoon from 'lucide-react/dist/esm/icons/sun-moon.js'
import Zap from 'lucide-react/dist/esm/icons/zap.js'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { MiniOsMode } from './MiniOsDock'

interface MiniOsActionBarProps {
  activeMode: MiniOsMode
  onNavigate: (mode: MiniOsMode) => void
  onOpenQuickSwitcher: () => void
  onQuickAction: () => void
  onOpenPairing: () => void
  onToggleTheme: () => void
  themeMode: 'light' | 'dark'
  isDockHidden: boolean
  onToggleDock: () => void
}

interface ActionItem {
  id: string
  label: string
  icon: ReactNode
  onClick: () => void
}

function modeLabel(mode: MiniOsMode) {
  switch (mode) {
    case 'home': return 'Anasayfa'
    case 'power': return 'Güç yönetimi'
    case 'alarms': return 'Alarmlar'
    case 'calendar': return 'Takvim'
    case 'notes': return 'Defter'
    case 'localsend': return 'Dosya paylaşımı'
    case 'remote': return 'Mobil kumanda'
    case 'settings': return 'Ayarlar'
    case 'ai': return 'LibreChat'
    case 'browser': return 'Tarayıcı'
  }
}

function modeIcon(mode: MiniOsMode) {
  switch (mode) {
    case 'home': return <Home size={13} />
    case 'power': return <Zap size={13} />
    case 'alarms': return <AlarmClock size={13} />
    case 'calendar': return <CalendarDays size={13} />
    case 'notes': return <FileText size={13} />
    case 'localsend': return <Share2 size={13} />
    case 'remote': return <Smartphone size={13} />
    case 'settings': return <Settings size={13} />
    case 'ai': return <Bot size={13} />
    case 'browser': return <Globe2 size={13} />
  }
}

export function MiniOsActionBar({
  activeMode,
  onNavigate,
  onOpenQuickSwitcher,
  onQuickAction,
  onOpenPairing,
  onToggleTheme,
  themeMode,
  isDockHidden,
  onToggleDock,
}: MiniOsActionBarProps) {
  const navigate = (mode: MiniOsMode) => () => onNavigate(mode)
  const nativeSurfaceMode = activeMode === 'browser' || activeMode === 'ai'
  const dockToggleLabel = isDockHidden ? 'Sol sekme çubuğunu göster' : 'Sol sekme çubuğunu gizle'
  const actions: ActionItem[] = (() => {
    switch (activeMode) {
      case 'home':
        return [
          { id: 'search', label: 'Arama ve komutları aç', icon: <Search size={14} />, onClick: onOpenQuickSwitcher },
          { id: 'quick', label: 'Hızlı eylemleri aç', icon: <Plus size={14} />, onClick: onQuickAction },
          { id: 'pair', label: 'Eşleştirme ve QR panelini aç', icon: <QrCode size={14} />, onClick: onOpenPairing },
        ]
      case 'power':
        return [
          { id: 'alarms', label: 'Alarm yönetimine geç', icon: <AlarmClock size={14} />, onClick: navigate('alarms') },
          { id: 'quick', label: 'Hızlı eylemleri aç', icon: <Plus size={14} />, onClick: onQuickAction },
          { id: 'settings', label: 'Ayarları aç', icon: <Settings size={14} />, onClick: navigate('settings') },
        ]
      case 'alarms':
        return [
          { id: 'power', label: 'Güç yönetimine geç', icon: <Zap size={14} />, onClick: navigate('power') },
          { id: 'quick', label: 'Hızlı eylemleri aç', icon: <Plus size={14} />, onClick: onQuickAction },
          { id: 'settings', label: 'Ayarları aç', icon: <Settings size={14} />, onClick: navigate('settings') },
        ]
      case 'calendar':
        return [
          { id: 'alarms', label: 'Alarm yönetimine geç', icon: <AlarmClock size={14} />, onClick: navigate('alarms') },
          { id: 'search', label: 'Arama ve komutları aç', icon: <Search size={14} />, onClick: onOpenQuickSwitcher },
          { id: 'home', label: 'Anasayfaya dön', icon: <Home size={14} />, onClick: navigate('home') },
        ]
      case 'notes':
        return [
          { id: 'search', label: 'Arama ve komutları aç', icon: <Search size={14} />, onClick: onOpenQuickSwitcher },
          { id: 'home', label: 'Anasayfaya dön', icon: <Home size={14} />, onClick: navigate('home') },
          { id: 'settings', label: 'Ayarları aç', icon: <Settings size={14} />, onClick: navigate('settings') },
        ]
      case 'localsend':
        return [
          { id: 'pair', label: 'Eşleştirme ve QR panelini aç', icon: <QrCode size={14} />, onClick: onOpenPairing },
          { id: 'settings', label: 'Ayarları aç', icon: <Settings size={14} />, onClick: navigate('settings') },
          { id: 'home', label: 'Anasayfaya dön', icon: <Home size={14} />, onClick: navigate('home') },
        ]
      case 'remote':
        return [
          { id: 'quick', label: 'Hızlı eylemleri aç', icon: <Plus size={14} />, onClick: onQuickAction },
          { id: 'settings', label: 'Ayarları aç', icon: <Settings size={14} />, onClick: navigate('settings') },
          { id: 'home', label: 'Anasayfaya dön', icon: <Home size={14} />, onClick: navigate('home') },
        ]
      case 'settings':
        return [
          {
            id: 'theme',
            label: themeMode === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç',
            icon: <SunMoon size={14} />,
            onClick: onToggleTheme,
          },
          { id: 'quick', label: 'Hızlı eylemleri aç', icon: <Plus size={14} />, onClick: onQuickAction },
          { id: 'home', label: 'Anasayfaya dön', icon: <Home size={14} />, onClick: navigate('home') },
        ]
      case 'ai':
        return [
          { id: 'search', label: 'Arama ve komutları aç', icon: <Search size={14} />, onClick: onOpenQuickSwitcher },
          { id: 'settings', label: 'Ayarları aç', icon: <Settings size={14} />, onClick: navigate('settings') },
          { id: 'home', label: 'Anasayfaya dön', icon: <Home size={14} />, onClick: navigate('home') },
        ]
      case 'browser':
        return [
          { id: 'search', label: 'Arama ve komutları aç', icon: <Search size={14} />, onClick: onOpenQuickSwitcher },
          { id: 'settings', label: 'Ayarları aç', icon: <Settings size={14} />, onClick: navigate('settings') },
          { id: 'home', label: 'Anasayfaya dön', icon: <Home size={14} />, onClick: navigate('home') },
        ]
    }
  })()

  return (
    <div
      className="minios-action-bar edge-browser__statusbar"
      data-active-mode={activeMode}
      data-window-drag
      role="toolbar"
      aria-label={`${modeLabel(activeMode)} aksiyonları`}
    >
      <TooltipProvider delayDuration={400} skipDelayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="edge-browser__statusbar-button minios-action-bar__dock-toggle"
              onClick={onToggleDock}
              aria-label={dockToggleLabel}
              aria-pressed={isDockHidden}
              title={dockToggleLabel}
              disabled={!nativeSurfaceMode}
            >
              {isDockHidden ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={6}>{dockToggleLabel}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="minios-action-bar__context">
        <span className="minios-action-bar__context-icon" aria-hidden="true">{modeIcon(activeMode)}</span>
        <span className="minios-action-bar__context-label">{modeLabel(activeMode)}</span>
      </div>

      <div className="edge-browser__statusbar-spacer" />

      <div className="edge-browser__statusbar-group minios-action-bar__actions">
        <TooltipProvider delayDuration={400} skipDelayDuration={150}>
          {actions.map((action) => (
            <Tooltip key={action.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="edge-browser__statusbar-button minios-action-bar__button"
                  onClick={action.onClick}
                  aria-label={action.label}
                  title={action.label}
                >
                  {action.icon}
                </button>
              </TooltipTrigger>
              <TooltipContent side={nativeSurfaceMode ? 'left' : 'top'} sideOffset={6}>{action.label}</TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>
    </div>
  )
}
