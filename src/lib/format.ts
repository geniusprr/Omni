const pad = (value: number) => String(value).padStart(2, '0')

export function defaultAlarmDate() {
  return new Date(Date.now() + 10 * 60 * 1000)
}

export function timeInputValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function durationLabel(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

export function compactDuration(totalSeconds: number) {
  if (totalSeconds < 60) return `${totalSeconds} sn`
  if (totalSeconds < 3600) return `${Math.round(totalSeconds / 60)} dk`
  if (totalSeconds % 3600 === 0) return `${totalSeconds / 3600} sa`
  return `${Math.floor(totalSeconds / 3600)} sa ${Math.round((totalSeconds % 3600) / 60)} dk`
}

export function dateButtonLabel(date: Date) {
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

export function alarmDateLabel(timestamp: number) {
  return new Intl.DateTimeFormat('tr-TR', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(timestamp))
}

export function alarmTimeLabel(timestamp: number) {
  return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp))
}

export function targetLabel(timestamp: number) {
  return new Intl.DateTimeFormat('tr-TR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

