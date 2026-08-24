import React, { useEffect, useState } from 'react'
import Check from 'lucide-react/dist/esm/icons/check.js'
import Copy from 'lucide-react/dist/esm/icons/copy.js'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js'
import Globe from 'lucide-react/dist/esm/icons/globe.js'
import Laptop from 'lucide-react/dist/esm/icons/laptop.js'
import Lock from 'lucide-react/dist/esm/icons/lock.js'
import QrCodeIcon from 'lucide-react/dist/esm/icons/qr-code.js'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js'
import Send from 'lucide-react/dist/esm/icons/send.js'
import Shield from 'lucide-react/dist/esm/icons/shield.js'
import Smartphone from 'lucide-react/dist/esm/icons/smartphone.js'
import Wifi from 'lucide-react/dist/esm/icons/wifi.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import {
  createPairingPayload,
  generatePairingCode,
  generatePairingSecret,
  saveEffectiveSettings,
} from '@/features/remote/client'
import { desktop } from '@/lib/desktop'
import type { AppSettings, PairedController, RemoteConnectionStatus } from '@/types'

interface PairingModalProps {
  isOpen: boolean
  onClose: () => void
  settings: AppSettings | null
  connectionStatus: RemoteConnectionStatus
  pairedControllers?: PairedController[]
  onSettingsChange?: (newSettings: AppSettings) => void
}

