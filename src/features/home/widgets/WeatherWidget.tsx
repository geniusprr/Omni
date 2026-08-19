import React from 'react'
import Cloud from 'lucide-react/dist/esm/icons/cloud.js'
import CloudFog from 'lucide-react/dist/esm/icons/cloud-fog.js'
import CloudLightning from 'lucide-react/dist/esm/icons/cloud-lightning.js'
import CloudRain from 'lucide-react/dist/esm/icons/cloud-rain.js'
import CloudSnow from 'lucide-react/dist/esm/icons/cloud-snow.js'
import CloudSun from 'lucide-react/dist/esm/icons/cloud-sun.js'
import Droplets from 'lucide-react/dist/esm/icons/droplets.js'
import GripHorizontal from 'lucide-react/dist/esm/icons/grip-horizontal.js'
import MapPin from 'lucide-react/dist/esm/icons/map-pin.js'
import Moon from 'lucide-react/dist/esm/icons/moon.js'
import RotateCw from 'lucide-react/dist/esm/icons/rotate-cw.js'
import Sun from 'lucide-react/dist/esm/icons/sun.js'
import Wind from 'lucide-react/dist/esm/icons/wind.js'
import { fetchLiveWeather, useLiveWeather } from '@/lib/weather'

interface WeatherWidgetProps {
  onHide?: () => void
}

export function getWeatherIcon(code: number, isDay: boolean, size = 20) {
  if (code === 0 || code === 1) {
    return isDay ? <Sun size={size} className="text-amber-400" /> : <Moon size={size} className="text-sky-300" />
  }
  if (code === 2) {
    return isDay ? <CloudSun size={size} className="text-amber-300" /> : <Cloud size={size} className="text-slate-300" />
  }
  if (code === 3) {
    return <Cloud size={size} className="text-slate-400" />
  }
  if (code === 45 || code === 48) {
    return <CloudFog size={size} className="text-slate-300" />
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return <CloudRain size={size} className="text-sky-400" />
  }
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return <CloudSnow size={size} className="text-cyan-200" />
  }
  if (code >= 95) {
    return <CloudLightning size={size} className="text-yellow-400" />
  }
  return <CloudSun size={size} className="text-amber-400" />
}

export function WeatherWidget({ onHide }: WeatherWidgetProps) {
  const weather = useLiveWeather()
  const [isRefreshing, setIsRefreshing] = React.useState(false)

  async function handleRefresh() {
    setIsRefreshing(true)
    await fetchLiveWeather()
    setTimeout(() => setIsRefreshing(false), 600)
  }

  return (
    <div className="glass-widget-card card-weather widget-drag-card">
      <div className="card-top-bar">
        <div className="widget-header-title-group">
          <GripHorizontal size={13} className="widget-drag-handle" />
          <span className="card-heading">Hava Durumu</span>
        </div>

        <div className="widget-header-actions">
          <button
            type="button"
            className={`card-pill-btn ${isRefreshing ? 'animate-spin' : ''}`}
            onClick={handleRefresh}
            title="Hava Durumunu Yenile"
          >
            <RotateCw size={11} />
          </button>
          {onHide && (
            <button
              type="button"
              className="widget-hide-btn"
              onClick={onHide}
              title="Gizle"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="weather-widget-body">
        {/* Main Location & Temperature Header */}
        <div className="weather-widget-main-row">
          <div className="weather-widget-icon-box">
            {getWeatherIcon(weather.weatherCode, weather.isDay, 36)}
          </div>

          <div className="weather-widget-temp-group">
            <div className="weather-widget-temp">
              <span className="temp-number">{weather.temperature}</span>
              <span className="temp-unit">°C</span>
            </div>
            <div className="weather-widget-condition">{weather.condition}</div>
          </div>

          <div className="weather-widget-location-badge">
            <MapPin size={11} className="text-sky-400" />
            <span title={`${weather.city}, ${weather.country}`}>{weather.city}</span>
          </div>
        </div>

        {/* Weather Metrics Grid */}
        <div className="weather-metrics-grid">
          <div className="weather-metric-item">
            <span className="metric-label">Hissedilen</span>
            <span className="metric-value">{weather.apparentTemperature}°</span>
          </div>

          <div className="weather-metric-item">
            <span className="metric-label">
              <Droplets size={11} className="inline mr-1 text-sky-400" />
              Nem
            </span>
            <span className="metric-value">%{weather.humidity}</span>
          </div>

          <div className="weather-metric-item">
            <span className="metric-label">
              <Wind size={11} className="inline mr-1 text-teal-400" />
              Rüzgar
            </span>
            <span className="metric-value">{weather.windSpeed} km/s</span>
          </div>

          <div className="weather-metric-item">
            <span className="metric-label">En Düşük / Yüksek</span>
            <span className="metric-value">{weather.minTemp}° / {weather.maxTemp}°</span>
          </div>
        </div>
      </div>
    </div>
  )
}
