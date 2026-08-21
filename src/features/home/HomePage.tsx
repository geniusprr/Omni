import React, { useMemo, useState } from 'react'
import AlarmClock from 'lucide-react/dist/esm/icons/alarm-clock.js'
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right.js'
import BookOpen from 'lucide-react/dist/esm/icons/book-open.js'
import Calendar from 'lucide-react/dist/esm/icons/calendar.js'
import Check from 'lucide-react/dist/esm/icons/check.js'
import Clock3 from 'lucide-react/dist/esm/icons/clock-3.js'
import FilePlus from 'lucide-react/dist/esm/icons/file-plus.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import Power from 'lucide-react/dist/esm/icons/power.js'
import RotateCw from 'lucide-react/dist/esm/icons/rotate-cw.js'
import Share2 from 'lucide-react/dist/esm/icons/share-2.js'
import Smartphone from 'lucide-react/dist/esm/icons/smartphone.js'
import Sparkles from 'lucide-react/dist/esm/icons/sparkles.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { tabStore } from '@/features/notes/stores/tabStore'
import { useVault, vaultStore } from '@/features/notes/stores/vaultStore'
import { alarmTimeLabel, durationLabel, targetLabel } from '@/lib/format'
import type { Alarm, RemoteConnectionStatus, TimerAction, TimerState } from '@/types'
import type { AppMode } from '@/components/layout/FloatingTaskbar'

interface HomePageProps {
  timer: TimerState | null
  now: number
  alarms: Alarm[]
  connectionStatus: RemoteConnectionStatus
  deviceName: string
  pairingCode: string
  onSchedulePower: (action: TimerAction, seconds: number) => Promise<void>
  onCancelPower: () => Promise<void>
  onNavigate: (mode: AppMode) => void
}

