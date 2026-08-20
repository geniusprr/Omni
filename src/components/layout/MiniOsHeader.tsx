import React, { useEffect, useMemo, useState } from 'react'
import LayoutTemplate from 'lucide-react/dist/esm/icons/layout-template.js'
import Minus from 'lucide-react/dist/esm/icons/minus.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Settings from 'lucide-react/dist/esm/icons/settings.js'
import Square from 'lucide-react/dist/esm/icons/square.js'
import Sun from 'lucide-react/dist/esm/icons/sun.js'
import Moon from 'lucide-react/dist/esm/icons/moon.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getWeatherIcon } from '@/features/home/widgets/WeatherWidget'
import { desktop } from '@/lib/desktop'
import { useLiveWeather } from '@/lib/weather'
import type { MiniOsMode } from './MiniOsDock'

interface MiniOsHeaderProps {
  userName: string
  activeMode?: MiniOsMode
  onSelectMode?: (mode: MiniOsMode) => void
  onOpenQuickSwitcher: () => void
  onNavigateSettings: () => void
  onOpenCustomizeWidgets?: () => void
  themeMode: 'dark' | 'light'
  onToggleTheme: () => void
  onExecuteCommand?: (query: string) => void
}

export function MiniOsHeader({
  userName,
  activeMode = 'home',
  onSelectMode,
  onOpenQuickSwitcher,
  onNavigateSettings,
  onOpenCustomizeWidgets,
  themeMode,
  onToggleTheme,
  onExecuteCommand,
}: MiniOsHeaderProps) {
  const [time, setTime] = useState(new Date())
  const [searchQuery, setSearchQuery] = useState('')
  const weather = useLiveWeather()

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const greeting = useMemo(() => {
    const hour = time.getHours()
    if (hour >= 5 && hour < 12) return 'Günaydın'
    if (hour >= 12 && hour < 18) return 'Tünaydın'
    if (hour >= 18 && hour < 23) return 'İyi akşamlar'
    return 'İyi geceler'
  }, [time])

  // 24-hour format: HH:mm (e.g. 09:18, 23:15)
  const timeFormatted = useMemo(() => {
    const hours = time.getHours().toString().padStart(2, '0')
    const minutes = time.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }, [time])

  const dateFormatted = useMemo(() => {
    return time.toLocaleDateString('tr-TR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  }, [time])

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) {
      onOpenQuickSwitcher()
      return
    }

    if (onExecuteCommand) {
      onExecuteCommand(q)
      setSearchQuery('')
      return
    }

    onOpenQuickSwitcher()
    setSearchQuery('')
  }

  function handleDoubleClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button, input, form')) return
    void desktop.window.toggleMaximize()
  }

  // Action Capsule (theme, settings, minimize, maximize, close)
  const actionCapsule = (
    <div className="top-action-capsule">
      <TooltipProvider delayDuration={400}>
        {activeMode === 'home' && onOpenCustomizeWidgets && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="capsule-icon-btn"
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
              className="capsule-icon-btn"
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
              className="capsule-icon-btn"
              onClick={onToggleTheme}
              aria-label="Tema Değiştir"
            >
              {themeMode === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </TooltipTrigger>
          <TooltipContent>Açık / Koyu Tema</TooltipContent>
        </Tooltip>

        {activeMode !== 'settings' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="capsule-icon-btn"
                onClick={onNavigateSettings}
                aria-label="Ayarlar"
              >
                <Settings size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Ayarlar</TooltipContent>
          </Tooltip>
        )}

        <div className="capsule-v-sep" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="capsule-win-btn"
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
              className="capsule-win-btn"
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
              className="capsule-win-btn capsule-win-btn--close"
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

  // 1. NON-HOME SCREENS: compact, distraction-free workspace header.
  if (activeMode !== 'home') {
    return (
      <header
        className="header-compact-subscreen-bar"
        data-window-drag
        onDoubleClick={handleDoubleClick}
      >
        <div className="header-compact-left" data-window-drag />
        <div className="header-compact-center" data-window-drag />

        {/* Right: Window Controls Capsule */}
        <div className="header-compact-right" data-window-drag>
          {actionCapsule}
        </div>
      </header>
    )
  }

  // 2. HOME SCREEN: FULL LUXURY DASHBOARD HEADER (GREETING, BIG CLOCK, IN-APP SEARCH, LIVE WEATHER)
  return (
    <header
      className="header-top-row"
      data-window-drag
      onDoubleClick={handleDoubleClick}
    >
      {/* Top Left: User Greeting Pill */}
      <div className="header-left-col" data-window-drag>
        <div className="user-greeting-pill">
          <span>{greeting}, {userName || 'Genius'}</span>
          <span className="waving-hand" aria-hidden="true">👋</span>
        </div>
      </div>

      {/* Top Center: Big Bold Clock & Spotlight In-App Search Bar */}
      <div className="header-center-col" data-window-drag>
        <div className="center-clock-block" data-window-drag>
          <div className="big-clock-digits" data-window-drag>
            <span className="digits-main">{timeFormatted}</span>
          </div>
          <div className="clock-date-line" data-window-drag>
            {dateFormatted}
          </div>
        </div>

        {/* Spotlight In-App Search Bar (Thicker & Program Search) */}
        <form className="spotlight-bar-card spotlight-bar-card--inapp" onSubmit={handleSearchSubmit}>
          <Search size={18} className="spotlight-glass-icon" />
          <input
            type="text"
            className="spotlight-glass-input"
            placeholder="Web'de ara veya adres yaz; /alarm, /kapat ve /not komutlarını kullan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={() => {
              if (!searchQuery) {
                // optionally can trigger quick switcher directly
              }
            }}
          />
          <button
            type="button"
            className="spotlight-key-badge"
            onClick={onOpenQuickSwitcher}
            title="Komut paletini aç (Ctrl+K)"
          >
            ⌘K
          </button>
        </form>
      </div>

      {/* Top Right: Controls Capsule & Live Weather Widget */}
      <div className="header-right-col" data-window-drag>
        {actionCapsule}

        {/* Live Weather Card with Geolocation */}
        <div
          className="weather-floating-card"
          title={`${weather.city}, ${weather.country} • ${weather.condition} • Sıcaklık: ${weather.temperature}°C`}
        >
          <div className="weather-left-symbol">
            {getWeatherIcon(weather.weatherCode, weather.isDay, 22)}
          </div>
          <div className="weather-right-data">
            <div className="weather-temp-num">{weather.temperature}°C</div>
            <div className="weather-status-text">{weather.condition}</div>
            <div className="weather-location-text">{weather.city}</div>
          </div>
        </div>
      </div>
    </header>
  )
}
