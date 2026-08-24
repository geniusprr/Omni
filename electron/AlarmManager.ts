import { Notification, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Alarm, CreateAlarmInput, AlarmSoundProfile } from '../src/types.js'
import { APP_EVENTS } from '../shared/contracts.js'
import { WindowManager } from './WindowManager.js'

const MAX_ALARMS = 64
const MAX_INTERVAL_SECONDS = 31_536_000
const ALARM_SLEEP_CHUNK_MS = 60_000

export class AlarmManager {
  private readonly alarmsPath: string
  private readonly activePath: string
  private readonly windows: WindowManager
  private readonly emit: (event: string, payload: unknown) => void
  private alarms: Alarm[] = []
  private activeAlarm: Alarm | null = null
  private readonly timers = new Map<string, NodeJS.Timeout>()
  private soundGeneration = 0

  constructor(dataDir: string, windows: WindowManager, emit: (event: string, payload: unknown) => void) {
    this.alarmsPath = path.join(dataDir, 'alarms.json')
    this.activePath = path.join(dataDir, 'active-alarm.json')
    this.windows = windows
    this.emit = emit
    this.load()
  }

  start() {
    for (const alarm of this.alarms) this.schedule(alarm)
  }

  list() {
    this.alarms.sort((a, b) => a.timestamp - b.timestamp)
    return this.alarms.map((alarm) => ({ ...alarm }))
  }

  getActive() { return this.activeAlarm ? { ...this.activeAlarm } : null }

  create(input: CreateAlarmInput) {
    if (input.timestamp <= Date.now()) throw new Error('Alarm zamanı geçmişte olamaz.')
    if (input.intervalSeconds !== null) {
      if (!Number.isInteger(input.intervalSeconds) || input.intervalSeconds < 60 || input.intervalSeconds > MAX_INTERVAL_SECONDS) throw new Error('Alarm aralığı 1 dakika ile 1 yıl arasında olmalı.')
      if (input.occurrenceCount !== null && (!Number.isInteger(input.occurrenceCount) || input.occurrenceCount < 2 || input.occurrenceCount > 999)) throw new Error('Tekrarlama sayısı 2 ile 999 arasında olmalı.')
    }
    if (this.alarms.length >= MAX_ALARMS) throw new Error('En fazla 64 bekleyen alarm kurulabilir.')
    const alarm: Alarm = {
      id: crypto.randomUUID(),
      timestamp: input.timestamp,
      note: input.note.trim().slice(0, 160),
      createdAt: Date.now(),
      intervalSeconds: input.intervalSeconds,
      remainingOccurrences: input.intervalSeconds === null ? 1 : input.occurrenceCount,
      soundEnabled: input.soundEnabled,
      soundProfile: input.soundProfile,
    }
    this.alarms.push(alarm)
    this.persist()
    this.schedule(alarm)
    this.emit(APP_EVENTS.alarmCreated, alarm)
    return { ...alarm }
  }

  cancel(id: string) {
    const index = this.alarms.findIndex((alarm) => alarm.id === id)
    if (index < 0) return false
    this.alarms.splice(index, 1)
    const timer = this.timers.get(id)
    if (timer) clearTimeout(timer)
    this.timers.delete(id)
    this.persist()
    this.emit(APP_EVENTS.alarmCancelled, id)
    return true
  }

  stopSound() {
    this.soundGeneration += 1
    this.activeAlarm = null
    try { fs.rmSync(this.activePath, { force: true }) } catch { /* best effort */ }
  }

  destroy() {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    this.stopSound()
  }

  private schedule(alarm: Alarm) {
    const existing = this.timers.get(alarm.id)
    if (existing) clearTimeout(existing)
    const remaining = alarm.timestamp - Date.now()
    const delay = Math.max(1, Math.min(remaining, ALARM_SLEEP_CHUNK_MS))
    const timer = setTimeout(() => {
      this.timers.delete(alarm.id)
      const current = this.alarms.find((item) => item.id === alarm.id && item.timestamp === alarm.timestamp)
      if (!current) return
      if (current.timestamp > Date.now()) {
        this.schedule(current)
        return
      }
      this.trigger(current)
    }, delay)
    this.timers.set(alarm.id, timer)
  }

