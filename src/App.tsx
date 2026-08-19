import { useEffect, useRef, useState } from 'react'
import AlarmClock from 'lucide-react/dist/esm/icons/alarm-clock.js'
import BookOpen from 'lucide-react/dist/esm/icons/book-open.js'
import Power from 'lucide-react/dist/esm/icons/power.js'
import Settings from 'lucide-react/dist/esm/icons/settings.js'
import Share2 from 'lucide-react/dist/esm/icons/share-2.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { CompactTitlebar } from '@/components/layout/CompactTitlebar'
import { RingingOverlay } from '@/components/RingingOverlay'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlarmsPage } from '@/features/alarms/AlarmsPage'
import { LocalSendPage } from '@/features/localsend/LocalSendPage'
import { NotesPage } from '@/features/notes/NotesPage'
import { PowerPage } from '@/features/power/PowerPage'
import { RemoteControllerView } from '@/features/remote/RemoteControllerView'
import {
  fetchPairedControllers,
  getEffectiveSettings,
  startRemoteEngine,
} from '@/features/remote/client'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { desktop, isTauriRuntime } from '@/lib/desktop'
import { errorMessage } from '@/lib/format'
import type {
  Alarm,
  AppSettings,
  CreateAlarmInput,
  PairedController,
  RemoteConnectionStatus,
  TimerAction,
  TimerState,
} from '@/types'

type AppMode = 'power' | 'alarms' | 'notes' | 'localsend' | 'settings'

export default function App() {
  const [isRemoteView] = useState(() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    return !isTauriRuntime() || params.get('mode') === 'remote' || params.has('pair')
  })

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

  // Settings & Remote States
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<RemoteConnectionStatus>('disconnected')
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null)
  const [pairedControllers, setPairedControllers] = useState<PairedController[]>([])

  const timerRef = useRef<TimerState | null>(null)
  timerRef.current = timer

  useEffect(() => {
    void getEffectiveSettings().then(setSettings).catch(() => undefined)
  }, [])

  useEffect(() => {
    let mounted = true
    void Promise.all([
      desktop.system.getTimerStatus(),
      desktop.alarms.list(),
      desktop.alarms.getActive(),
    ])
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

    const stopCommandListener = desktop.system.onCommand(() => {
      void desktop.system.getTimerStatus().then((t) => {
        setTimer(t)
        setNow(Date.now())
      }).catch(() => undefined)
    })

    const stopAlarmCreatedListener = desktop.alarms.onCreated((alarm) => {
      setAlarms((current) => {
        if (current.some((a) => a.id === alarm.id)) return current
        return [...current, alarm].sort((a, b) => a.timestamp - b.timestamp)
      })
    })

    const stopAlarmCancelledListener = desktop.alarms.onCancelled((id) => {
      setAlarms((current) => current.filter((a) => a.id !== id))
    })

    return () => {
      mounted = false
      stopAlarmListener()
      stopCommandListener()
      stopAlarmCreatedListener()
      stopAlarmCancelledListener()
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

  // Start Remote Engine with Supabase heartbeat and command listener
  useEffect(() => {
    if (isRemoteView || !settings) return
    let dispose: () => void = () => undefined
    let active = true

    void startRemoteEngine({
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
      getTimerState: () => timerRef.current,
      onStatusChange: (status, heartbeatTs) => {
        if (!active) return
        setConnectionStatus(status)
        if (heartbeatTs) setLastHeartbeat(heartbeatTs)
      },
      onPairedControllersChange: (controllers) => {
        if (!active) return
        setPairedControllers(controllers)
      },
    }).then((cleanup) => {
      if (active) dispose = cleanup
      else cleanup()
    }).catch(() => undefined)

    return () => {
      active = false
      dispose()
    }
  }, [isRemoteView, settings?.supabaseUrl, settings?.supabaseAnonKey, settings?.deviceId, settings?.pairingCode])

  const refreshControllers = () => {
    if (!settings?.supabaseUrl || !settings?.supabaseAnonKey || !settings?.deviceId) return
    void fetchPairedControllers(settings.supabaseUrl, settings.supabaseAnonKey, settings.deviceId).then((list) => {
      setPairedControllers(list)
    })
  }

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

  if (isRemoteView) {
    return <RemoteControllerView />
  }

  return (
    <div className={`utility-window ${mode === 'notes' ? 'utility-window--notes' : ''}`}>
      <CompactTitlebar />
      <Tabs className="app-tabs" value={mode} onValueChange={(value) => setMode(value as AppMode)}>
        <nav className="modebar" aria-label="Ana bölümler">
          <TabsList>
            <TabsTrigger value="power"><Power aria-hidden="true" size={16} />Kapat</TabsTrigger>
            <TabsTrigger value="alarms"><AlarmClock aria-hidden="true" size={16} />Alarm{alarms.length > 0 ? <span>{alarms.length}</span> : null}</TabsTrigger>
            <TabsTrigger value="notes"><BookOpen aria-hidden="true" size={16} />Defter</TabsTrigger>
            <TabsTrigger value="localsend"><Share2 aria-hidden="true" size={16} />Paylaş</TabsTrigger>
            <TabsTrigger value="settings"><Settings aria-hidden="true" size={16} />Ayarlar</TabsTrigger>
          </TabsList>
          <div className="modebar__runtime">
            <span className={`runtime-dot ${connectionStatus === 'connected' ? 'runtime-dot--online' : ''}`} />
            {connectionStatus === 'connected' ? 'çevrim içi' : 'yerel'}
          </div>
        </nav>
        <main className="utility-content">
          <TabsContent value="power">
            <PowerPage timer={timer} now={now} busy={powerBusy} error={powerError} onSchedule={schedulePower} onCancel={cancelPower} />
          </TabsContent>
          <TabsContent value="alarms">
            <AlarmsPage alarms={alarms} busy={alarmBusy} error={alarmError} onCreate={createAlarm} onCancel={cancelAlarm} />
          </TabsContent>
          <TabsContent value="notes">
            <NotesPage />
          </TabsContent>
          <TabsContent value="localsend">
            <LocalSendPage />
          </TabsContent>
          <TabsContent value="settings">
            {settings ? (
              <SettingsPage
                settings={settings}
                connectionStatus={connectionStatus}
                lastHeartbeat={lastHeartbeat}
                pairedControllers={pairedControllers}
                onSettingsChange={setSettings}
                onRefreshControllers={refreshControllers}
              />
            ) : null}
          </TabsContent>
        </main>
      </Tabs>
      {appError ? <div className="app-error" role="alert"><X aria-hidden="true" size={14} />{appError}<button type="button" aria-label="Hatayı kapat" onClick={() => setAppError(null)}><X aria-hidden="true" size={13} /></button></div> : null}
      {ringingAlarm ? <RingingOverlay alarm={ringingAlarm} onDismiss={() => void dismissAlarm()} onSnooze={() => void snoozeAlarm()} /> : null}
    </div>
  )
}
