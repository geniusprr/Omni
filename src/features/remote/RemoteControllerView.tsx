import React, { useEffect, useState } from 'react'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle.js'
import Bell from 'lucide-react/dist/esm/icons/bell.js'
import BellRing from 'lucide-react/dist/esm/icons/bell-ring.js'
import Check from 'lucide-react/dist/esm/icons/check.js'
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.js'
import Clock3 from 'lucide-react/dist/esm/icons/clock-3.js'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js'
import Laptop from 'lucide-react/dist/esm/icons/laptop.js'
import LogOut from 'lucide-react/dist/esm/icons/log-out.js'
import Moon from 'lucide-react/dist/esm/icons/moon.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import Power from 'lucide-react/dist/esm/icons/power.js'
import QrCode from 'lucide-react/dist/esm/icons/qr-code.js'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js'
import RotateCw from 'lucide-react/dist/esm/icons/rotate-cw.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import ShieldAlert from 'lucide-react/dist/esm/icons/shield-alert.js'
import Smartphone from 'lucide-react/dist/esm/icons/smartphone.js'
import Sun from 'lucide-react/dist/esm/icons/sun.js'
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js'
import Volume2 from 'lucide-react/dist/esm/icons/volume-2.js'
import VolumeX from 'lucide-react/dist/esm/icons/volume-x.js'
import Wifi from 'lucide-react/dist/esm/icons/wifi.js'
import WifiOff from 'lucide-react/dist/esm/icons/wifi-off.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  fetchDeviceNotifications,
  fetchDeviceState,
  getActivePC,
  getStoredPCs,
  parsePairingPayload,
  pairWithPayload,
  pairWithDeviceByCode,
  removeStoredPC,
  saveStoredPC,
  sendRemoteCommand,
  setActivePCId,
  subscribeToDeviceNotifications,
  subscribeToDeviceUpdates,
} from '@/features/remote/client'
import { durationLabel, targetLabel } from '@/lib/format'
import type { DeviceRecord, MirroredNotification, PairedPcDevice, RemoteCommandKind, TimerAction, TimerState } from '@/types'