export function PairingModal({
  isOpen,
  onClose,
  settings,
  connectionStatus,
  pairedControllers = [],
  onSettingsChange,
}: PairingModalProps) {
  const [activeTab, setActiveTab] = useState<'cloud' | 'local'>('cloud')
  const [localIps, setLocalIps] = useState<string[]>([])
  const [cloudQrUrl, setCloudQrUrl] = useState<string>('')
  const [localQrUrl, setLocalQrUrl] = useState<string>('')
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [testNotifSent, setTestNotifSent] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Fetch local IPs from LocalSend / Network status
  useEffect(() => {
    if (!isOpen) return
    void desktop.localsend.getStatus().then((st) => {
      if (st.allIps && st.allIps.length > 0) {
        setLocalIps(st.allIps)
      } else if (st.localIp) {
        setLocalIps([st.localIp])
      }
    }).catch(() => undefined)
  }, [isOpen])

  // Build Cloud Pairing URL & Payload
  const cloudRemoteUrl = settings?.supabaseUrl && settings?.supabaseAnonKey
    ? (() => {
        const payload = createPairingPayload(settings, localIps)
        const host = typeof window !== 'undefined' ? window.location.origin : 'https://kapanis.app'
        return `${host}/?mode=remote&pair_data=${encodeURIComponent(payload)}`
      })()
    : ''

  // Build Local Pairing URL & QR Payload
  const localPrimaryIp = localIps.length > 0 ? localIps[0] : 'localhost'
  const localCompanionUrl = `http://${localPrimaryIp}:53317`
  const localQrTarget = settings
    ? `http://${localPrimaryIp}:53317/?pair_data=${encodeURIComponent(createPairingPayload(settings, localIps))}`
    : localCompanionUrl

  // Generate High-Contrast Crisp QR Codes (Optimized for Phone Cameras)
  useEffect(() => {
    if (!isOpen) return

    if (cloudRemoteUrl) {
      void QRCode.toDataURL(cloudRemoteUrl, {
        margin: 2,
        width: 280,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      }).then(setCloudQrUrl).catch(() => undefined)
    }

    if (localQrTarget) {
      void QRCode.toDataURL(localQrTarget, {
        margin: 2,
        width: 280,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      }).then(setLocalQrUrl).catch(() => undefined)
    }
  }, [isOpen, cloudRemoteUrl, localQrTarget])

  if (!isOpen || !settings) return null

  function handleCopy(text: string, isLink: boolean) {
    void navigator.clipboard.writeText(text)
    if (isLink) {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } else {
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    }
  }

  async function handleRegenerateCode() {
    if (!settings || regenerating) return
    setRegenerating(true)
    const newCode = generatePairingCode()
    const newSecret = generatePairingSecret()
    const updated: AppSettings = {
      ...settings,
      pairingCode: newCode,
      pairingSecret: newSecret,
    }
    await saveEffectiveSettings(updated)
    if (onSettingsChange) {
      onSettingsChange(updated)
    }
    setTimeout(() => setRegenerating(false), 400)
  }

  async function handleSendTestNotification() {
    setTestNotifSent(true)
    await desktop.notifications.test(
      'Eon Eşleştirme Testi',
      'Bilgisayarınız ile telefonunuz başarıyla bağlandı!'
    )
    setTimeout(() => setTestNotifSent(false), 2500)
  }

  return (
    <div className="pairing-overlay" onClick={onClose}>
      <div className="pairing-card-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <header className="pairing-card-header">
          <div className="pairing-card-header__info">
            <div className="pairing-card-header__icon">
              <Smartphone size={18} />
            </div>
            <div>
              <h3>Telefon / Kumanda Eşleştir</h3>
              <p>Telefon kamerasından QR okutarak hemen kontrol edin</p>
            </div>
          </div>
          <button type="button" className="pairing-close-btn" onClick={onClose} aria-label="Kapat">
            <X size={16} />
          </button>
        </header>

        {/* Tab Switcher */}
        <div className="pairing-tabs">
          <button
            type="button"
            className={`pairing-tab-btn ${activeTab === 'cloud' ? 'pairing-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('cloud')}
          >
            <Globe size={14} />
            <span>☁️ Bulut Kumanda (Sıfır Yapılandırma)</span>
          </button>
          <button
            type="button"
            className={`pairing-tab-btn ${activeTab === 'local' ? 'pairing-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('local')}
          >
            <Wifi size={14} />
            <span>📶 Yerel Wi-Fi (Aynı Ağda & PIN)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="pairing-card-body">
          {/* TAB 1: CLOUD ZERO-CONFIG QR */}
          {activeTab === 'cloud' && (
            <div className="pairing-tab-content">
              {settings.supabaseUrl && settings.supabaseAnonKey ? (
                <>
                  <div className="pairing-qr-wrapper">
                    {cloudQrUrl ? (
                      <div className="pairing-qr-frame">
                        <img src={cloudQrUrl} alt="Bulut Eşleştirme QR Kodu" className="pairing-qr-img" />
                      </div>
                    ) : (
                      <div className="pairing-qr-skeleton">QR Oluşturuluyor...</div>
                    )}
                  </div>

                  <div className="pairing-status-row">
                    <span className={`pairing-dot ${connectionStatus === 'connected' ? 'pairing-dot--online' : ''}`} />
                    <span className="pairing-status-label">
                      {connectionStatus === 'connected' ? 'Supabase Bulut Aktif' : 'Bulut Sunucusuna Bağlanıyor...'}
                    </span>
                  </div>

                  <div className="pairing-code-capsule">
                    <div className="pairing-code-text-group">
                      <span className="pairing-code-hint">EŞLEŞTİRME KODU</span>
                      <strong className="pairing-code-string">{settings.pairingCode}</strong>
                    </div>
                    <Button
                      size="compact"
                      variant="soft"
                      onClick={() => handleCopy(settings.pairingCode, false)}
                    >
                      {copiedCode ? <Check size={13} /> : <Copy size={13} />}
                      {copiedCode ? 'Kopyalandı' : 'Kodu Al'}
                    </Button>
                  </div>

                  <p className="pairing-guide-text">
                    📷 Telefonunuzun kamera uygulamasını veya Eon mobil uygulamasını açıp yukarıdaki QR kodu okutun.
                    Supabase ayarları ve anahtarlar telefona otomatik yüklenir.
                  </p>

                  <div className="pairing-actions-grid">
                    <Button
                      variant="accent"
                      onClick={() => handleCopy(cloudRemoteUrl, true)}
                    >
                      {copiedLink ? <Check size={15} /> : <Copy size={15} />}
                      {copiedLink ? 'Link Kopyalandı ✓' : 'Eşleştirme Linkini Kopyala'}
                    </Button>

                    <Button
                      variant="soft"
                      title="Yeni kod üret"
                      onClick={() => void handleRegenerateCode()}
                      disabled={regenerating}
                    >
                      <RefreshCw size={14} className={regenerating ? 'animate-spin' : ''} />
                      Yeni Kod
                    </Button>
                  </div>
                </>
              ) : (
                <div className="pairing-empty-state">
                  <Shield size={32} className="text-amber-400" />
                  <h4>Supabase Ayarları Eksik</h4>
                  <p>
                    Bulut üzerinden her yerden bağlanabilmek için Ayarlar sayfasından Supabase URL ve Anon Key girmeniz gerekir.
                  </p>
                  <Button variant="accent" onClick={onClose}>
                    Ayarlara Git
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LOCAL WI-FI & PIN */}
          {activeTab === 'local' && (
            <div className="pairing-tab-content">
              <div className="pairing-qr-wrapper">
                {localQrUrl ? (
                  <div className="pairing-qr-frame">
                    <img src={localQrUrl} alt="Yerel Wi-Fi QR Kodu" className="pairing-qr-img" />
                  </div>
                ) : (
                  <div className="pairing-qr-skeleton">QR Oluşturuluyor...</div>
                )}
              </div>

              <div className="pairing-code-capsule">
                <div className="pairing-code-text-group">
                  <span className="pairing-code-hint">
                    <Lock size={10} style={{ display: 'inline', marginRight: 4 }} />
                    YEREL AĞ GİRİŞ ŞİFRESİ / PIN
                  </span>
                  <strong className="pairing-code-string">{settings.pairingCode}</strong>
                </div>
                <Button
                  size="compact"
                  variant="soft"
                  onClick={() => handleCopy(settings.pairingCode, false)}
                >
                  {copiedCode ? <Check size={13} /> : <Copy size={13} />}
                  {copiedCode ? 'Kopyalandı' : 'Kodu Al'}
                </Button>
              </div>

              <div className="pairing-local-ip-badge">
                <Wifi size={13} />
                <span>Yerel Adres: <strong>{localCompanionUrl}</strong></span>
              </div>

              <p className="pairing-guide-text">
                Aynı Wi-Fi ağına bağlı telefon, tablet veya laptop tarayıcısından <strong>{localCompanionUrl}</strong> adresine girin ve ilk girişte yukarıdaki 4 haneli PIN kodunu yazın.
              </p>

              <div className="pairing-actions-grid">
                <Button
                  variant="accent"
                  onClick={() => handleCopy(localCompanionUrl, true)}
                >
                  {copiedLink ? <Check size={15} /> : <Copy size={15} />}
                  {copiedLink ? 'Yerel Link Kopyalandı ✓' : 'Wi-Fi Linkini Kopyala'}
                </Button>
                <Button
                  variant="soft"
                  onClick={() => void desktop.openExternal(localCompanionUrl)}
                >
                  <ExternalLink size={14} /> Tarayıcıda Aç
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer with Live Connected Controllers & Test Notif */}
        <footer className="pairing-card-footer">
          <div className="pairing-controllers-summary">
            <Smartphone size={14} />
            <span>
              {pairedControllers.length > 0
                ? `${pairedControllers.length} cihaz eşleşti (${pairedControllers.map((c) => c.controllerName).join(', ')})`
                : 'Henüz bağlı cihaz yok'}
            </span>
          </div>

          <Button
            size="compact"
            variant="soft"
            onClick={() => void handleSendTestNotification()}
            disabled={testNotifSent}
          >
            <Send size={12} />
            {testNotifSent ? 'Test Bildirimi Yollandı ✓' : 'Test Bildirimi Gönder'}
          </Button>
        </footer>
      </div>
    </div>
  )
}
