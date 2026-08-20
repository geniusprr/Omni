import React, { useEffect, useState } from 'react'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle.js'
import Check from 'lucide-react/dist/esm/icons/check.js'
import Clock3 from 'lucide-react/dist/esm/icons/clock-3.js'
import Laptop from 'lucide-react/dist/esm/icons/laptop.js'
import LogOut from 'lucide-react/dist/esm/icons/log-out.js'
import Moon from 'lucide-react/dist/esm/icons/moon.js'
import Power from 'lucide-react/dist/esm/icons/power.js'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js'
import RotateCw from 'lucide-react/dist/esm/icons/rotate-cw.js'
import ShieldAlert from 'lucide-react/dist/esm/icons/shield-alert.js'
import Smartphone from 'lucide-react/dist/esm/icons/smartphone.js'
import Sun from 'lucide-react/dist/esm/icons/sun.js'
import Wifi from 'lucide-react/dist/esm/icons/wifi.js'
import WifiOff from 'lucide-react/dist/esm/icons/wifi-off.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  fetchDeviceState,
  pairWithDeviceByCode,
  sendRemoteCommand,
  subscribeToDeviceUpdates,
} from '@/features/remote/client'
import { durationLabel, targetLabel } from '@/lib/format'
import type { DeviceRecord, RemoteCommandKind, TimerAction, TimerState } from '@/types'

interface StoredPairingInfo {
  supabaseUrl: string
  supabaseAnonKey: string
  deviceId: string
  pairingCode: string
  deviceName: string
  controllerId: string
}

