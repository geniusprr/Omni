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
import X from 'lucide-react/dist/esm/icons/x.js'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
    <Card className="glass-widget-card card-weather widget-drag-card">
      <div className="card-top-bar">
        <div className="widget-header-title-group">
          <GripHorizontal size={13} className="widget-drag-handle" />
          <span className="card-heading">Hava Durumu</span>
        </div>

        <div className="widget-header-actions">
          <Button
            type="button"
            variant="icon"
            size="compact"
            className="weather-widget-action"
            onClick={handleRefresh}
            title="Hava Durumunu Yenile"
            aria-label="Hava durumunu yenile"
            disabled={isRefreshing}
          >
            <RotateCw size={13} className={isRefreshing ? 'weather-widget-refreshing' : undefined} />
          </Button>
          {onHide && (
            <Button
              type="button"
              variant="icon"
              size="compact"
              className="weather-widget-action"
              onClick={onHide}
              title="Gizle"
              aria-label="Hava durumu widgetini gizle"
            >
              <X size={14} />
            </Button>
          )}
        </div>
      </div>

      <div className="weather-widget-body">
        <div className="weather-widget-hero">
          <div className="weather-widget-primary">
            <div className="weather-widget-location">
              <MapPin size={12} />
              <span title={`${weather.city}, ${weather.country}`}>
                {weather.city}
                {weather.country ? <small>{weather.country}</small> : null}
              </span>
            </div>

            <div className="weather-widget-temp-row">
              <div className="weather-widget-temp">
                <span className="temp-number">{weather.temperature}</span>
                <span className="temp-unit">°</span>
              </div>

              <div className="weather-widget-condition-group">
                <span className="weather-widget-condition">{weather.condition}</span>
                <span className="weather-widget-range">
                  {weather.minTemp}° / {weather.maxTemp}°
                </span>
              </div>
            </div>
          </div>

          <div className="weather-widget-icon-box" aria-hidden="true">
            {getWeatherIcon(weather.weatherCode, weather.isDay, 42)}
          </div>
        </div>

        <div className="weather-metrics-grid">
          <div className="weather-metric-item">
            <div className="weather-metric-icon">
              <Sun size={14} />
            </div>
            <div className="weather-metric-copy">
              <span className="metric-label">Hissedilen</span>
              <span className="metric-value">{weather.apparentTemperature}°</span>
            </div>
          </div>

          <div className="weather-metric-item">
            <div className="weather-metric-icon">
              <Droplets size={14} />
            </div>
            <div className="weather-metric-copy">
              <span className="metric-label">Nem</span>
              <span className="metric-value">%{weather.humidity}</span>
            </div>
          </div>

          <div className="weather-metric-item">
            <div className="weather-metric-icon">
              <Wind size={14} />
            </div>
            <div className="weather-metric-copy">
              <span className="metric-label">Rüzgar</span>
              <span className="metric-value">{weather.windSpeed} km/s</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
