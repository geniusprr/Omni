import { useEffect, useMemo, useState } from 'react'
import AlarmClock from 'lucide-react/dist/esm/icons/alarm-clock.js'
import CalendarDays from 'lucide-react/dist/esm/icons/calendar-days.js'
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left.js'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.js'
import Clock3 from 'lucide-react/dist/esm/icons/clock-3.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import Sparkles from 'lucide-react/dist/esm/icons/sparkles.js'
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n'
import type { Alarm } from '@/types'

type CalendarCategory = 'work' | 'personal' | 'focus'

interface CalendarEvent {
  id: string
  title: string
  date: string
  startTime: string
  endTime: string
  note: string
  category: CalendarCategory
  allDay: boolean
  createdAt: number
}

interface CalendarPageProps {
  alarms: Alarm[]
  onOpenAlarms: () => void
}

const STORAGE_KEY = 'eon_calendar_events_v1'
const WEEKDAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year || 1970, (month || 1) - 1, day || 1)
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function monthGrid(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - mondayOffset)

  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(start)
    value.setDate(start.getDate() + index)
    return value
  })
}

function safeLoadEvents(): CalendarEvent[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((event): event is CalendarEvent => (
      event
      && typeof event.id === 'string'
      && typeof event.title === 'string'
      && typeof event.date === 'string'
      && typeof event.startTime === 'string'
      && typeof event.endTime === 'string'
      && typeof event.note === 'string'
      && ['work', 'personal', 'focus'].includes(event.category)
      && typeof event.allDay === 'boolean'
    ))
  } catch {
    return []
  }
}

function sortEvents(events: CalendarEvent[]) {
  return [...events].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
    return a.startTime.localeCompare(b.startTime) || a.createdAt - b.createdAt
  })
}

function categoryLabel(category: CalendarCategory) {
  if (category === 'work') return 'İş'
  if (category === 'focus') return 'Odak'
  return 'Kişisel'
}

