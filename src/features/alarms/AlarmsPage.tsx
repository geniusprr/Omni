import { useState } from 'react'
import AlarmClock from 'lucide-react/dist/esm/icons/alarm-clock.js'
import BellRing from 'lucide-react/dist/esm/icons/bell-ring.js'
import CalendarDays from 'lucide-react/dist/esm/icons/calendar-days.js'
import Clock3 from 'lucide-react/dist/esm/icons/clock-3.js'
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js'
import Volume2 from 'lucide-react/dist/esm/icons/volume-2.js'
import VolumeX from 'lucide-react/dist/esm/icons/volume-x.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { arSA, de, enUS, es, fr, it, ja, ko, ptBR, ru, tr, zhCN } from 'react-day-picker/locale'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useI18n, type AppLocale, type TranslationValues } from '@/i18n'
import { alarmDateLabel, alarmTimeLabel, compactDuration, dateButtonLabel, defaultAlarmDate, timeInputValue } from '@/lib/format'
import type { Alarm, AlarmSoundProfile, CreateAlarmInput } from '@/types'

type AlarmMode = 'once' | 'interval'
type StartMode = 'now' | 'later'
type IntervalUnit = 'minutes' | 'hours' | 'days'

interface AlarmsPageProps {
  alarms: Alarm[]
  busy: boolean
  error: string | null
  onCreate: (input: CreateAlarmInput) => Promise<void>
  onCancel: (id: string) => Promise<void>
}

const unitSeconds: Record<IntervalUnit, number> = { minutes: 60, hours: 3600, days: 86400 }

const calendarLocales = { tr, en: enUS, de, fr, es, it, pt: ptBR, ru, ar: arSA, zh: zhCN, ja, ko } satisfies Record<AppLocale, typeof tr>

function alarmRepeatLabel(alarm: Alarm, translate: (source: string, values?: TranslationValues) => string) {
  if (!alarm.intervalSeconds) return translate('Tek sefer')
  const count = alarm.remainingOccurrences === null
    ? translate('sürekli')
    : translate('{count} kez', { count: alarm.remainingOccurrences })
  return translate('Her {duration} · {count}', { duration: compactDuration(alarm.intervalSeconds), count })
}

function buildTimestamp(date: Date, time: string, seconds: number) {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  const value = new Date(date)
  value.setHours(hours, minutes, seconds, 0)
  return value.getTime()
}

