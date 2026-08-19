export type TimerAction = 'shutdown' | 'restart'

export interface TimerState {
  action: TimerAction
  targetAt: number
  durationSeconds: number
}

export type AlarmSoundProfile = 'gentle' | 'chime' | 'urgent'

export interface Alarm {
  id: string
  timestamp: number
  note: string
  createdAt: number
  intervalSeconds: number | null
  remainingOccurrences: number | null
  soundEnabled: boolean
  soundProfile: AlarmSoundProfile
}

export interface CreateAlarmInput {
  timestamp: number
  note: string
  intervalSeconds: number | null
  occurrenceCount: number | null
  soundEnabled: boolean
  soundProfile: AlarmSoundProfile
}

