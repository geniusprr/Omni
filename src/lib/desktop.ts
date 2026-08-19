import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { Alarm, CreateAlarmInput, TimerAction, TimerState } from '@/types'

type TriggeredAlarmHandler = (alarm: Alarm) => void

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function assertTauriRuntime() {
  if (!isTauriRuntime()) {
    throw new Error('kapanış. yalnızca Windows uygulaması olarak çalışır. npm run tauri:dev komutunu kullan.')
  }
}

function listenWithoutBlocking<T>(
  eventName: string,
  callback: (payload: T) => void,
  onError?: (error: unknown) => void,
) {
  assertTauriRuntime()
  let active = true
  let unlisten: UnlistenFn | null = null

  void listen<T>(eventName, (event) => callback(event.payload))
    .then((cleanup) => {
      unlisten = cleanup
      if (!active) cleanup()
    })
    .catch((error) => {
      if (active) onError?.(error)
    })

  return () => {
    active = false
    unlisten?.()
  }
}

export const desktop = {
  window: {
    minimize: async () => {
      assertTauriRuntime()
      await getCurrentWindow().minimize()
    },
    close: async () => {
      assertTauriRuntime()
      await getCurrentWindow().close()
    },
  },
  system: {
    getTimerStatus: () => {
      assertTauriRuntime()
      return invoke<TimerState | null>('get_timer_status')
    },
    scheduleShutdown: (action: TimerAction, seconds: number) => {
      assertTauriRuntime()
      return invoke<TimerState>('schedule_shutdown', { action, seconds })
    },
    cancelShutdown: () => {
      assertTauriRuntime()
      return invoke<void>('cancel_shutdown')
    },
  },
  alarms: {
    list: () => {
      assertTauriRuntime()
      return invoke<Alarm[]>('list_alarms')
    },
    getActive: () => {
      assertTauriRuntime()
      return invoke<Alarm | null>('get_active_alarm')
    },
    create: (payload: CreateAlarmInput) => {
      assertTauriRuntime()
      return invoke<Alarm>('create_alarm', { input: payload })
    },
    cancel: (id: string) => {
      assertTauriRuntime()
      return invoke<boolean>('cancel_alarm', { id })
    },
    stopSound: () => {
      assertTauriRuntime()
      return invoke<void>('stop_alarm_sound')
    },
    onTriggered: (callback: TriggeredAlarmHandler, onError?: (error: unknown) => void) => {
      if (!isTauriRuntime()) return () => undefined
      return listenWithoutBlocking<Alarm>('alarm:triggered', callback, onError)
    },
  },
}