export function RemoteControllerView() {
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('kapanis_remote_theme') as 'dark' | 'light') || 'dark'
  })

  function toggleTheme() {
    const next = themeMode === 'dark' ? 'light' : 'dark'
    setThemeMode(next)
    localStorage.setItem('kapanis_remote_theme', next)
  }

  const [pairingInfo, setPairingInfo] = useState<StoredPairingInfo | null>(() => {
    try {
      const item = localStorage.getItem('kapanis_remote_pair')
      return item ? JSON.parse(item) : null
    } catch {
      return null
    }
  })

  // Form states for pairing
  const [inputCode, setInputCode] = useState('')
  const [controllerName, setControllerName] = useState(() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent
      if (/iPhone/i.test(ua)) return 'iPhone'
      if (/iPad/i.test(ua)) return 'iPad'
      if (/Android/i.test(ua)) return 'Android Telefon'
      if (/Macintosh/i.test(ua)) return 'MacBook'
      return 'Web Denetleyici'
    }
    return 'Telefon'
  })
  const [pairingBusy, setPairingBusy] = useState(false)
  const [pairingError, setPairingError] = useState<string | null>(null)

  // Live device states
  const [device, setDevice] = useState<DeviceRecord | null>(null)
  const [now, setNow] = useState(Date.now())
  const [selectedMinutes, setSelectedMinutes] = useState(30)
  const [actionType, setActionType] = useState<TimerAction>('shutdown')
  const [commandBusy, setCommandBusy] = useState(false)
  const [commandSuccess, setCommandSuccess] = useState<string | null>(null)
  const [commandError, setCommandError] = useState<string | null>(null)

  // Check URL query parameters for auto-pairing (?pair=CODE&supabaseUrl=...&supabaseKey=...)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const codeParam = params.get('pair')
    const urlParam = params.get('supabaseUrl') || (import.meta.env.VITE_SUPABASE_URL as string) || ''
    const keyParam = params.get('supabaseKey') || (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || ''

    if (urlParam) localStorage.setItem('kapanis_supabase_url', urlParam)
    if (keyParam) localStorage.setItem('kapanis_supabase_key', keyParam)

    if (codeParam && urlParam && keyParam && !pairingInfo) {
      setInputCode(codeParam.toUpperCase())
      void performPairing(urlParam, keyParam, codeParam.toUpperCase())
    }
  }, [])

  // Timer tick
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Subscribe to device updates
  useEffect(() => {
    if (!pairingInfo) return
    let active = true

    void fetchDeviceState(pairingInfo.supabaseUrl, pairingInfo.supabaseAnonKey, pairingInfo.deviceId).then((d) => {
      if (active && d) setDevice(d)
    })

    const unsubscribe = subscribeToDeviceUpdates(
      pairingInfo.supabaseUrl,
      pairingInfo.supabaseAnonKey,
      pairingInfo.deviceId,
      (updatedDevice) => {
        if (active) setDevice(updatedDevice)
      },
    )

    // Periodic poll in case Realtime misses something
    const pollInterval = setInterval(() => {
      void fetchDeviceState(pairingInfo.supabaseUrl, pairingInfo.supabaseAnonKey, pairingInfo.deviceId).then((d) => {
        if (active && d) setDevice(d)
      })
    }, 4000)

    return () => {
      active = false
      unsubscribe()
      clearInterval(pollInterval)
    }
  }, [pairingInfo])

  async function performPairing(url: string, key: string, code: string) {
    setPairingBusy(true)
    setPairingError(null)
    try {
      const result = await pairWithDeviceByCode(url, key, code, controllerName)
      if (result.success && result.device && result.controllerId) {
        const info: StoredPairingInfo = {
          supabaseUrl: url,
          supabaseAnonKey: key,
          deviceId: result.device.id,
          pairingCode: result.device.pairingCode,
          deviceName: result.device.name,
          controllerId: result.controllerId,
        }
        setPairingInfo(info)
        setDevice(result.device)
        localStorage.setItem('kapanis_remote_pair', JSON.stringify(info))
      } else {
        setPairingError(result.message || 'Eşleştirme başarısız.')
      }
    } catch (e) {
      setPairingError(e instanceof Error ? e.message : 'Bağlantı hatası.')
    } finally {
      setPairingBusy(false)
    }
  }

  async function handleManualPairSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!inputCode.trim()) return
    const url = (import.meta.env.VITE_SUPABASE_URL as string) || localStorage.getItem('kapanis_supabase_url') || ''
    const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || localStorage.getItem('kapanis_supabase_key') || ''
    if (!url || !key) {
      setPairingError('Supabase bağlantı bilgisi bulunamadı. Lütfen QR kod ile veya doğrudan bağlantı linkiyle eşleştirin.')
      return
    }
    await performPairing(url, key, inputCode.trim().toUpperCase())
  }

  async function handleRefreshState() {
    if (!pairingInfo) return
    const d = await fetchDeviceState(pairingInfo.supabaseUrl, pairingInfo.supabaseAnonKey, pairingInfo.deviceId)
    if (d) setDevice(d)
  }

  function handleUnpair() {
    setPairingInfo(null)
    setDevice(null)
    localStorage.removeItem('kapanis_remote_pair')
  }

  async function handleSendCommand(cmd: RemoteCommandKind, delaySeconds: number) {
    if (!pairingInfo) return
    setCommandBusy(true)
    setCommandError(null)
    setCommandSuccess(null)
    try {
      const res = await sendRemoteCommand(
        pairingInfo.supabaseUrl,
        pairingInfo.supabaseAnonKey,
        pairingInfo.deviceId,
        pairingInfo.controllerId,
        cmd,
        delaySeconds,
      )
      if (res.success) {
        setCommandSuccess(
          cmd === 'cancel'
            ? 'Kapatma planı iptal edildi!'
            : cmd === 'shutdown'
            ? delaySeconds === 0
              ? 'Kapatma komutu iletildi! Bilgisayar kapanıyor...'
              : `${Math.round(delaySeconds / 60)} dakika sonra kapatma planlandı.`
            : 'Yeniden başlatma komutu iletildi!',
        )
        setTimeout(() => setCommandSuccess(null), 4000)
      } else {
        setCommandError(res.message || 'Komut gönderilemedi.')
      }
    } catch (e) {
      setCommandError(e instanceof Error ? e.message : 'Hata oluştu.')
    } finally {
      setCommandBusy(false)
    }
  }

  // Heartbeat freshness calculation
  const isOnline = Boolean(
    device &&
    device.isOnline &&
    device.lastSeenAt &&
    Date.now() - new Date(device.lastSeenAt).getTime() < 45000,
  )

  const lastSeenSec = device?.lastSeenAt
    ? Math.max(0, Math.floor((now - new Date(device.lastSeenAt).getTime()) / 1000))
    : null

  const activeTimer: TimerState | null =
    device?.timerState && device.timerState.targetAt > now ? device.timerState : null

  const remainingSeconds = activeTimer ? Math.max(0, Math.ceil((activeTimer.targetAt - now) / 1000)) : 0

  if (!pairingInfo) {
    return (
      <div className={`remote-container ${themeMode === 'light' ? 'remote-container--light' : 'remote-container--dark'}`}>
        <div className="remote-card">
          <header className="remote-header">
            <div className="remote-header-top-row">
              <div className="brand-mark"><span /></div>
              <button
                type="button"
                className="remote-theme-btn"
                onClick={toggleTheme}
                title={themeMode === 'dark' ? 'Açık Temaya Geç' : 'Koyu Temaya Geç'}
              >
                {themeMode === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              </button>
            </div>
            <h2>kapanış. Remote</h2>
            <p>Bilgisayarını telefonundan veya başka bir cihazdan yönet.</p>
          </header>

          <form className="remote-form" onSubmit={handleManualPairSubmit}>
            <div className="compact-field">
              <Label htmlFor="remote-code-input">Eşleştirme Kodu</Label>
              <Input
                id="remote-code-input"
                className="remote-code-input"
                maxLength={8}
                placeholder="KAP-8392"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              />
              <span className="field-hint">Bilgisayarındaki Ayarlar sekmesinde görünen kod.</span>
            </div>

            <div className="compact-field">
              <Label htmlFor="controller-name-input">Bu Cihazın Adı</Label>
              <Input
                id="controller-name-input"
                value={controllerName}
                onChange={(e) => setControllerName(e.target.value)}
              />
            </div>

            <Button
              className="remote-submit-btn"
              variant="accent"
              type="submit"
              disabled={pairingBusy || !inputCode.trim()}
            >
              {pairingBusy ? 'Eşleştiriliyor…' : 'Bilgisayara Bağlan'}
            </Button>

            {pairingError ? (
              <div className="remote-error-alert">
                <AlertTriangle size={15} /> {pairingError}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className={`remote-container ${themeMode === 'light' ? 'remote-container--light' : 'remote-container--dark'}`}>
      <div className="remote-card remote-card--active">
        {/* Device Status Top Bar */}
        <header className="remote-active-header">
          <div className="remote-device-title">
            <div className="remote-device-icon"><Laptop size={18} /></div>
            <div>
              <h3>{device?.name || pairingInfo.deviceName}</h3>
              <div className="remote-status-row">
                {isOnline ? (
                  <span className="remote-status remote-status--online">
                    <span className="status-badge__dot" /> Çevrim içi
                    {lastSeenSec !== null ? ` · ${lastSeenSec < 5 ? 'az önce' : `${lastSeenSec} sn önce`}` : ''}
                  </span>
                ) : (
                  <span className="remote-status remote-status--offline">
                    <WifiOff size={12} /> Çevrimdışı / Kapalı
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="remote-header-actions">
            <Button size="compact" variant="ghost" title="Tema Değiştir" onClick={toggleTheme}>
              {themeMode === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </Button>
            <Button size="compact" variant="ghost" title="Yenile" onClick={() => void handleRefreshState()}>
              <RefreshCw size={14} />
            </Button>
            <Button size="compact" variant="ghost" title="Eşleştirmeyi Kaldır" onClick={handleUnpair}>
              <LogOut size={15} />
            </Button>
          </div>
        </header>

        {/* Active Timer Banner if any */}
        {activeTimer ? (
          <div className="remote-active-timer-box">
            <div className="remote-timer-top">
              <span className="active-state-dot" />
              <strong>{activeTimer.action === 'restart' ? 'Yeniden Başlatma Planı' : 'Kapatma Planı'}</strong>
            </div>
            <div className="remote-countdown">{durationLabel(remainingSeconds)}</div>
            <p className="remote-target-time">
              <Clock3 size={14} /> Hedef: {targetLabel(activeTimer.targetAt)}
            </p>
            <Button
              className="remote-cancel-btn"
              variant="danger"
              disabled={commandBusy}
              onClick={() => void handleSendCommand('cancel', 0)}
            >
              <X size={16} /> Planı İptal Et
            </Button>
          </div>
        ) : null}

        {/* Quick Power Actions */}
        <div className="remote-actions-section">
          <h4>Güç İşlemleri</h4>

          <div className="remote-action-buttons">
            <Button
              className="remote-btn remote-btn--instant-power"
              variant="danger"
              disabled={commandBusy || !isOnline}
              onClick={() => {
                if (window.confirm('Bilgisayar hemen kapatılacak. Onaylıyor musunuz?')) {
                  void handleSendCommand('shutdown', 0)
                }
              }}
            >
              <Power size={18} /> Şimdi Kapat
            </Button>

            <Button
              className="remote-btn"
              variant="soft"
              disabled={commandBusy || !isOnline}
              onClick={() => {
                if (window.confirm('Bilgisayar yeniden başlatılacak. Onaylıyor musunuz?')) {
                  void handleSendCommand('restart', 0)
                }
              }}
            >
              <RotateCw size={18} /> Yeniden Başlat
            </Button>
          </div>

          {/* Timed Shutdown Form */}
          <div className="remote-preset-section">
            <Label>Süreli Kapatma Planla</Label>
            <div className="remote-preset-grid">
              {[5, 15, 30, 60, 120, 240].map((mins) => (
                <button
                  type="button"
                  key={mins}
                  className={`remote-preset-chip ${selectedMinutes === mins ? 'active' : ''}`}
                  onClick={() => setSelectedMinutes(mins)}
                >
                  {mins >= 60 ? `${mins / 60} saat` : `${mins} dk`}
                </button>
              ))}
            </div>

            <Button
              className="remote-schedule-btn"
              variant="accent"
              disabled={commandBusy || !isOnline}
              onClick={() => void handleSendCommand('shutdown', selectedMinutes * 60)}
            >
              <Clock3 size={16} /> {selectedMinutes >= 60 ? `${selectedMinutes / 60} Saat` : `${selectedMinutes} Dakika`} Sonra Kapat
            </Button>
          </div>
        </div>

        {/* Feedback alerts */}
        {commandSuccess ? (
          <div className="remote-success-alert">
            <Check size={16} /> {commandSuccess}
          </div>
        ) : null}

        {commandError ? (
          <div className="remote-error-alert">
            <AlertTriangle size={16} /> {commandError}
          </div>
        ) : null}

        <footer className="remote-footer">
          <small>kapanış. Windows Güç Yöneticisi</small>
        </footer>
      </div>
    </div>
  )
}
