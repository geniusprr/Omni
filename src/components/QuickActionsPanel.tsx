import AlarmClock from 'lucide-react/dist/esm/icons/alarm-clock.js'
import FilePlus2 from 'lucide-react/dist/esm/icons/file-plus-2.js'
import Globe2 from 'lucide-react/dist/esm/icons/globe-2.js'
import Power from 'lucide-react/dist/esm/icons/power.js'
import RotateCw from 'lucide-react/dist/esm/icons/rotate-cw.js'
import Send from 'lucide-react/dist/esm/icons/send.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import type { MiniOsMode } from '@/components/layout/MiniOsDock'
import type { TimerAction } from '@/types'

interface QuickActionsPanelProps {
  isOpen: boolean
  busy: boolean
  onClose: () => void
  onNavigate: (mode: MiniOsMode) => void
  onSchedulePower: (action: TimerAction, seconds: number) => Promise<void>
}

export function QuickActionsPanel({
  isOpen,
  busy,
  onClose,
  onNavigate,
  onSchedulePower,
}: QuickActionsPanelProps) {
  if (!isOpen) return null

  function navigate(mode: MiniOsMode) {
    onNavigate(mode)
    onClose()
  }

  async function schedule(action: TimerAction, seconds: number) {
    await onSchedulePower(action, seconds)
    onClose()
  }

  return (
    <div className="quick-actions-backdrop" onClick={onClose}>
      <section className="quick-actions-panel" role="dialog" aria-modal="true" aria-labelledby="quick-actions-title" onClick={(event) => event.stopPropagation()}>
        <header className="quick-actions-panel__head">
          <div>
            <h2 id="quick-actions-title">Hızlı eylemler</h2>
            <p>Sık kullanılan sistem işlemlerini tek dokunuşla başlat.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Hızlı eylemleri kapat"><X size={15} /></button>
        </header>

        <div className="quick-actions-panel__grid">
          <button type="button" disabled={busy} onClick={() => void schedule('shutdown', 30 * 60)}>
            <span className="quick-actions-panel__icon quick-actions-panel__icon--danger"><Power size={18} /></span>
            <strong>30 dk sonra kapat</strong>
            <small>Güç planı oluştur</small>
          </button>
          <button type="button" disabled={busy} onClick={() => void schedule('restart', 10 * 60)}>
            <span className="quick-actions-panel__icon quick-actions-panel__icon--warm"><RotateCw size={18} /></span>
            <strong>10 dk yeniden başlat</strong>
            <small>Güvenli yeniden başlatma</small>
          </button>
          <button type="button" onClick={() => navigate('alarms')}>
            <span className="quick-actions-panel__icon quick-actions-panel__icon--blue"><AlarmClock size={18} /></span>
            <strong>Alarm kur</strong>
            <small>Zaman ve ses seç</small>
          </button>
          <button type="button" onClick={() => navigate('notes')}>
            <span className="quick-actions-panel__icon quick-actions-panel__icon--green"><FilePlus2 size={18} /></span>
            <strong>Yeni not</strong>
            <small>Defteri aç</small>
          </button>
          <button type="button" onClick={() => navigate('browser')}>
            <span className="quick-actions-panel__icon quick-actions-panel__icon--blue"><Globe2 size={18} /></span>
            <strong>Tarayıcı</strong>
            <small>Yeni sekmeye geç</small>
          </button>
          <button type="button" onClick={() => navigate('localsend')}>
            <span className="quick-actions-panel__icon quick-actions-panel__icon--green"><Send size={18} /></span>
            <strong>Dosya paylaş</strong>
            <small>LocalSend’i aç</small>
          </button>
        </div>
      </section>
    </div>
  )
}