  private trigger(alarm: Alarm) {
    const index = this.alarms.findIndex((item) => item.id === alarm.id && item.timestamp === alarm.timestamp)
    if (index < 0) return
    let next: Alarm | null = null
    if (alarm.intervalSeconds !== null && (alarm.remainingOccurrences === null || alarm.remainingOccurrences > 1)) {
      next = {
        ...alarm,
        timestamp: Date.now() + alarm.intervalSeconds * 1_000,
        remainingOccurrences: alarm.remainingOccurrences === null ? null : alarm.remainingOccurrences - 1,
      }
      this.alarms[index] = next
    } else {
      this.alarms.splice(index, 1)
    }
    this.persist()
    this.activeAlarm = { ...alarm }
    try { fs.writeFileSync(this.activePath, JSON.stringify(alarm, null, 2), 'utf8') } catch { /* best effort */ }
    if (Notification.isSupported()) {
      const notification = new Notification({ title: 'Eon alarmı', body: alarm.note || 'Alarm zamanı geldi.' })
      notification.show()
    }
    if (alarm.soundEnabled) this.playSound(alarm.soundProfile)
    this.windows.showMain()
    this.emit(APP_EVENTS.alarmTriggered, { ...alarm })
    if (next) this.schedule(next)
  }

  private playSound(profile: AlarmSoundProfile) {
    const generation = ++this.soundGeneration
    const [count, cadence] = profile === 'gentle' ? [3, 900] : profile === 'urgent' ? [10, 420] : [6, 650]
    let played = 0
    const beep = () => {
      if (generation !== this.soundGeneration || played >= count) return
      played += 1
      shell.beep()
      if (played < count) setTimeout(beep, cadence)
    }
    beep()
  }

  private load() {
    const now = Date.now()
    try {
      const parsed = JSON.parse(fs.readFileSync(this.alarmsPath, 'utf8')) as unknown
      if (Array.isArray(parsed)) this.alarms = parsed.flatMap((value) => normalizeAlarm(value, now)).sort((a, b) => a.timestamp - b.timestamp)
    } catch { this.alarms = [] }
    try {
      const active = JSON.parse(fs.readFileSync(this.activePath, 'utf8')) as Alarm
      if (active && typeof active.id === 'string') this.activeAlarm = active
    } catch { this.activeAlarm = null }
    this.persist()
  }

  private persist() {
    try { fs.writeFileSync(this.alarmsPath, JSON.stringify(this.alarms, null, 2), 'utf8') } catch (error) { console.error('[alarms] state could not be persisted', error) }
  }
}

function normalizeAlarm(value: unknown, now: number): Alarm[] {
  if (!value || typeof value !== 'object') return []
  const alarm = value as Partial<Alarm>
  if (typeof alarm.id !== 'string' || typeof alarm.timestamp !== 'number') return []
  const normalized: Alarm = {
    id: alarm.id,
    timestamp: alarm.timestamp,
    note: typeof alarm.note === 'string' ? alarm.note.slice(0, 160) : '',
    createdAt: typeof alarm.createdAt === 'number' ? alarm.createdAt : now,
    intervalSeconds: typeof alarm.intervalSeconds === 'number' ? alarm.intervalSeconds : null,
    remainingOccurrences: typeof alarm.remainingOccurrences === 'number' ? alarm.remainingOccurrences : alarm.remainingOccurrences === null ? null : 1,
    soundEnabled: alarm.soundEnabled !== false,
    soundProfile: alarm.soundProfile === 'gentle' || alarm.soundProfile === 'urgent' ? alarm.soundProfile : 'chime',
  }
  if (normalized.timestamp > now) return [normalized]
  if (normalized.intervalSeconds === null || normalized.intervalSeconds <= 0) return []
  const missed = Math.floor((now - normalized.timestamp) / (normalized.intervalSeconds * 1_000)) + 1
  if (normalized.remainingOccurrences !== null && missed >= normalized.remainingOccurrences) return []
  return [{
    ...normalized,
    timestamp: normalized.timestamp + missed * normalized.intervalSeconds * 1_000,
    remainingOccurrences: normalized.remainingOccurrences === null ? null : normalized.remainingOccurrences - missed,
  }]
}

