import { getLocaleTag } from '@/i18n'

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
  const locale = getLocaleTag()
  const unit = (value: number, name: Intl.NumberFormatOptions['unit']) => new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: name,
    unitDisplay: 'narrow',
    maximumFractionDigits: 0,
  }).format(value)
  if (totalSeconds < 60) return unit(totalSeconds, 'second')
  if (totalSeconds < 3600) return unit(Math.round(totalSeconds / 60), 'minute')
  if (totalSeconds % 3600 === 0) return unit(totalSeconds / 3600, 'hour')
  return `${unit(Math.floor(totalSeconds / 3600), 'hour')} ${unit(Math.round((totalSeconds % 3600) / 60), 'minute')}`
}

export function dateButtonLabel(date: Date) {
  return new Intl.DateTimeFormat(getLocaleTag(), { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

export function alarmDateLabel(timestamp: number) {
  return new Intl.DateTimeFormat(getLocaleTag(), { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(timestamp))
}

export function alarmTimeLabel(timestamp: number) {
  return new Intl.DateTimeFormat(getLocaleTag(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp))
}

export function targetLabel(timestamp: number) {
  return new Intl.DateTimeFormat(getLocaleTag(), {
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
