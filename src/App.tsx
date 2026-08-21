import { useEffect, useRef, useState } from 'react'
import X from 'lucide-react/dist/esm/icons/x.js'
import { MiniOsDock, type MiniOsMode } from '@/components/layout/MiniOsDock'
import { MiniOsHeader } from '@/components/layout/MiniOsHeader'
import { PairingModal } from '@/components/PairingModal'
import { QuickActionsPanel } from '@/components/QuickActionsPanel'
import { RingingOverlay } from '@/components/RingingOverlay'
import { AlarmsPage } from '@/features/alarms/AlarmsPage'
import { BrowserPage } from '@/features/browser/BrowserPage'
import { requestBrowserNavigation } from '@/features/browser/browserData'
import { MiniOsDashboard } from '@/features/home/MiniOsDashboard'
import { LocalSendPage } from '@/features/localsend/LocalSendPage'
import { NotesPage } from '@/features/notes/NotesPage'
import { QuickSwitcherModal } from '@/features/notes/search/QuickSwitcherModal'
import { PowerPage } from '@/features/power/PowerPage'
import { RemoteControllerView } from '@/features/remote/RemoteControllerView'
import {
  fetchPairedControllers,
  getEffectiveSettings,
  startRemoteEngine,
} from '@/features/remote/client'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { desktop, isElectronRuntime } from '@/lib/desktop'
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