export function CalendarPage({ alarms, onOpenAlarms }: CalendarPageProps) {
  const { localeTag } = useI18n()
  const [today] = useState(() => new Date())
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(() => new Date(today))
  const [events, setEvents] = useState<CalendarEvent[]>(safeLoadEvents)
  const [composerOpen, setComposerOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [note, setNote] = useState('')
  const [category, setCategory] = useState<CalendarCategory>('work')
  const [allDay, setAllDay] = useState(false)

  const days = useMemo(() => monthGrid(cursor), [cursor])
  const selectedKey = dateKey(selectedDate)

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const list = map.get(event.date) || []
      list.push(event)
      map.set(event.date, list)
    }
    for (const [key, list] of map) map.set(key, sortEvents(list))
    return map
  }, [events])

  const alarmsByDay = useMemo(() => {
    const map = new Map<string, Alarm[]>()
    for (const alarm of alarms) {
      const key = dateKey(new Date(alarm.timestamp))
      const list = map.get(key) || []
      list.push(alarm)
      map.set(key, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.timestamp - b.timestamp)
    return map
  }, [alarms])

  const selectedEvents = eventsByDay.get(selectedKey) || []
  const selectedAlarms = alarmsByDay.get(selectedKey) || []

  const upcoming = useMemo(() => {
    const todayKey = dateKey(today)
    return events
      .filter((event) => event.date >= todayKey)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .slice(0, 4)
  }, [events, today])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
  }, [events])

  function moveMonth(delta: number) {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))
  }

  function goToday() {
    const next = new Date()
    setCursor(new Date(next.getFullYear(), next.getMonth(), 1))
    setSelectedDate(next)
  }

  function selectDay(date: Date) {
    setSelectedDate(date)
    if (date.getMonth() !== cursor.getMonth() || date.getFullYear() !== cursor.getFullYear()) {
      setCursor(new Date(date.getFullYear(), date.getMonth(), 1))
    }
  }

  function openComposer(date = selectedDate) {
    setSelectedDate(date)
    setTitle('')
    setNote('')
    setCategory('work')
    setAllDay(false)
    setStartTime('09:00')
    setEndTime('10:00')
    setComposerOpen(true)
  }

  function createEvent() {
    const cleanTitle = title.trim()
    if (!cleanTitle) return
    const next: CalendarEvent = {
      id: crypto.randomUUID(),
      title: cleanTitle,
      date: selectedKey,
      startTime: allDay ? '00:00' : startTime,
      endTime: allDay ? '23:59' : endTime,
      note: note.trim(),
      category,
      allDay,
      createdAt: Date.now(),
    }
    setEvents((current) => [...current, next])
    setComposerOpen(false)
  }

  function deleteEvent(id: string) {
    setEvents((current) => current.filter((event) => event.id !== id))
  }

  const monthTitle = cursor.toLocaleDateString(localeTag, { month: 'long', year: 'numeric' })
  const selectedTitle = selectedDate.toLocaleDateString(localeTag, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <section className="calendar-workspace" aria-labelledby="calendar-page-title">
      <header className="calendar-toolbar">
        <div className="calendar-toolbar__brand">
          <span className="calendar-toolbar__icon"><CalendarDays size={18} strokeWidth={1.8} /></span>
          <div>
            <h1 id="calendar-page-title">Takvim</h1>
            <p>Gününü planla, etkinliklerini ve alarmlarını tek yerde gör.</p>
          </div>
        </div>

        <div className="calendar-toolbar__controls">
          <div className="calendar-month-nav" aria-label="Ay seçimi">
            <Button variant="ghost" size="compact" aria-label="Önceki ay" onClick={() => moveMonth(-1)}><ChevronLeft size={16} /></Button>
            <strong>{monthTitle}</strong>
            <Button variant="ghost" size="compact" aria-label="Sonraki ay" onClick={() => moveMonth(1)}><ChevronRight size={16} /></Button>
          </div>
          <Button className="calendar-today-button" variant="soft" size="compact" onClick={goToday}>Bugün</Button>
          <Button className="calendar-new-button" variant="accent" size="compact" onClick={() => openComposer()}><Plus size={15} />Yeni etkinlik</Button>
        </div>
      </header>

      <div className="calendar-layout">
        <div className="calendar-month-card">
          <div className="calendar-weekdays" aria-hidden="true">
            {WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}
          </div>

          <div className="calendar-month-grid">
            {days.map((day) => {
              const key = dateKey(day)
              const dayEvents = eventsByDay.get(key) || []
              const dayAlarms = alarmsByDay.get(key) || []
              const outside = day.getMonth() !== cursor.getMonth()
              const isSelected = sameDay(day, selectedDate)
              const isToday = sameDay(day, today)
              const itemCount = dayEvents.length + dayAlarms.length

              return (
                <button
                  type="button"
                  key={key}
                  className={`calendar-day-cell ${outside ? 'calendar-day-cell--outside' : ''} ${isSelected ? 'calendar-day-cell--selected' : ''} ${isToday ? 'calendar-day-cell--today' : ''}`}
                  onClick={() => selectDay(day)}
                  onDoubleClick={() => openComposer(day)}
                  aria-label={`${day.toLocaleDateString(localeTag)}${itemCount ? `, ${itemCount} plan` : ''}`}
                >
                  <span className="calendar-day-number">{day.getDate()}</span>
                  <span className="calendar-day-items">
                    {dayEvents.slice(0, 2).map((event) => (
                      <span key={event.id} className={`calendar-event-chip calendar-event-chip--${event.category}`}>
                        <i aria-hidden="true" />
                        <span>{event.allDay ? '' : `${event.startTime} `}{event.title}</span>
                      </span>
                    ))}
                    {dayAlarms.length > 0 && dayEvents.length < 2 ? (
                      <span className="calendar-event-chip calendar-event-chip--alarm">
                        <AlarmClock size={10} aria-hidden="true" />
                        <span>{new Date(dayAlarms[0].timestamp).toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' })} {dayAlarms[0].note || 'Alarm'}</span>
                      </span>
                    ) : null}
                    {itemCount > 2 ? <span className="calendar-day-more">+{itemCount - 2} daha</span> : null}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <aside className="calendar-agenda" aria-label="Seçili gün planı">
          <div className="calendar-agenda__header">
            <div>
              <span className="calendar-agenda__eyebrow">Seçili gün</span>
              <h2>{selectedTitle}</h2>
            </div>
            <Button variant="ghost" size="compact" aria-label="Bu güne etkinlik ekle" onClick={() => openComposer()}><Plus size={16} /></Button>
          </div>

          <div className="calendar-agenda__summary">
            <span><strong>{selectedEvents.length}</strong> etkinlik</span>
            <span><strong>{selectedAlarms.length}</strong> alarm</span>
          </div>

          <div className="calendar-agenda__scroll">
            {selectedEvents.length === 0 && selectedAlarms.length === 0 ? (
              <div className="calendar-empty-day">
                <span className="calendar-empty-day__icon"><Sparkles size={19} /></span>
                <strong>Bu gün sakin görünüyor.</strong>
                <p>Yeni bir etkinlik ekleyerek gününü planlamaya başlayabilirsin.</p>
                <Button variant="soft" size="compact" onClick={() => openComposer()}><Plus size={14} />Etkinlik ekle</Button>
              </div>
            ) : (
              <div className="calendar-agenda-list">
                {selectedEvents.map((event) => (
                  <article key={event.id} className={`calendar-agenda-item calendar-agenda-item--${event.category}`}>
                    <span className="calendar-agenda-item__rail" aria-hidden="true" />
                    <div className="calendar-agenda-item__time">
                      {event.allDay ? 'Tüm gün' : <><strong>{event.startTime}</strong><span>{event.endTime}</span></>}
                    </div>
                    <div className="calendar-agenda-item__body">
                      <div className="calendar-agenda-item__top">
                        <strong>{event.title}</strong>
                        <Button variant="icon" size="compact" aria-label={`${event.title} etkinliğini sil`} onClick={() => deleteEvent(event.id)}><Trash2 size={13} /></Button>
                      </div>
                      <span className="calendar-category-pill">{categoryLabel(event.category)}</span>
                      {event.note ? <p>{event.note}</p> : null}
                    </div>
                  </article>
                ))}

                {selectedAlarms.map((alarm) => (
                  <article key={alarm.id} className="calendar-agenda-item calendar-agenda-item--alarm">
                    <span className="calendar-agenda-item__rail" aria-hidden="true" />
                    <div className="calendar-agenda-item__time"><strong>{new Date(alarm.timestamp).toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' })}</strong><span>Alarm</span></div>
                    <div className="calendar-agenda-item__body">
                      <div className="calendar-agenda-item__top"><strong>{alarm.note || 'Alarm'}</strong><AlarmClock size={14} /></div>
                      <button type="button" className="calendar-inline-link" onClick={onOpenAlarms}>Alarm yönetimini aç</button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {upcoming.length > 0 ? (
              <div className="calendar-upcoming">
                <div className="calendar-upcoming__title">Yaklaşanlar</div>
                {upcoming.map((event) => (
                  <button type="button" key={event.id} className="calendar-upcoming-item" onClick={() => selectDay(dateFromKey(event.date))}>
                    <span className="calendar-upcoming-item__date">
                      <strong>{dateFromKey(event.date).getDate()}</strong>
                      <small>{dateFromKey(event.date).toLocaleDateString(localeTag, { month: 'short' })}</small>
                    </span>
                    <span className="calendar-upcoming-item__body"><strong>{event.title}</strong><small>{event.allDay ? 'Tüm gün' : event.startTime}</small></span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {composerOpen ? (
        <div className="calendar-composer-overlay" role="presentation" onMouseDown={() => setComposerOpen(false)}>
          <div className="calendar-composer" role="dialog" aria-modal="true" aria-labelledby="calendar-composer-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className="calendar-composer__header">
              <div><span>Yeni plan</span><h2 id="calendar-composer-title">Etkinlik oluştur</h2></div>
              <Button variant="icon" size="compact" aria-label="Pencereyi kapat" onClick={() => setComposerOpen(false)}><X size={16} /></Button>
            </header>

            <div className="calendar-composer__body">
              <div className="calendar-field">
                <Label htmlFor="calendar-title">Başlık</Label>
                <Input id="calendar-title" autoFocus maxLength={90} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Toplantı, odak zamanı, kişisel plan…" onKeyDown={(event) => { if (event.key === 'Enter' && title.trim()) createEvent() }} />
              </div>

              <div className="calendar-composer__date-card">
                <CalendarDays size={16} aria-hidden="true" />
                <div><span>Tarih</span><strong>{selectedDate.toLocaleDateString(localeTag, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong></div>
              </div>

              <div className="calendar-all-day-row">
                <div><strong>Tüm gün</strong><span>Saat aralığı olmadan planla</span></div>
                <Switch checked={allDay} onCheckedChange={setAllDay} aria-label="Tüm gün" />
              </div>

              {!allDay ? (
                <div className="calendar-time-grid">
                  <div className="calendar-field">
                    <Label htmlFor="calendar-start-time">Başlangıç</Label>
                    <div className="calendar-time-input"><Clock3 size={14} /><Input id="calendar-start-time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></div>
                  </div>
                  <div className="calendar-field">
                    <Label htmlFor="calendar-end-time">Bitiş</Label>
                    <div className="calendar-time-input"><Clock3 size={14} /><Input id="calendar-end-time" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></div>
                  </div>
                </div>
              ) : null}

              <div className="calendar-field">
                <Label>Kategori</Label>
                <Select value={category} onValueChange={(value) => setCategory(value as CalendarCategory)}>
                  <SelectTrigger className="calendar-category-select" aria-label="Etkinlik kategorisi"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="work">İş</SelectItem>
                    <SelectItem value="personal">Kişisel</SelectItem>
                    <SelectItem value="focus">Odak</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="calendar-field">
                <Label htmlFor="calendar-note">Not <span>opsiyonel</span></Label>
                <textarea id="calendar-note" className="calendar-note-input" maxLength={240} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Kısa bir açıklama ekle…" />
              </div>
            </div>

            <footer className="calendar-composer__footer">
              <Button variant="ghost" size="compact" onClick={() => setComposerOpen(false)}>Vazgeç</Button>
              <Button variant="accent" size="compact" disabled={!title.trim()} onClick={createEvent}><Plus size={14} />Etkinliği ekle</Button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  )
}
