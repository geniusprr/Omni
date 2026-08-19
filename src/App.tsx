import { useEffect, useState } from 'react'
import AlarmClock from 'lucide-react/dist/esm/icons/alarm-clock.js'
import Power from 'lucide-react/dist/esm/icons/power.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { CompactTitlebar } from '@/components/layout/CompactTitlebar'
import { RingingOverlay } from '@/components/RingingOverlay'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlarmsPage } from '@/features/alarms/AlarmsPage'
import { PowerPage } from '@/features/power/PowerPage'
import { startRemoteCommandBridge } from '@/features/remote/client'
import { desktop } from '@/lib/desktop'
import { errorMessage } from '@/lib/format'
import type { Alarm, CreateAlarmInput, TimerAction, TimerState } from '@/types'

type AppMode = 'power' | 'alarms'

export default function App() {
  const [mode, setMode] = useState<AppMode>('power')
  const [timer, setTimer] = useState<TimerState | null>(null)
  const [alarms, setAlarms] = useState<Alarm[]>([])
  const [ringingAlarm, setRingingAlarm] = useState<Alarm | null>(null)
  const [now, setNow] = useState(Date.now())
  const [powerBusy, setPowerBusy] = useState(false)
  const [alarmBusy, setAlarmBusy] = useState(false)
  const [powerError, setPowerError] = useState<string | null>(null)
  const [alarmError, setAlarmError] = useState<string | null>(null)
  const [appError, setAppError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void Promise.all([desktop.system.getTimerStatus(), desktop.alarms.list(), desktop.alarms.getActive()])
      .then(([storedTimer, storedAlarms, activeAlarm]) => {
        if (!mounted) return
        setTimer(storedTimer)
        setAlarms(storedAlarms)
        if (activeAlarm) {
          setRingingAlarm(activeAlarm)
          setMode('alarms')
        }
      })
      .catch((error) => setAppError(errorMessage(error, 'Yerel planlar okunamadı.')))

    const stopAlarmListener = desktop.alarms.onTriggered(
      (alarm) => {
        setRingingAlarm(alarm)
        setMode('alarms')
        void desktop.alarms.list().then(setAlarms).catch(() => undefined)
      },
      (error) => setAppError(errorMessage(error, 'Alarm dinleyicisi başlatılamadı.')),
    )

    return () => {
      mounted = false
      stopAlarmListener()
    }
  }, [])

  useEffect(() => {
    if (!timer) return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [timer])

  useEffect(() => {
    if (timer && timer.targetAt <= now) setTimer(null)
  }, [now, timer])

  useEffect(() => {
    let dispose: () => void = () => undefined
    let active = true
    void startRemoteCommandBridge({
      execute: async (command, delaySeconds) => {
        if (command === 'cancel') {
          await desktop.system.cancelShutdown()
          setTimer(null)
          return
        }
        const nextTimer = await desktop.system.scheduleShutdown(command, Math.max(1, delaySeconds))
        setTimer(nextTimer)
        setNow(Date.now())
      },
    }).then((cleanup) => {
      if (active) dispose = cleanup
      else cleanup()
    }).catch(() => undefined)
    return () => { active = false; dispose() }
  }, [])

  async function schedulePower(action: TimerAction, seconds: number) {
    setPowerBusy(true)
    setPowerError(null)
    try {
      const nextTimer = await desktop.system.scheduleShutdown(action, seconds)
      setTimer(nextTimer)
      setNow(Date.now())
    } catch (error) {
      setPowerError(errorMessage(error, 'Windows güç planı oluşturulamadı.'))
    } finally {
      setPowerBusy(false)
    }
  }

  async function cancelPower() {
    setPowerBusy(true)
    setPowerError(null)
    try {
      await desktop.system.cancelShutdown()
      setTimer(null)
      setNow(Date.now())
    } catch (error) {
      setPowerError(errorMessage(error, 'Windows güç planı iptal edilemedi.'))
    } finally {
      setPowerBusy(false)
    }
  }

  async function createAlarm(input: CreateAlarmInput) {
    if (input.timestamp <= Date.now()) {
      const error = new Error('Gelecekte bir zaman seç.')
      setAlarmError(error.message)
      throw error
    }
    setAlarmBusy(true)
    setAlarmError(null)
    try {
      const alarm = await desktop.alarms.create(input)
      setAlarms((current) => [...current, alarm].sort((a, b) => a.timestamp - b.timestamp))
    } catch (error) {
      setAlarmError(errorMessage(error, 'Alarm kaydedilemedi.'))
      throw error
    } finally {
      setAlarmBusy(false)
    }
  }

  async function cancelAlarm(id: string) {
    setAlarmError(null)
    try {
      if (await desktop.alarms.cancel(id)) setAlarms((current) => current.filter((alarm) => alarm.id !== id))
    } catch (error) {
      setAlarmError(errorMessage(error, 'Alarm iptal edilemedi.'))
    }
  }

  async function dismissAlarm() {
    await desktop.alarms.stopSound().catch(() => undefined)
    setRingingAlarm(null)
  }

  async function snoozeAlarm() {
    if (!ringingAlarm) return
    await desktop.alarms.stopSound().catch(() => undefined)
    try {
      const snoozed = await desktop.alarms.create({
        timestamp: Date.now() + 5 * 60 * 1000,
        note: ringingAlarm.note,
        intervalSeconds: null,
        occurrenceCount: 1,
        soundEnabled: ringingAlarm.soundEnabled,
        soundProfile: ringingAlarm.soundProfile,
      })
      setAlarms((current) => [...current, snoozed].sort((a, b) => a.timestamp - b.timestamp))
      setRingingAlarm(null)
    } catch (error) {
      setAlarmError(errorMessage(error, 'Alarm ertelenemedi.'))
    }
  }

  return (
    <div className="utility-window">
      <CompactTitlebar />
      <Tabs className="app-tabs" value={mode} onValueChange={(value) => setMode(value as AppMode)}>
        <nav className="modebar" aria-label="Ana bölümler">
          <TabsList>
            <TabsTrigger value="power"><Power aria-hidden="true" size={16} />Kapat</TabsTrigger>
            <TabsTrigger value="alarms"><AlarmClock aria-hidden="true" size={16} />Alarm{alarms.length > 0 ? <span>{alarms.length}</span> : null}</TabsTrigger>
          </TabsList>
          <div className="modebar__runtime"><span className="runtime-dot" />yerel</div>
        </nav>
        <main className="utility-content">
          <TabsContent value="power">
            <PowerPage timer={timer} now={now} busy={powerBusy} error={powerError} onSchedule={schedulePower} onCancel={cancelPower} />
          </TabsContent>
          <TabsContent value="alarms">
            <AlarmsPage alarms={alarms} busy={alarmBusy} error={alarmError} onCreate={createAlarm} onCancel={cancelAlarm} />
          </TabsContent>
        </main>
      </Tabs>
      {appError ? <div className="app-error" role="alert"><X aria-hidden="true" size={14} />{appError}<button type="button" aria-label="Hatayı kapat" onClick={() => setAppError(null)}><X aria-hidden="true" size={13} /></button></div> : null}
      {ringingAlarm ? <RingingOverlay alarm={ringingAlarm} onDismiss={() => void dismissAlarm()} onSnooze={() => void snoozeAlarm()} /> : null}
    </div>
  )
}
