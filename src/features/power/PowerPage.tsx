import { useState } from 'react'
import Clock3 from 'lucide-react/dist/esm/icons/clock-3.js'
import Power from 'lucide-react/dist/esm/icons/power.js'
import RotateCw from 'lucide-react/dist/esm/icons/rotate-cw.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { durationLabel, targetLabel } from '@/lib/format'
import type { TimerAction, TimerState } from '@/types'

interface PowerPageProps {
  timer: TimerState | null
  now: number
  busy: boolean
  error: string | null
  onSchedule: (action: TimerAction, seconds: number) => Promise<void>
  onCancel: () => Promise<void>
}

const presets = [
  { label: '15 dk', seconds: 15 * 60 },
  { label: '30 dk', seconds: 30 * 60 },
  { label: '1 saat', seconds: 60 * 60 },
  { label: '2 saat', seconds: 2 * 60 * 60 },
]

function clampNumber(value: string, max: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : 0
}

function DurationField({ id, label, value, max, onChange }: { id: string; label: string; value: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="duration-field">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} inputMode="numeric" min={0} max={max} type="number" value={value} onChange={(event) => onChange(clampNumber(event.target.value, max))} />
    </div>
  )
}

export function PowerPage({ timer, now, busy, error, onSchedule, onCancel }: PowerPageProps) {
  const [action, setAction] = useState<TimerAction>('shutdown')
  const [hours, setHours] = useState(0)
  const [minutes, setMinutes] = useState(30)
  const [seconds, setSeconds] = useState(0)
  const totalSeconds = hours * 3600 + minutes * 60 + seconds
  const remaining = timer ? Math.max(0, Math.ceil((timer.targetAt - now) / 1000)) : 0
  const targetAction = timer?.action === 'restart' ? 'Yeniden başlatma' : 'Kapatma'
  const summary = durationLabel(totalSeconds)

  function applyPreset(value: number) {
    setHours(Math.floor(value / 3600))
    setMinutes(Math.floor((value % 3600) / 60))
    setSeconds(value % 60)
  }

  if (timer) {
    return (
      <section className="utility-screen power-active" aria-labelledby="power-active-title">
        <div className="active-state-label"><span className="active-state-dot" aria-hidden="true" />Windows planı aktif</div>
        <div className="active-countdown" aria-live="polite">{durationLabel(remaining)}</div>
        <h1 id="power-active-title">{targetAction} planlandı</h1>
        <p className="active-target"><Clock3 aria-hidden="true" size={15} />{targetLabel(timer.targetAt)}</p>
        <div className="active-rule" />
        <Button className="power-primary" variant="danger" disabled={busy} onClick={() => void onCancel()}>
          <X aria-hidden="true" size={17} />{busy ? 'İptal ediliyor…' : 'Planı iptal et'}
        </Button>
        {error ? <p className="form-error" role="alert"><X aria-hidden="true" size={14} />{error}</p> : null}
        <p className="runtime-note">Pencere kapansa da Windows sayacı çalışır.</p>
      </section>
    )
  }

  return (
    <section className="utility-screen power-screen" aria-labelledby="power-title">
      <header className="screen-heading">
        <div>
          <h1 id="power-title">Güç sayacı</h1>
          <p>Süre dolunca seçilen Windows işlemi uygulanır.</p>
        </div>
        <span className="screen-heading__value">{summary}</span>
      </header>

      <div className="preset-row" aria-label="Hazır süreler">
        {presets.map((preset) => (
          <button type="button" key={preset.seconds} onClick={() => applyPreset(preset.seconds)}>{preset.label}</button>
        ))}
      </div>

      <div className="form-section">
        <span className="section-label">Süre</span>
        <div className="duration-grid">
          <DurationField id="shutdown-hours" label="Saat" max={99} value={hours} onChange={setHours} />
          <DurationField id="shutdown-minutes" label="Dakika" max={59} value={minutes} onChange={setMinutes} />
          <DurationField id="shutdown-seconds" label="Saniye" max={59} value={seconds} onChange={setSeconds} />
        </div>
      </div>

      <div className="form-section form-section--action">
        <span className="section-label">Süre dolunca</span>
        <ToggleGroup type="single" value={action} onValueChange={(value) => { if (value) setAction(value as TimerAction) }} aria-label="Windows işlemi">
          <ToggleGroupItem value="shutdown"><Power aria-hidden="true" size={16} />Kapat</ToggleGroupItem>
          <ToggleGroupItem value="restart"><RotateCw aria-hidden="true" size={16} />Yeniden başlat</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Button className="power-primary" variant="accent" disabled={busy || totalSeconds < 1} onClick={() => void onSchedule(action, totalSeconds)}>
        {action === 'shutdown' ? <Power aria-hidden="true" size={17} /> : <RotateCw aria-hidden="true" size={17} />}
        {busy ? 'Planlanıyor…' : action === 'shutdown' ? 'Kapatmayı planla' : 'Yeniden başlatmayı planla'}
      </Button>
      {error ? <p className="form-error" role="alert"><X aria-hidden="true" size={14} />{error}</p> : null}
      <div className="runtime-note"><span>Windows ile açılır</span><span>Tepside çalışır</span></div>
    </section>
  )
}