export default function App() {
  const [isRemoteView] = useState(() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    const desktopPreview = params.get('preview') === 'desktop'
    return (!isElectronRuntime() && !desktopPreview) || params.get('mode') === 'remote' || params.has('pair')
  })

  const [mode, setMode] = useState<MiniOsMode>('home')
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light')
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)
  const [pairingModalOpen, setPairingModalOpen] = useState(false)
  const [isCustomizeWidgetsOpen, setIsCustomizeWidgetsOpen] = useState(false)

  // Power & Alarm states
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

  // Keyboard shortcut (Ctrl+K for Quick Switcher)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setQuickSwitcherOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Initial local data and Electron event listeners
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

  const browserSurfaceVisible = mode === 'browser'
    && !quickActionsOpen
    && !quickSwitcherOpen
    && !ringingAlarm

  useEffect(() => {
    if (!browserSurfaceVisible) void desktop.browser.setVisible(false).catch(() => undefined)
    const restoreOnFocus = () => {
      if (browserSurfaceVisible) void desktop.browser.setVisible(true).catch(() => undefined)
    }
    window.addEventListener('focus', restoreOnFocus)
    return () => window.removeEventListener('focus', restoreOnFocus)
  }, [browserSurfaceVisible])

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

  function handleExecuteCommand(cmd: string) {
    const lower = cmd.toLowerCase().trim()
    if (lower.startsWith('/kapat') || lower.startsWith('kapat')) {
      setMode('power')
    } else if (lower.startsWith('/alarm') || lower.startsWith('alarm')) {
      setMode('alarms')
    } else if (lower.startsWith('/not') || lower.startsWith('not')) {
      setMode('notes')
    } else if (lower.startsWith('/paylas') || lower.startsWith('paylaş')) {
      setMode('localsend')
    } else {
      requestBrowserNavigation(cmd)
      setMode('browser')
    }
  }

  if (isRemoteView) {
    return <RemoteControllerView />
  }

  return (
    <div className={`minios-window ${themeMode === 'dark' ? 'minios-window--dark' : 'minios-window--light'}`}>
      {/* Background Scenic Ambient Glow / Mountains Wallpaper effect */}
      <div className="minios-wallpaper-backdrop" />

      {/* Main Mini-OS Shell Layout */}
      <div className="minios-shell">
        {/* Left Floating Vertical Dock */}
        <MiniOsDock
          activeMode={mode}
          onSelectMode={setMode}
          alarmsCount={alarms.length}
          connectionStatus={connectionStatus}
          onQuickAction={() => setQuickActionsOpen(true)}
          onOpenQuickSwitcher={() => setQuickSwitcherOpen(true)}
        />

        {/* Right Main Working Area */}
        <div className="minios-main-area">
          {/* Browser and home share one titlebar; utility screens keep the same window controls. */}
          <MiniOsHeader
            activeMode={mode}
            onOpenQuickSwitcher={() => setQuickSwitcherOpen(true)}
            onExecuteCommand={handleExecuteCommand}
          />

          {/* Central Working Screen / Widgets Area */}
          <main className={`minios-viewport ${mode === 'notes' ? 'minios-viewport--notes' : ''}`}>
            {mode === 'home' && (
              <MiniOsDashboard
                onNavigate={(targetMode: MiniOsMode) => setMode(targetMode)}
                timer={timer}
                now={now}
                onSchedulePower={schedulePower}
                onCancelPower={cancelPower}
                deviceName={settings?.deviceName || 'Windows PC'}
                pairingCode={settings?.pairingCode || 'KAP-XXXX'}
                connectionStatus={connectionStatus}
                pairedControllers={pairedControllers}
                onRefreshControllers={refreshControllers}
                onOpenPairingModal={() => setPairingModalOpen(true)}
                isCustomizeOpen={isCustomizeWidgetsOpen}
                onToggleCustomizeOpen={setIsCustomizeWidgetsOpen}
              />
            )}

            {mode === 'power' && (
              <div className="minios-subscreen">
                <PowerPage
                  timer={timer}
                  now={now}
                  busy={powerBusy}
                  error={powerError}
                  onSchedule={schedulePower}
                  onCancel={cancelPower}
                />
              </div>
            )}

            {mode === 'alarms' && (
              <div className="minios-subscreen">
                <AlarmsPage
                  alarms={alarms}
                  busy={alarmBusy}
                  error={alarmError}
                  onCreate={createAlarm}
                  onCancel={cancelAlarm}
                />
              </div>
            )}

            {mode === 'notes' && <NotesPage />}

            {mode === 'localsend' && (
              <div className="minios-subscreen minios-subscreen--full">
                <LocalSendPage />
              </div>
            )}

            {mode === 'remote' && (
              <div className="minios-subscreen minios-subscreen--full">
                <RemoteControllerView />
              </div>
            )}

            {mode === 'settings' && settings && (
              <div className="minios-subscreen">
                <SettingsPage
                  settings={settings}
                  connectionStatus={connectionStatus}
                  lastHeartbeat={lastHeartbeat}
                  pairedControllers={pairedControllers}
                  onSettingsChange={setSettings}
                  onRefreshControllers={refreshControllers}
                  themeMode={themeMode}
                  onToggleTheme={() => setThemeMode((m) => (m === 'dark' ? 'light' : 'dark'))}
                />
              </div>
            )}

            <div
              className={`minios-subscreen minios-subscreen--full edge-browser-persistent-screen ${mode === 'browser' ? '' : 'edge-browser-persistent-screen--hidden'}`}
              aria-hidden={mode !== 'browser'}
            >
              <BrowserPage
                isVisible={browserSurfaceVisible}
                theme={themeMode}
                chromeMode={mode === 'browser' ? 'browser' : mode === 'home' ? 'home' : undefined}
                onEnterBrowser={() => setMode('browser')}
                onNoTabs={() => setMode('home')}
                onExecuteCommand={handleExecuteCommand}
              />
            </div>
          </main>
        </div>
      </div>

      {/* Global Quick Switcher Launcher (Ctrl+K) */}
      <QuickSwitcherModal
        isOpen={quickSwitcherOpen}
        onClose={() => setQuickSwitcherOpen(false)}
      />

      {/* Global Pairing Modal (Zero-Config QR & Local PIN) */}
      <PairingModal
        isOpen={pairingModalOpen}
        onClose={() => setPairingModalOpen(false)}
        settings={settings}
        connectionStatus={connectionStatus}
        pairedControllers={pairedControllers}
        onSettingsChange={setSettings}
      />

      <QuickActionsPanel
        isOpen={quickActionsOpen}
        busy={powerBusy}
        onClose={() => setQuickActionsOpen(false)}
        onNavigate={setMode}
        onSchedulePower={schedulePower}
      />

      {/* Global Error Toast */}
      {appError ? (
        <div className="app-error" role="alert">
          <X aria-hidden="true" size={14} />
          {appError}
          <button type="button" aria-label="Hatayı kapat" onClick={() => setAppError(null)}>
            <X aria-hidden="true" size={13} />
          </button>
        </div>
      ) : null}

      {/* Ringing Alarm Overlay */}
      {ringingAlarm ? (
        <RingingOverlay
          alarm={ringingAlarm}
          onDismiss={() => void dismissAlarm()}
          onSnooze={() => void snoozeAlarm()}
        />
      ) : null}
    </div>
  )
}