export function HomePage({
  timer,
  now,
  alarms,
  connectionStatus,
  deviceName,
  pairingCode,
  onSchedulePower,
  onCancelPower,
  onNavigate,
}: HomePageProps) {
  const { entries } = useVault()
  const [quickNote, setQuickNote] = useState('')
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [powerAction, setPowerAction] = useState<TimerAction>('shutdown')
  const [noteSavedFeedback, setNoteSavedFeedback] = useState(false)

  // Greeting based on current hour
  const greeting = useMemo(() => {
    const hour = new Date(now).getHours()
    if (hour >= 5 && hour < 12) return 'Günaydın'
    if (hour >= 12 && hour < 18) return 'İyi günler'
    if (hour >= 18 && hour < 23) return 'İyi akşamlar'
    return 'İyi geceler'
  }, [now])

  const formattedDate = useMemo(() => {
    return new Date(now).toLocaleDateString('tr-TR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  }, [now])

  const mdFiles = useMemo(() => {
    return entries
      .filter((e) => !e.isDir && e.path.toLowerCase().endsWith('.md'))
      .sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0))
      .slice(0, 4)
  }, [entries])

  const nextAlarm = useMemo(() => {
    if (alarms.length === 0) return null
    return [...alarms].sort((a, b) => a.timestamp - b.timestamp)[0]
  }, [alarms])

  const remainingSeconds = timer ? Math.max(0, Math.ceil((timer.targetAt - now) / 1000)) : 0

  async function handleSaveQuickNote() {
    const trimmed = quickNote.trim()
    if (!trimmed || isSavingNote) return
    setIsSavingNote(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const noteTitle = `Hızlı Not ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')}`
      const fullPath = `Hızlı Notlar/${noteTitle}.md`
      const content = `# ${noteTitle}\n\n${trimmed}\n\n*Tarih: ${today}*`
      
      await vaultStore.createNote(fullPath, content)
      setQuickNote('')
      setNoteSavedFeedback(true)
      setTimeout(() => setNoteSavedFeedback(false), 2000)
    } finally {
      setIsSavingNote(false)
    }
  }

  function handleOpenDailyNote() {
    const today = new Date().toISOString().split('T')[0]
    const dailyPath = `Günlük/${today}.md`
    tabStore.openTab(dailyPath)
    onNavigate('notes')
  }

  return (
    <div className="home-dashboard">
      {/* Hero / Greeting Bar */}
      <header className="home-hero">
        <div className="home-hero__text">
          <span className="home-hero__date">{formattedDate}</span>
          <h1 className="home-hero__greeting">
            {greeting}, <span className="home-hero__username">{deviceName || 'Genius'}</span>
          </h1>
        </div>

        <div className="home-hero__chips">
          <div className="home-hero-chip">
            <span
              className={`hero-chip-dot ${connectionStatus === 'connected' ? 'hero-chip-dot--online' : ''}`}
            />
            <span>{connectionStatus === 'connected' ? 'Çevrim İçi' : 'Yerel Mod'}</span>
          </div>
          {timer && (
            <div className="home-hero-chip home-hero-chip--active">
              <Power size={13} className="text-amber-400" />
              <span>{timer.action === 'restart' ? 'Yeniden Başlatma' : 'Kapatma'}: {durationLabel(remainingSeconds)}</span>
            </div>
          )}
        </div>
      </header>

      {/* Widgets Grid */}
      <div className="home-widgets-grid">
        {/* WIDGET 1: Güç Sayacı & Hızlı Kapatma */}
        <div className="home-widget-card home-widget-card--power">
          <div className="widget-card__header">
            <div className="widget-card__title">
              <Power size={16} className="text-amber-400" />
              <span>Güç Sayacı</span>
            </div>
            <button
              type="button"
              className="widget-card__link-btn"
              onClick={() => onNavigate('power')}
            >
              <span>Yönet</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <div className="widget-card__content">
            {timer ? (
              <div className="widget-power-active">
                <div className="widget-power-countdown">{durationLabel(remainingSeconds)}</div>
                <p className="widget-power-target">
                  <Clock3 size={13} />
                  <span>Hedef: {targetLabel(timer.targetAt)}</span>
                </p>
                <button
                  type="button"
                  className="widget-power-cancel-btn"
                  onClick={() => void onCancelPower()}
                >
                  <X size={14} />
                  <span>Planı İptal Et</span>
                </button>
              </div>
            ) : (
              <div className="widget-power-presets">
                <div className="widget-power-action-toggle">
                  <button
                    type="button"
                    className={`power-toggle-chip ${powerAction === 'shutdown' ? 'power-toggle-chip--active' : ''}`}
                    onClick={() => setPowerAction('shutdown')}
                  >
                    Kapat
                  </button>
                  <button
                    type="button"
                    className={`power-toggle-chip ${powerAction === 'restart' ? 'power-toggle-chip--active' : ''}`}
                    onClick={() => setPowerAction('restart')}
                  >
                    Yeniden Başlat
                  </button>
                </div>

                <div className="widget-presets-grid">
                  {[
                    { label: '15 dk', sec: 15 * 60 },
                    { label: '30 dk', sec: 30 * 60 },
                    { label: '45 dk', sec: 45 * 60 },
                    { label: '1 saat', sec: 60 * 60 },
                    { label: '2 saat', sec: 120 * 60 },
                  ].map((p) => (
                    <button
                      key={p.sec}
                      type="button"
                      className="widget-preset-btn"
                      onClick={() => void onSchedulePower(powerAction, p.sec)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* WIDGET 2: Alarmlar & Hatırlatıcılar */}
        <div className="home-widget-card home-widget-card--alarms">
          <div className="widget-card__header">
            <div className="widget-card__title">
              <AlarmClock size={16} className="text-rose-400" />
              <span>Alarmlar</span>
              {alarms.length > 0 && <span className="widget-title-badge">{alarms.length}</span>}
            </div>
            <button
              type="button"
              className="widget-card__link-btn"
              onClick={() => onNavigate('alarms')}
            >
              <span>Tümünü Gör</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <div className="widget-card__content">
            {nextAlarm ? (
              <div className="widget-alarm-card">
                <div className="widget-alarm-time">{alarmTimeLabel(nextAlarm.timestamp)}</div>
                <div className="widget-alarm-note">
                  {nextAlarm.note ? nextAlarm.note : 'Planlanmış Alarm'}
                </div>
                <div className="widget-alarm-meta">
                  <span>{new Date(nextAlarm.timestamp).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                  {nextAlarm.intervalSeconds && <span>• Tekrarlı</span>}
                </div>
              </div>
            ) : (
              <div className="widget-empty-card">
                <AlarmClock size={24} className="text-slate-600 mb-2" />
                <p>Aktif alarm bulunmuyor.</p>
                <button
                  type="button"
                  className="widget-action-pill"
                  onClick={() => onNavigate('alarms')}
                >
                  + Alarm Kur
                </button>
              </div>
            )}
          </div>
        </div>

        {/* WIDGET 3: Defter & Son Notlar */}
        <div className="home-widget-card home-widget-card--notes">
          <div className="widget-card__header">
            <div className="widget-card__title">
              <BookOpen size={16} className="text-sky-400" />
              <span>Defter & Notlar</span>
            </div>
            <button
              type="button"
              className="widget-card__link-btn"
              onClick={() => onNavigate('notes')}
            >
              <span>Defteri Aç</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <div className="widget-card__content">
            {/* Quick Note Input */}
            <div className="widget-quick-note-box">
              <input
                type="text"
                className="widget-quick-note-input"
                placeholder="Hızlı bir not veya fikir yaz..."
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSaveQuickNote()
                }}
              />
              <button
                type="button"
                className="widget-quick-note-btn"
                onClick={() => void handleSaveQuickNote()}
                disabled={!quickNote.trim() || isSavingNote}
              >
                {noteSavedFeedback ? <Check size={14} className="text-emerald-400" /> : <Plus size={14} />}
              </button>
            </div>

            {/* Recent Notes List */}
            <div className="widget-recent-notes-list">
              <button
                type="button"
                className="widget-daily-note-chip"
                onClick={handleOpenDailyNote}
              >
                <Calendar size={13} className="text-sky-400" />
                <span>Bugünün Günlük Notu</span>
              </button>

              {mdFiles.map((file) => (
                <div
                  key={file.path}
                  className="widget-note-row"
                  onClick={() => {
                    tabStore.openTab(file.path)
                    onNavigate('notes')
                  }}
                >
                  <FileText size={13} className="text-slate-400" />
                  <span className="widget-note-name">{file.name.replace(/\.md$/i, '')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* WIDGET 4: LocalSend & Mobil Bağlantı */}
        <div className="home-widget-card home-widget-card--share">
          <div className="widget-card__header">
            <div className="widget-card__title">
              <Share2 size={16} className="text-emerald-400" />
              <span>Paylaş & Mobil</span>
            </div>
            <button
              type="button"
              className="widget-card__link-btn"
              onClick={() => onNavigate('localsend')}
            >
              <span>Transfer</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <div className="widget-card__content">
            <div className="widget-connect-info">
              <div className="connect-info-row">
                <span className="connect-label">Cihaz:</span>
                <span className="connect-value">{deviceName || 'Windows PC'}</span>
              </div>
              <div className="connect-info-row">
                <span className="connect-label">Eşleşme Kodu:</span>
                <span className="connect-value font-mono font-bold text-sky-400">{pairingCode || 'KAP-XXXX'}</span>
              </div>
            </div>

            <div className="widget-connect-actions">
              <button
                type="button"
                className="widget-action-pill widget-action-pill--emerald"
                onClick={() => onNavigate('localsend')}
              >
                <Share2 size={13} />
                <span>Dosya Gönder</span>
              </button>
              <button
                type="button"
                className="widget-action-pill widget-action-pill--violet"
                onClick={() => onNavigate('settings')}
              >
                <Smartphone size={13} />
                <span>Mobil Eşleştirme</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
