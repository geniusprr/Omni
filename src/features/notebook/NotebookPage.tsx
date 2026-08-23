import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import BookOpen from 'lucide-react/dist/esm/icons/book-open.js'
import Check from 'lucide-react/dist/esm/icons/check.js'
import Copy from 'lucide-react/dist/esm/icons/copy.js'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import Folder from 'lucide-react/dist/esm/icons/folder.js'
import Pin from 'lucide-react/dist/esm/icons/pin.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import QrCode from 'lucide-react/dist/esm/icons/qr-code.js'
import Smartphone from 'lucide-react/dist/esm/icons/smartphone.js'
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js'
import Wifi from 'lucide-react/dist/esm/icons/wifi.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { getEffectiveSettings } from '@/features/remote/client'
import { desktop } from '@/lib/desktop'
import type { AppSettings, ConnectionInfo, NoteItem, TransferItem } from '@/types'

interface NotebookPageProps {
  notes: NoteItem[]
  transfers: TransferItem[]
  onUpdateNotes: (notes: NoteItem[]) => void
  onUpdateTransfers: (transfers: TransferItem[]) => void
}

type SubView = 'notes' | 'transfers'

export function NotebookPage({
  notes,
  transfers,
  onUpdateNotes,
  onUpdateTransfers,
}: NotebookPageProps) {
  const [subView, setSubView] = useState<SubView>('notes')
  const [newNoteText, setNewNoteText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showQrModal, setShowQrModal] = useState(false)
  const [connInfo, setConnInfo] = useState<ConnectionInfo | null>(null)
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [activeMediaPreview, setActiveMediaPreview] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      desktop.mobile.getConnectionInfo(),
      getEffectiveSettings(),
    ]).then(([info, settings]) => {
      setConnInfo(info)
      setAppSettings(settings)

      const host = info?.ipAddresses[0] || '127.0.0.1'
      const port = info?.port || 54321
      const payload = `kapanis://connect?host=${host}&port=${port}&code=${settings.pairingCode}&supabaseUrl=${encodeURIComponent(settings.supabaseUrl || '')}&supabaseKey=${encodeURIComponent(settings.supabaseAnonKey || '')}&name=${encodeURIComponent(settings.deviceName)}`

      void QRCode.toDataURL(payload, {
        margin: 1,
        width: 220,
        color: { dark: '#0a0e16', light: '#f8fafc' },
      }).then(setQrDataUrl)
    })
  }, [])

  async function handleAddNote() {
    const trimmed = newNoteText.trim()
    if (!trimmed || isSaving) return
    setIsSaving(true)
    try {
      const saved = await desktop.notes.save(trimmed)
      onUpdateNotes([saved, ...notes])
      setNewNoteText('')
    } catch {
      // ignore
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteNote(id: string) {
    try {
      await desktop.notes.delete(id)
      onUpdateNotes(notes.filter((n) => n.id !== id))
    } catch {
      // ignore
    }
  }

  async function handleTogglePin(id: string) {
    try {
      await desktop.notes.togglePin(id)
      const updated = notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n))
      updated.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt)
      onUpdateNotes(updated)
    } catch {
      // ignore
    }
  }

  async function handleCopyText(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1800)
    } catch {
      // ignore
    }
  }

  async function handleOpenFile(path: string) {
    await desktop.transfers.open(path).catch(() => undefined)
  }

  async function handleShowFolder(path: string) {
    await desktop.transfers.showInFolder(path).catch(() => undefined)
  }

  async function handleDeleteTransfer(id: string) {
    try {
      await desktop.transfers.delete(id)
      onUpdateTransfers(transfers.filter((t) => t.id !== id))
    } catch {
      // ignore
    }
  }

  async function handleClearTransfers() {
    if (!window.confirm('Tüm aktarılan dosyaları temizlemek istiyor musunuz?')) return
    try {
      await desktop.transfers.clear()
      onUpdateTransfers([])
    } catch {
      // ignore
    }
  }

  function formatTime(timestamp: number) {
    const d = new Date(timestamp)
    const hours = d.getHours().toString().padStart(2, '0')
    const minutes = d.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }

  function formatDate(timestamp: number) {
    const d = new Date(timestamp)
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="notebook-screen">
      {/* Sub-bar */}
      <div className="notebook-header">
        <div className="notebook-subtabs">
          <button
            type="button"
            className={`notebook-subtab ${subView === 'notes' ? 'notebook-subtab--active' : ''}`}
            onClick={() => setSubView('notes')}
          >
            <BookOpen size={14} />
            Defter
            {notes.length > 0 && <span className="subtab-badge">{notes.length}</span>}
          </button>
          <button
            type="button"
            className={`notebook-subtab ${subView === 'transfers' ? 'notebook-subtab--active' : ''}`}
            onClick={() => setSubView('transfers')}
          >
            <Smartphone size={14} />
            Aktarılanlar
            {transfers.length > 0 && <span className="subtab-badge">{transfers.length}</span>}
          </button>
        </div>

        <button
          type="button"
          className="qr-connect-btn"
          onClick={() => setShowQrModal(true)}
          title="Telefondan Bağlan / QR Kod"
        >
          <QrCode size={14} />
          <span>Mobille Eşleş</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="notebook-body">
        {subView === 'notes' ? (
          <div className="notes-container">
            {/* Quick Note Input */}
            <div className="note-input-card">
              <textarea
                className="note-textarea"
                placeholder="Hızlı not yaz... (Ctrl + Enter ile kaydet)"
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    void handleAddNote()
                  }
                }}
                rows={2}
              />
              <div className="note-input-footer">
                <span className="char-count">{newNoteText.length > 0 ? `${newNoteText.length} karakter` : ''}</span>
                <button
                  type="button"
                  className="note-save-btn"
                  onClick={() => void handleAddNote()}
                  disabled={!newNoteText.trim() || isSaving}
                >
                  <Plus size={14} />
                  <span>Ekle</span>
                </button>
              </div>
            </div>

            {/* Notes List */}
            <div className="notes-list-scroll">
              {notes.length === 0 ? (
                <div className="empty-state">
                  <BookOpen size={28} className="empty-state__icon" />
                  <p>Henüz not yok.</p>
                  <span>Telefondan gönderilen notlar ve panodaki metinler anında buraya düşer.</span>
                </div>
              ) : (
                <div className="notes-grid">
                  {notes.map((note) => (
                    <div key={note.id} className={`note-card ${note.pinned ? 'note-card--pinned' : ''}`}>
                      <div className="note-card__content">{note.content}</div>
                      <div className="note-card__meta">
                        <span className="note-date">
                          {formatDate(note.createdAt)} {formatTime(note.createdAt)}
                        </span>
                        <div className="note-actions">
                          <button
                            type="button"
                            className={`note-btn ${note.pinned ? 'note-btn--pinned' : ''}`}
                            onClick={() => void handleTogglePin(note.id)}
                            title={note.pinned ? 'Sabitlemeyi Kaldır' : 'Sabitle'}
                          >
                            <Pin size={13} />
                          </button>
                          <button
                            type="button"
                            className="note-btn"
                            onClick={() => void handleCopyText(note.content, note.id)}
                            title="Kopyala"
                          >
                            {copiedId === note.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                          </button>
                          <button
                            type="button"
                            className="note-btn note-btn--danger"
                            onClick={() => void handleDeleteNote(note.id)}
                            title="Sil"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="transfers-container">
            <div className="transfers-toolbar">
              <span className="transfers-count-label">
                {transfers.length > 0 ? `${transfers.length} dosya aktarıldı` : 'Aktarılan dosya yok'}
              </span>
              {transfers.length > 0 && (
                <button
                  type="button"
                  className="clear-transfers-btn"
                  onClick={() => void handleClearTransfers()}
                >
                  <Trash2 size={13} />
                  <span>Temizle</span>
                </button>
              )}
            </div>

            <div className="transfers-list-scroll">
              {transfers.length === 0 ? (
                <div className="empty-state">
                  <Smartphone size={28} className="empty-state__icon" />
                  <p>Mobilden aktarım bekleniyor.</p>
                  <span>Telefondaki Omni uygulamasından fotoğraf veya dosya seçip anında gönderin.</span>
                </div>
              ) : (
                <div className="transfers-grid">
                  {transfers.map((item) => (
                    <div key={item.id} className="transfer-card">
                      <div className="transfer-icon-area">
                        {item.isImage ? (
                          <div
                            className="transfer-thumbnail"
                            onClick={() => setActiveMediaPreview(`http://127.0.0.1:${connInfo?.port || 54321}/api/media/${encodeURIComponent(item.filename)}`)}
                          >
                            <img
                              src={`http://127.0.0.1:${connInfo?.port || 54321}/api/media/${encodeURIComponent(item.filename)}`}
                              alt={item.filename}
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <div className="transfer-file-icon">
                            <FileText size={20} />
                          </div>
                        )}
                      </div>

                      <div className="transfer-details">
                        <div className="transfer-filename" title={item.filename}>
                          {item.filename}
                        </div>
                        <div className="transfer-subinfo">
                          <span>{formatBytes(item.size)}</span>
                          <span>•</span>
                          <span>{formatTime(item.createdAt)}</span>
                        </div>
                      </div>

                      <div className="transfer-actions">
                        <button
                          type="button"
                          className="transfer-action-btn"
                          onClick={() => void handleOpenFile(item.path)}
                          title="Dosyayı Aç"
                        >
                          <ExternalLink size={13} />
                        </button>
                        <button
                          type="button"
                          className="transfer-action-btn"
                          onClick={() => void handleShowFolder(item.path)}
                          title="Klasörde Göster"
                        >
                          <Folder size={13} />
                        </button>
                        <button
                          type="button"
                          className="transfer-action-btn transfer-action-btn--danger"
                          onClick={() => void handleDeleteTransfer(item.id)}
                          title="Sil"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* QR Pairing Modal */}
      {showQrModal && (
        <div className="qr-modal-overlay" onClick={() => setShowQrModal(false)}>
          <div className="qr-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="qr-modal-header">
              <div className="qr-modal-title">
                <Wifi size={16} className="text-sky-400" />
                <span>Telefondan Hızlı Bağlan</span>
              </div>
              <button
                type="button"
                className="qr-modal-close"
                onClick={() => setShowQrModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="qr-modal-body">
              {qrDataUrl ? (
                <div className="qr-code-wrapper">
                  <img src={qrDataUrl} alt="QR Kod" className="qr-image" />
                </div>
              ) : (
                <div className="qr-loading">QR Kod hazırlanıyor...</div>
              )}

              <div className="qr-instructions">
                <div className="qr-info-row">
                  <span className="qr-info-label">Bulut Eşleştirme Kodu:</span>
                  <span className="qr-info-val font-mono font-bold text-sky-400">{appSettings?.pairingCode || 'KAP-XXXX'}</span>
                </div>
                <div className="qr-info-row">
                  <span className="qr-info-label">Yerel Wi-Fi IP:</span>
                  <span className="qr-info-val font-mono">{connInfo?.ipAddresses[0] || '127.0.0.1'}:{connInfo?.port || 54321}</span>
                </div>
                <div className="qr-info-row">
                  <span className="qr-info-label">Cihaz Adı:</span>
                  <span className="qr-info-val">{connInfo?.deviceName || appSettings?.deviceName || 'Windows PC'}</span>
                </div>
                <p className="qr-subtext">
                  Omni Mobil uygulamasında QR kodu okutabilir veya 6 haneli kodu girerek dünyanın her yerinden uzaktan bağlanabilirsiniz.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Media Image Lightbox Preview */}
      {activeMediaPreview && (
        <div className="media-lightbox-overlay" onClick={() => setActiveMediaPreview(null)}>
          <div className="media-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={activeMediaPreview} alt="Önizleme" />
            <button
              type="button"
              className="lightbox-close-btn"
              onClick={() => setActiveMediaPreview(null)}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
