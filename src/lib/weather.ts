import { useEffect, useState } from 'react'

export interface WeatherData {
  city: string
  country: string
  temperature: number
  apparentTemperature: number
  humidity: number
  windSpeed: number
  condition: string
  weatherCode: number
  isDay: boolean
  minTemp?: number
  maxTemp?: number
  precipitation?: number
  loading: boolean
  error: string | null
}

const WMO_CONDITIONS: Record<number, string> = {
  0: 'Açık',
  1: 'Çoğunlukla Açık',
  2: 'Parçalı Bulutlu',
  3: 'Bulutlu / Kapalı',
  45: 'Sisli',
  48: 'Kırağı / Sis',
  51: 'Hafif Çisenti',
  53: 'Çisenti',
  55: 'Yoğun Çisenti',
  56: 'Dondurucu Çisenti',
  57: 'Yoğun Dondurucu Çisenti',
  61: 'Hafif Yağmurlu',
  62: 'Yağmurlu',
  63: 'Orta Şiddetli Yağmur',
  65: 'Kuvvetli Yağmurlu',
  66: 'Dondurucu Yağmur',
  67: 'Kuvvetli Dondurucu Yağmur',
  71: 'Hafif Kar Yağışlı',
  73: 'Kar Yağışlı',
  75: 'Yoğun Kar Yağışlı',
  77: 'Kar Taneleri',
  80: 'Hafif Sağanak',
  81: 'Sağanak Yağışlı',
  82: 'Şiddetli Sağanak',
  85: 'Hafif Kar Sağanağı',
  86: 'Yoğun Kar Sağanağı',
  95: 'Gök Gürültülü Fırtına',
  96: 'Dolu ve Fırtına',
  99: 'Şiddetli Dolulu Fırtına',
}

export function getWeatherConditionText(code: number): string {
  return WMO_CONDITIONS[code] || 'Açık'
}

let cachedWeather: WeatherData | null = null
const listeners = new Set<(data: WeatherData) => void>()

function notifyListeners(data: WeatherData) {
  cachedWeather = data
  listeners.forEach((listener) => listener(data))
}

export async function fetchLiveWeather(): Promise<WeatherData> {
  const fallbackData: WeatherData = {
    city: 'İstanbul',
    country: 'TR',
    temperature: 22,
    apparentTemperature: 23,
    humidity: 55,
    windSpeed: 12,
    condition: 'Açık',
    weatherCode: 0,
    isDay: true,
    minTemp: 18,
    maxTemp: 26,
    precipitation: 0,
    loading: false,
    error: null,
  }

  try {
    let lat = 41.0082
    let lon = 28.9784
    let city = 'İstanbul'
    let country = 'TR'

    // 1. Try browser geolocation first
    const geoSuccess = await new Promise<{ lat: number; lon: number } | null>((resolve) => {
      if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          () => resolve(null),
          { timeout: 5000, maximumAge: 300000 },
        )
      } else {
        resolve(null)
      }
    })

    if (geoSuccess) {
      lat = geoSuccess.lat
      lon = geoSuccess.lon

      // Reverse geocode city name via Nominatim
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=tr`,
          { headers: { 'User-Agent': 'KapanisMiniOS/1.0' } },
        )
        if (geoRes.ok) {
          const geoJson = await geoRes.json()
          city =
            geoJson.address?.city ||
            geoJson.address?.town ||
            geoJson.address?.district ||
            geoJson.address?.province ||
            geoJson.address?.state ||
            'Konumum'
          country = geoJson.address?.country_code?.toUpperCase() || 'TR'
        }
      } catch {
        // use fallback city
      }
    } else {
      // 2. Fallback to IP Geolocation
      try {
        const ipRes = await fetch('https://ipapi.co/json/')
        if (ipRes.ok) {
          const ipJson = await ipRes.json()
          if (ipJson.latitude && ipJson.longitude) {
            lat = ipJson.latitude
            lon = ipJson.longitude
            city = ipJson.city || city
            country = ipJson.country_code || country
          }
        }
      } catch {
        // ignore IP error
      }
    }

    // 3. Fetch real-time weather from Open-Meteo
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`,
    )

    if (!weatherRes.ok) {
      throw new Error('Hava durumu servisine ulaşılamadı')
    }

    const weatherJson = await weatherRes.json()
    const current = weatherJson.current
    const daily = weatherJson.daily

    const weatherResult: WeatherData = {
      city,
      country,
      temperature: Math.round(current?.temperature_2m ?? 22),
      apparentTemperature: Math.round(current?.apparent_temperature ?? 22),
      humidity: Math.round(current?.relative_humidity_2m ?? 50),
      windSpeed: Math.round(current?.wind_speed_10m ?? 10),
      condition: getWeatherConditionText(current?.weather_code ?? 0),
      weatherCode: current?.weather_code ?? 0,
      isDay: current?.is_day === 1,
      minTemp: Math.round(daily?.temperature_2m_min?.[0] ?? (current?.temperature_2m - 4)),
      maxTemp: Math.round(daily?.temperature_2m_max?.[0] ?? (current?.temperature_2m + 4)),
      precipitation: current?.precipitation ?? 0,
      loading: false,
      error: null,
    }

    notifyListeners(weatherResult)
    return weatherResult
  } catch (err: any) {
    const errorResult: WeatherData = {
      ...fallbackData,
      loading: false,
      error: err?.message || 'Hava durumu alınamadı',
    }
    notifyListeners(errorResult)
    return errorResult
  }
}

export function useLiveWeather(): WeatherData {
  const [data, setData] = useState<WeatherData>(() => cachedWeather || {
    city: 'Yükleniyor...',
    country: 'TR',
    temperature: 24,
    apparentTemperature: 24,
    humidity: 50,
    windSpeed: 10,
    condition: 'Açık',
    weatherCode: 0,
    isDay: true,
    loading: true,
    error: null,
  })

  useEffect(() => {
    listeners.add(setData)

    if (!cachedWeather || cachedWeather.loading) {
      void fetchLiveWeather()
    }

    const interval = setInterval(() => {
      void fetchLiveWeather()
    }, 15 * 60 * 1000) // Refresh every 15 mins

    return () => {
      listeners.delete(setData)
      clearInterval(interval)
    }
  }, [])

  return data
}
