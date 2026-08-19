import AlarmClock from 'lucide-react/dist/esm/icons/alarm-clock.js'
import Clock3 from 'lucide-react/dist/esm/icons/clock-3.js'
import Volume2 from 'lucide-react/dist/esm/icons/volume-2.js'
import { Button } from '@/components/ui/button'
import { alarmTimeLabel } from '@/lib/format'
import type { Alarm } from '@/types'

interface RingingOverlayProps {
  alarm: Alarm
  onDismiss: () => void
  onSnooze: () => void
}

export function RingingOverlay({ alarm, onDismiss, onSnooze }: RingingOverlayProps) {
  return (
    <div className="ringing-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="ringing-title">
      <section className="ringing-panel">
        <div className="ringing-icon" aria-hidden="true"><Volume2 aria-hidden="true" size={22} /></div>
        <p className="ringing-time">{alarmTimeLabel(Date.now())}</p>
        <h2 id="ringing-title">{alarm.note || 'Alarm zamanı'}</h2>
        <p>{alarm.intervalSeconds ? 'Tekrarlayan alarm' : 'Planlanan alarm'}</p>
        <div className="ringing-actions">
          <Button variant="soft" onClick={onSnooze}><Clock3 aria-hidden="true" size={16} />5 dk ertele</Button>
          <Button variant="accent" onClick={onDismiss}><AlarmClock aria-hidden="true" size={16} />Kapat</Button>
        </div>
      </section>
    </div>
  )
}