export function RemoteControllerView() {
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('kapanis_remote_theme') as 'dark' | 'light') || 'dark'
  })

  function toggleTheme() {
    const next = themeMode === 'dark' ? 'light' : 'dark'
    setThemeMode(next)
    localStorage.setItem('kapanis_remote_theme', next)
  }

  // Multi-PC state
  const [savedPcs, setSavedPcs] = useState<PairedPcDevice[]>(() => getStoredPCs())
  const [activePc, setActivePc] = useState<PairedPcDevice | null>(() => getActivePC())
  const [showPcMenu, setShowPcMenu] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addInput, setAddInput] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Live active device state
  const [deviceState, setDeviceState] = useState<DeviceRecord | null>(null)
  const [now, setNow] = useState(Date.now())
  const [selectedMinutes, setSelectedMinutes] = useState(30)
  const [commandBusy, setCommandBusy] = useState(false)
  const [commandSuccess, setCommandSuccess] = useState<string | null>(null)
  const [commandError, setCommandError] = useState<string | null>(null)

  // Notification states
  const [activeTab, setActiveTab] = useState<'power' | 'notifications'>('power')
  const [notifications, setNotifications] = useState<MirroredNotification[]>([])
  const [selectedFilter, setSelectedFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(() => {
    return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  })

  function refreshPcsList() {
    const pcs = getStoredPCs()
    setSavedPcs(pcs)
    const current = getActivePC()
    setActivePc(current)
  }

  function handleSelectPc(pcId: string) {
    setActivePCId(pcId)
    refreshPcsList()
    setShowPcMenu(false)
    setDeviceState(null)
    setNotifications([])
  }

  function handleRemovePc(pcId: string, name: string) {
    if (window.confirm(`"${name}" bilgisayarını eşleştirmelerden kaldırmak istediğinize emin misiniz?`)) {
      removeStoredPC(pcId)
      refreshPcsList()
      setShowPcMenu(false)
    }
  }

  // Web Audio Chime
  function playNotificationChime() {
    if (!soundEnabled || typeof window === 'undefined') return
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, ctx.currentTime)
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.45)
    } catch {}
  }

  function handleRequestPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    Notification.requestPermission().then((perm) => {
      setBrowserPermission(perm)
      if (perm === 'granted') {
        try {
          new Notification('Eon Remote', { body: 'PC bildirim aynalama başarıyla aktifleştirildi!' })
        } catch {}
      }
    })
  }

  // Handle URL auto-pairing on load (?pair_data=... or ?pair=...&supabaseUrl=...)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const pairData = params.get('pair_data')
    const codeParam = params.get('pair')
    const urlParam = params.get('supabaseUrl') || (import.meta.env.VITE_SUPABASE_URL as string) || ''
    const keyParam = params.get('supabaseKey') || (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || ''

    if (pairData) {
      const parsed = parsePairingPayload(pairData)
      if (parsed) {
        void pairWithPayload(parsed).then((res) => {
          if (res.success) {
            refreshPcsList()
            window.history.replaceState({}, '', window.location.pathname)
          }
        })
      }
    } else if (codeParam && urlParam && keyParam) {
      void pairWithDeviceByCode(urlParam, keyParam, codeParam.toUpperCase(), 'Mobil Cihaz').then((res) => {
        if (res.success && res.device) {
          const pcDevice: PairedPcDevice = {
            id: res.device.id,
            name: res.device.name,
            pairingCode: res.device.pairingCode,
            pairingSecret: res.device.pairingSecret,
            supabaseUrl: urlParam,
            supabaseAnonKey: keyParam,
            isOnline: res.device.isOnline,
            lastSeenAt: res.device.lastSeenAt,
          }
          saveStoredPC(pcDevice)
          refreshPcsList()
          window.history.replaceState({}, '', window.location.pathname)
        }
      })
    }
  }, [])

  // Timer interval
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Subscribe to active PC updates & notifications
  useEffect(() => {
    if (!activePc || !activePc.supabaseUrl || !activePc.supabaseAnonKey) return
    let active = true

    void fetchDeviceState(activePc.supabaseUrl, activePc.supabaseAnonKey, activePc.id).then((d) => {
      if (active && d) setDeviceState(d)
    })

    void fetchDeviceNotifications(activePc.supabaseUrl, activePc.supabaseAnonKey, activePc.id).then((list) => {
      if (active && list.length > 0) setNotifications(list)
    })

    const unsubscribe = subscribeToDeviceUpdates(
      activePc.supabaseUrl,
      activePc.supabaseAnonKey,
      activePc.id,
      (updatedDevice) => {
        if (active) setDeviceState(updatedDevice)
      },
    )

    const unsubscribeNotifs = subscribeToDeviceNotifications(
      activePc.supabaseUrl,
      activePc.supabaseAnonKey,
      activePc.id,
      (newNotif) => {
        if (!active) return
        setNotifications((prev) => {
          if (prev.some((n) => n.id === newNotif.id)) return prev
          return [newNotif, ...prev].slice(0, 100)
        })
        playNotificationChime()
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(newNotif.appName || 'PC Bildirimi', {
              body: (newNotif.title ? newNotif.title + ': ' : '') + (newNotif.body || ''),
            })
          } catch {}
        }
      },
    )

    const pollInterval = setInterval(() => {
      void fetchDeviceState(activePc.supabaseUrl, activePc.supabaseAnonKey, activePc.id).then((d) => {
        if (active && d) setDeviceState(d)
      })
    }, 4000)

    return () => {
      active = false
      unsubscribe()
      unsubscribeNotifs()
      clearInterval(pollInterval)
    }
  }, [activePc?.id, soundEnabled])

  async function handleAddPcSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAddBusy(true)
    setAddError(null)

    const input = addInput.trim()
    if (!input) {
      setAddBusy(false)
      return
    }

    // 1. Try parsing as full pairing payload / link
    const payload = parsePairingPayload(input)
    if (payload) {
      try {
        const res = await pairWithPayload(payload)
        if (res.success && res.device) {
          refreshPcsList()
          setShowAddModal(false)
          setAddInput('')
          setAddBusy(false)
          return
        }
      } catch (err: any) {
        setAddError(err?.message || 'Eşleştirme başarısız.')
        setAddBusy(false)
        return
      }
    }

    // 2. Try as manual pairing code with fallback env/cached URL
    const envUrl = (import.meta.env.VITE_SUPABASE_URL as string) || (activePc?.supabaseUrl || '')
    const envKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || (activePc?.supabaseAnonKey || '')

    if (envUrl && envKey) {
      try {
        const res = await pairWithDeviceByCode(envUrl, envKey, input.toUpperCase(), 'Mobil Cihaz')
        if (res.success && res.device) {
          const pcDevice: PairedPcDevice = {
            id: res.device.id,
            name: res.device.name,
            pairingCode: res.device.pairingCode,
            pairingSecret: res.device.pairingSecret,
            supabaseUrl: envUrl,
            supabaseAnonKey: envKey,
            isOnline: res.device.isOnline,
            lastSeenAt: res.device.lastSeenAt,
          }
          saveStoredPC(pcDevice)
          refreshPcsList()
          setShowAddModal(false)
          setAddInput('')
          setAddBusy(false)
          return
        }
        setAddError(res.message || 'Bilgisayar bulunamadı.')
      } catch (err: any) {
        setAddError(err?.message || 'Bağlantı hatası.')
      }
    } else {
      setAddError('Lütfen bilgisayar ekranındaki QR kodu okutun veya Eşleştirme Linkini yapıştırın.')
    }

    setAddBusy(false)
  }

  async function handleSendCommand(command: RemoteCommandKind, delaySeconds = 0) {
    if (!activePc) return
    setCommandBusy(true)
    setCommandSuccess(null)
    setCommandError(null)
    try {
      const res = await sendRemoteCommand(
        activePc.supabaseUrl,
        activePc.supabaseAnonKey,
        activePc.id,
        command,
        delaySeconds,
        'mobile',
      )
      if (res.success) {
        setCommandSuccess(
          command === 'cancel'
            ? 'Plan iptal edildi.'
            : command === 'restart'
              ? 'Yeniden başlatma komutu iletildi.'
              : 'Kapatma komutu iletildi.',
        )
        setTimeout(() => setCommandSuccess(null), 3000)
      } else {
        setCommandError(res.message || 'Komut iletilemedi.')
      }
    } catch {
      setCommandError('Komut gönderilirken hata oluştu.')
    } finally {
      setCommandBusy(false)
    }
  }

  const isOnline = Boolean(deviceState?.isOnline)
  const lastSeenSec = deviceState?.lastSeenAt
    ? Math.max(0, Math.floor((now - new Date(deviceState.lastSeenAt).getTime()) / 1000))
    : null

  const activeTimer: TimerState | null = deviceState?.timerState || null
  const remainingSeconds = activeTimer
    ? Math.max(0, Math.ceil((activeTimer.targetAt - now) / 1000))
    : 0

  // Filtered notifications
  const filteredNotifications = notifications.filter((n) => {
    if (selectedFilter !== 'all' && !n.appName.toLowerCase().includes(selectedFilter.toLowerCase())) {
      return false
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const matchTitle = (n.title || '').toLowerCase().includes(q)
      const matchBody = (n.body || '').toLowerCase().includes(q)
      const matchApp = (n.appName || '').toLowerCase().includes(q)
      return matchTitle || matchBody || matchApp
    }
    return true
  })

  // If no saved PCs, show initial Welcome / Pairing Screen
  if (!activePc || savedPcs.length === 0) {
    return (
      <div className={`remote-container ${themeMode === 'light' ? 'remote-container--light' : 'remote-container--dark'}`}>
        <div className="remote-card">
          <header className="remote-card__header" style={{ position: 'relative' }}>
            <div className="remote-card__brand">
              <div className="remote-card__logo">O</div>
              <h2>Eon <span style={{ fontWeight: 400, fontSize: '0.9rem', color: '#94a3b8' }}>Kumanda</span></h2>
            </div>
            <Button size="compact" variant="ghost" title="Tema Değiştir" onClick={toggleTheme}>
              {themeMode === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </Button>
          </header>

          <div style={{ textAlign: 'center', padding: '16px 8px' }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
              <QrCode size={32} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '6px' }}>Bilgisayarınızı Eşleştirin</h3>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.4, marginBottom: '20px' }}>
              Bilgisayarınızdaki <strong>Eon</strong> uygulamasının Ayarlar sekmesindeki QR kodu okutun veya bağlantı linkini yapıştırın.
            </p>

            <form onSubmit={handleAddPcSubmit}>
              <Input
                value={addInput}
                placeholder="Eşleştirme Linki, QR verisi veya KAP-XXXX"
                style={{ height: 48, fontSize: '0.9rem', textAlign: 'center', marginBottom: '12px' }}
                onChange={(e) => setAddInput(e.target.value)}
              />
              <Button
                variant="accent"
                type="submit"
                style={{ width: '100%', height: 44, fontWeight: 700 }}
                disabled={addBusy || !addInput.trim()}
              >
                {addBusy ? 'Eşleştiriliyor…' : 'Bilgisayara Bağlan'}
              </Button>

              {addError && (
                <div className="remote-error-alert" style={{ marginTop: '12px' }}>
                  <AlertTriangle size={15} /> {addError}
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`remote-container ${themeMode === 'light' ? 'remote-container--light' : 'remote-container--dark'}`}>
      <div className="remote-card remote-card--active">
        {/* Device Status Top Bar with Multi-PC Switcher */}
        <header className="remote-active-header" style={{ position: 'relative' }}>
          <div
            className="remote-device-title"
            style={{ cursor: 'pointer', padding: '4px 6px', borderRadius: '8px', transition: 'background 0.15s' }}
            onClick={() => setShowPcMenu(!showPcMenu)}
          >
            <div className="remote-device-icon"><Laptop size={18} /></div>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {activePc.name} <ChevronDown size={14} color="#94a3b8" />
              </h3>
              <div className="remote-status-row">
                {isOnline ? (
                  <span className="remote-status remote-status--online">
                    <span className="status-badge__dot" /> Çevrim içi
                    {lastSeenSec !== null ? ` · ${lastSeenSec < 5 ? 'az önce' : `${lastSeenSec} sn önce`}` : ''}
                  </span>
                ) : (
                  <span className="remote-status remote-status--offline">
                    <WifiOff size={12} /> Çevrimdışı
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="remote-header-actions">
            <Button size="compact" variant="ghost" title="Yeni PC Ekle" onClick={() => setShowAddModal(true)}>
              <Plus size={16} />
            </Button>
            <Button size="compact" variant="ghost" title="Tema Değiştir" onClick={toggleTheme}>
              {themeMode === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </Button>
            <Button size="compact" variant="ghost" title="Yenile" onClick={() => refreshPcsList()}>
              <RefreshCw size={14} />
            </Button>
          </div>

          {/* Multi-PC Switcher Dropdown */}
          {showPcMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 12,
                right: 12,
                marginTop: 6,
                background: themeMode === 'light' ? '#ffffff' : '#141a29',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 14,
                boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
                zIndex: 100,
                padding: '8px',
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', padding: '6px 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Kayıtlı Bilgisayarlar ({savedPcs.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                {savedPcs.map((pc) => (
                  <div
                    key={pc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: pc.id === activePc.id ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleSelectPc(pc.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Laptop size={15} color={pc.id === activePc.id ? '#38bdf8' : '#94a3b8'} />
                      <span style={{ fontWeight: pc.id === activePc.id ? 700 : 500, fontSize: '0.88rem' }}>
                        {pc.name}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {pc.id === activePc.id && <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700 }}>Aktif</span>}
                      <button
                        type="button"
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px' }}
                        title="Bilgisayarı Kaldır"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemovePc(pc.id, pc.name)
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '6px', paddingTop: '6px' }}>
                <Button
                  size="compact"
                  variant="soft"
                  style={{ width: '100%', justifyContent: 'center', gap: '6px', fontSize: '0.8rem' }}
                  onClick={() => {
                    setShowPcMenu(false)
                    setShowAddModal(true)
                  }}
                >
                  <Plus size={14} /> Yeni Bilgisayar Ekle
                </Button>
              </div>
            </div>
          )}
        </header>

        {/* Modal: Add New PC */}
        {showAddModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(8px)',
              zIndex: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 400,
                background: themeMode === 'light' ? '#ffffff' : '#161d2b',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 18,
                padding: 20,
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <strong style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={18} color="#38bdf8" /> Yeni Bilgisayar Ekle
                </strong>
                <button
                  type="button"
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                  onClick={() => setShowAddModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <p style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.35, marginBottom: 14 }}>
                Yeni bilgisayarınızdaki Eon uygulamasından <strong>Eşleştirme Linkini</strong> veya <strong>QR Verisini</strong> yapıştırın.
              </p>

              <form onSubmit={handleAddPcSubmit}>
                <Input
                  value={addInput}
                  placeholder="Eşleştirme linki veya kodu..."
                  style={{ marginBottom: 12 }}
                  onChange={(e) => setAddInput(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    type="button"
                    variant="ghost"
                    style={{ flex: 1 }}
                    onClick={() => setShowAddModal(false)}
                  >
                    İptal
                  </Button>
                  <Button
                    type="submit"
                    variant="accent"
                    style={{ flex: 1 }}
                    disabled={addBusy || !addInput.trim()}
                  >
                    {addBusy ? 'Eşleştiriliyor…' : 'Ekle'}
                  </Button>
                </div>
                {addError && (
                  <div className="remote-error-alert" style={{ marginTop: 10 }}>
                    <AlertTriangle size={14} /> {addError}
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '10px' }}>
          <button
            type="button"
            style={{
              flex: 1,
              padding: '8px 10px',
              border: 'none',
              borderRadius: '7px',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              background: activeTab === 'power' ? 'rgba(56, 189, 248, 0.18)' : 'transparent',
              color: activeTab === 'power' ? '#38bdf8' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s',
            }}
            onClick={() => setActiveTab('power')}
          >
            <Power size={14} /> Güç Yönetimi
          </button>
          <button
            type="button"
            style={{
              flex: 1,
              padding: '8px 10px',
              border: 'none',
              borderRadius: '7px',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              background: activeTab === 'notifications' ? 'rgba(56, 189, 248, 0.18)' : 'transparent',
              color: activeTab === 'notifications' ? '#38bdf8' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s',
            }}
            onClick={() => setActiveTab('notifications')}
          >
            <Bell size={14} /> PC Bildirimleri {notifications.length > 0 ? `(${notifications.length})` : ''}
          </button>
        </div>

        {/* TAB 1: POWER CONTROLS */}
        {activeTab === 'power' && (
          <>
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
          </>
        )}

        {/* TAB 2: NOTIFICATIONS CENTER */}
        {activeTab === 'notifications' && (
          <div className="remote-actions-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4>PC Bildirim Aynalama</h4>
              <div style={{ display: 'flex', gap: '6px' }}>
                <Button
                  size="compact"
                  variant="ghost"
                  title={soundEnabled ? 'Sesi Kapat' : 'Sesi Aç'}
                  onClick={() => setSoundEnabled(!soundEnabled)}
                >
                  {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                </Button>
                <Button
                  size="compact"
                  variant="ghost"
                  title="Bildirimleri Temizle"
                  onClick={() => setNotifications([])}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>

            {/* Notification Permission Prompt */}
            {browserPermission !== 'granted' && (
              <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '10px', padding: '10px 12px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.78rem', color: '#e2e8f0' }}>
                  <strong>Pop-up Bildirimleri:</strong> Telefonda bildirim almak için izin verin.
                </div>
                <Button size="compact" variant="accent" style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={handleRequestPermission}>
                  İzni Aç
                </Button>
              </div>
            )}

            {/* Category Filter Chips */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '8px' }}>
              {['all', 'WhatsApp', 'Discord', 'Chrome', 'Outlook', 'Telegram', 'Sistem'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: '999px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: selectedFilter === cat ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.04)',
                    color: selectedFilter === cat ? '#38bdf8' : '#94a3b8',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => setSelectedFilter(cat)}
                >
                  {cat === 'all' ? 'Tümü' : cat}
                </button>
              ))}
            </div>

            {/* Search Box */}
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <Input
                placeholder="Bildirimlerde ara..."
                value={searchQuery}
                style={{ height: '34px', fontSize: '0.8rem', paddingLeft: '28px' }}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search size={13} style={{ position: 'absolute', left: 9, top: 11, color: '#94a3b8' }} />
            </div>

            {/* ntfy.sh Lock Screen Guide */}
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <strong style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <BellRing size={13} color="#38bdf8" /> Kilit Ekranı (ntfy.sh)
                </strong>
                <a
                  href={`https://ntfy.sh/${activePc.ntfyTopic || `kapanis_${activePc.id.slice(0, 8)}`}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '0.75rem', color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                >
                  Abone Ol <ExternalLink size={11} />
                </a>
              </div>
              <p style={{ fontSize: '0.74rem', color: '#94a3b8', margin: 0, lineHeight: 1.35 }}>
                Ekran kilitliyken ve tarayıcı kapalıyken bildirim almak için ücretsiz <strong>ntfy</strong> uygulamasını yükleyebilirsiniz.
              </p>
            </div>

            {/* Notifications Feed */}
            {filteredNotifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 12px', color: '#94a3b8', fontSize: '0.85rem' }}>
                <div style={{ fontSize: '1.8rem', marginBottom: '6px' }}>🔔</div>
                {searchQuery || selectedFilter !== 'all' ? 'Aranan kritere uygun bildirim bulunamadı.' : 'Henüz yeni bir PC bildirimi yok.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto' }}>
                {filteredNotifications.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.07)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                        {n.appName}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                        {new Date(n.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {n.title && <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#f8fafc', marginBottom: '2px' }}>{n.title}</div>}
                    {n.body && <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.35, wordBreak: 'break-word' }}>{n.body}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
          <small>Eon Windows Güç Yöneticisi</small>
        </footer>
      </div>
    </div>
  )
}