export function AlarmsPage({ alarms, busy, error, onCreate, onCancel }: AlarmsPageProps) {
  const { locale, t } = useI18n()
  const [defaults] = useState(defaultAlarmDate)
  const [mode, setMode] = useState<AlarmMode>('once')
  const [startMode, setStartMode] = useState<StartMode>('now')
  const [date, setDate] = useState(defaults)
  const [time, setTime] = useState(timeInputValue(defaults))
  const [useSeconds, setUseSeconds] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [intervalValue, setIntervalValue] = useState(15)
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('minutes')
  const [occurrences, setOccurrences] = useState('5')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [soundProfile, setSoundProfile] = useState<AlarmSoundProfile>('chime')
  const [note, setNote] = useState('')
  const intervalSeconds = Math.max(60, intervalValue * unitSeconds[intervalUnit])
  const needsDate = mode === 'once' || startMode === 'later'
  const [startOfToday] = useState(() => {
    const value = new Date()
    value.setHours(0, 0, 0, 0)
    return value
  })

  async function submitAlarm() {
    const timestamp = mode === 'interval' && startMode === 'now'
      ? Date.now() + intervalSeconds * 1000
      : buildTimestamp(date, time, useSeconds ? seconds : 0)

    const payload: CreateAlarmInput = {
      timestamp,
      note: note.trim(),
      intervalSeconds: mode === 'interval' ? intervalSeconds : null,
      occurrenceCount: mode === 'interval' && occurrences === 'infinite' ? null : mode === 'interval' ? Number(occurrences) : 1,
      soundEnabled,
      soundProfile,
    }

    try {
      await onCreate(payload)
      setNote('')
    } catch {
      // Hata metni üst bileşende tek yerde gösterilir.
    }
  }

  return (
    <section className="utility-screen alarm-screen" aria-labelledby="alarm-title">
      <div className="alarm-form-column">
        <header className="screen-heading screen-heading--alarm">
          <div><h1 id="alarm-title">{t('Alarm')}</h1><p>{t('Bir kez veya belirli aralıklarla uyar.')}</p></div>
          <span className="alarm-count" aria-label={t('{count} bekleyen alarm', { count: alarms.length })}>{alarms.length}</span>
        </header>

        <ToggleGroup className="alarm-mode-toggle" type="single" value={mode} onValueChange={(value) => { if (value) setMode(value as AlarmMode) }} aria-label={t('Alarm türü')}>
          <ToggleGroupItem value="once">{t('Tek sefer')}</ToggleGroupItem>
          <ToggleGroupItem value="interval">{t('Aralıklı')}</ToggleGroupItem>
        </ToggleGroup>

        {mode === 'interval' ? (
          <div className="alarm-inline-row alarm-start-row">
            <span className="section-label">{t('Başlangıç')}</span>
            <ToggleGroup className="mini-toggle" type="single" value={startMode} onValueChange={(value) => { if (value) setStartMode(value as StartMode) }} aria-label={t('Alarm başlangıcı')}>
              <ToggleGroupItem value="now">{t('Şimdi')}</ToggleGroupItem>
              <ToggleGroupItem value="later">{t('Belirli saatte')}</ToggleGroupItem>
            </ToggleGroup>
          </div>
        ) : null}

        {needsDate ? (
          <div className="date-time-grid">
            <div className="compact-field">
              <Label htmlFor="alarm-date-trigger">{t('Tarih')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button id="alarm-date-trigger" className="date-trigger" variant="soft"><CalendarDays aria-hidden="true" size={15} />{dateButtonLabel(date)}</Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="calendar-popover">
                  <Calendar mode="single" selected={date} onSelect={(nextDate) => { if (nextDate) setDate(nextDate) }} disabled={{ before: startOfToday }} locale={calendarLocales[locale]} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="compact-field">
              <Label htmlFor="alarm-time">{t('Saat')}</Label>
              <div className="time-input-wrap"><Clock3 aria-hidden="true" size={15} /><Input id="alarm-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></div>
            </div>
            <div className="seconds-control">
              <Label htmlFor="alarm-seconds-toggle">{t('Sn')}</Label>
              <Switch id="alarm-seconds-toggle" checked={useSeconds} onCheckedChange={setUseSeconds} />
              {useSeconds ? <Input aria-label={t('Alarm saniyesi')} className="seconds-input" type="number" min={0} max={59} value={seconds} onChange={(event) => setSeconds(Math.max(0, Math.min(59, Number(event.target.value) || 0)))} /> : null}
            </div>
          </div>
        ) : null}

        {mode === 'interval' ? (
          <div className="interval-grid">
            <div className="compact-field interval-value-field">
              <Label htmlFor="interval-value">{t('Her')}</Label>
              <div className="interval-value-wrap">
                <Input id="interval-value" type="number" min={1} max={999} value={intervalValue} onChange={(event) => setIntervalValue(Math.max(1, Math.min(999, Number(event.target.value) || 1)))} />
                <Select value={intervalUnit} onValueChange={(value) => setIntervalUnit(value as IntervalUnit)}>
                  <SelectTrigger aria-label={t('Aralık birimi')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">{t('dakika')}</SelectItem>
                    <SelectItem value="hours">{t('saat')}</SelectItem>
                    <SelectItem value="days">{t('gün')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="compact-field">
              <Label>{t('Tekrar')}</Label>
              <Select value={occurrences} onValueChange={setOccurrences}>
                <SelectTrigger aria-label={t('Tekrar sayısı')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">{t('{count} kez', { count: 3 })}</SelectItem>
                  <SelectItem value="5">{t('{count} kez', { count: 5 })}</SelectItem>
                  <SelectItem value="10">{t('{count} kez', { count: 10 })}</SelectItem>
                  <SelectItem value="infinite">{t('İptale kadar')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        <div className="sound-row">
          <div className="sound-row__label">{soundEnabled ? <Volume2 aria-hidden="true" size={16} /> : <VolumeX aria-hidden="true" size={16} />}<span><strong>{t('Sesli alarm')}</strong><small>{t('Windows sistem sesi')}</small></span></div>
          <Switch aria-label={t('Sesli alarm')} checked={soundEnabled} onCheckedChange={setSoundEnabled} />
          <Select disabled={!soundEnabled} value={soundProfile} onValueChange={(value) => setSoundProfile(value as AlarmSoundProfile)}>
            <SelectTrigger className="sound-select" aria-label={t('Alarm sesi')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gentle">{t('Yumuşak')}</SelectItem>
              <SelectItem value="chime">{t('Dengeli')}</SelectItem>
              <SelectItem value="urgent">{t('Güçlü')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="compact-field note-field">
          <Label htmlFor="alarm-note">{t('Not')} <span>{t('opsiyonel')}</span></Label>
          <Input id="alarm-note" maxLength={160} placeholder={t('Toplantı, mola, ilaç…')} value={note} onChange={(event) => setNote(event.target.value)} />
        </div>

        <Button className="alarm-submit" variant="accent" disabled={busy} onClick={() => void submitAlarm()}>
          <BellRing aria-hidden="true" size={17} />{busy ? t('Kaydediliyor…') : mode === 'interval' ? t('Aralıklı alarmı kur') : t('Alarmı kur')}
        </Button>
        {error ? <p className="form-error" role="alert"><X aria-hidden="true" size={14} />{error}</p> : null}
      </div>

      <aside className="alarm-list-column" aria-label={t('Bekleyen alarmlar')}>
        <div className="alarm-list-heading"><span><AlarmClock aria-hidden="true" size={16} />{t('Bekleyenler')}</span>{alarms.length > 0 ? <small aria-hidden="true">{alarms.length}</small> : null}</div>
        <div className="alarm-list">
          {alarms.length === 0 ? (
            <div className="alarm-empty"><BellRing aria-hidden="true" size={19} /><strong>{t('Alarm yok')}</strong><span>{t('Kurduğun alarmlar burada görünür.')}</span></div>
          ) : alarms.slice(0, 3).map((alarm) => (
            <article className="alarm-item" key={alarm.id}>
              <div className="alarm-item__top"><strong>{alarmTimeLabel(alarm.timestamp)}</strong><Button aria-label={t('Alarmı iptal et')} size="compact" variant="icon" onClick={() => void onCancel(alarm.id)}><Trash2 aria-hidden="true" size={14} /></Button></div>
              <span className="alarm-item__date">{alarmDateLabel(alarm.timestamp)}</span>
              <p>{alarm.note || t('Not yok')}</p>
              <span className="alarm-item__repeat">{alarm.soundEnabled ? <Volume2 aria-hidden="true" size={12} /> : <VolumeX aria-hidden="true" size={12} />}{alarmRepeatLabel(alarm, t)}</span>
            </article>
          ))}
          {alarms.length > 3 ? <div className="alarm-more">{t('+{count} alarm daha', { count: alarms.length - 3 })}</div> : null}
        </div>
      </aside>
    </section>
  )
}
