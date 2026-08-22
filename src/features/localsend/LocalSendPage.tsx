import React, { useEffect, useState } from 'react'
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle.js'
import Check from 'lucide-react/dist/esm/icons/check.js'
import Clipboard from 'lucide-react/dist/esm/icons/clipboard.js'
import Cloud from 'lucide-react/dist/esm/icons/cloud.js'
import Copy from 'lucide-react/dist/esm/icons/copy.js'
import Download from 'lucide-react/dist/esm/icons/download.js'
import FileIcon from 'lucide-react/dist/esm/icons/file.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open.js'
import Laptop from 'lucide-react/dist/esm/icons/laptop.js'
import MessageSquare from 'lucide-react/dist/esm/icons/message-square.js'
import Plus from 'lucide-react/dist/esm/icons/plus.js'
import Radio from 'lucide-react/dist/esm/icons/radio.js'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Send from 'lucide-react/dist/esm/icons/send.js'
import Share2 from 'lucide-react/dist/esm/icons/share-2.js'
import Smartphone from 'lucide-react/dist/esm/icons/smartphone.js'
import Tablet from 'lucide-react/dist/esm/icons/tablet.js'
import UploadCloud from 'lucide-react/dist/esm/icons/upload-cloud.js'
import Wifi from 'lucide-react/dist/esm/icons/wifi.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  addManualDevice,
  getLocalSendDevices,
  getLocalSendStatus,
  getReceivedFiles,
  openReceivedFolder,
  scanLocalSendNetwork,
  sendTextToDevice,
  setAutoAccept,
} from '@/features/localsend/client'
import { desktop } from '@/lib/desktop'
import type { LocalSendDevice, LocalSendStatus, PairedController, ReceivedFileRecord } from '@/types'

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function getDeviceIcon(deviceType: string) {
  switch (deviceType?.toLowerCase()) {
    case 'mobile':
      return <Smartphone size={20} />
    case 'tablet':
      return <Tablet size={20} />
    default:
      return <Laptop size={20} />
  }
}

interface LocalSendPageProps {
  pairedControllers?: PairedController[]
}

export function LocalSendPage({ pairedControllers = [] }: LocalSendPageProps) {
  const [status, setStatus] = useState<LocalSendStatus | null>(null)
  const [devices, setDevices] = useState<LocalSendDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<LocalSendDevice | null>(null)
  const [selectedController, setSelectedController] = useState<PairedController | null>(null)
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFileRecord[]>([])

  // Main hub active tab: 'send' | 'received'
  const [activeTab, setActiveTab] = useState<'send' | 'received'>('send')

  // Send mode: 'text' | 'file'
  const [sendMode, setSendMode] = useState<'text' | 'file'>('text')
  const [textMessage, setTextMessage] = useState('')
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [selectedFileSize, setSelectedFileSize] = useState<number>(0)
  const [isDragging, setIsDragging] = useState(false)

  // Loading & states
  const [scanning, setScanning] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedIp, setCopiedIp] = useState(false)

  // Manual IP add
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [manualIp, setManualIp] = useState('')
  const [manualBusy, setManualBusy] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)

  // Load initial data
  useEffect(() => {
    void getLocalSendStatus().then(setStatus).catch(() => undefined)
    void getLocalSendDevices().then((devs) => {
      setDevices(devs)
      if (devs.length > 0 && !selectedDevice) setSelectedDevice(devs[0])
    }).catch(() => undefined)
    void getReceivedFiles().then(setReceivedFiles).catch(() => undefined)

    // Listen for new discovered devices
    const unlistenDevice = desktop.localsend.onDeviceDiscovered((newDevice) => {
      setDevices((current) => {
        const filtered = current.filter((d) => `${d.ip}:${d.port}` !== `${newDevice.ip}:${newDevice.port}`)
        return [newDevice, ...filtered]
      })
    })

    // Listen for received files
    const unlistenFile = desktop.localsend.onFileReceived((file) => {
      setReceivedFiles((current) => [file, ...current])
    })

    // Periodic poll for status & devices
    const interval = setInterval(() => {
      void getLocalSendDevices().then((devs) => {
        setDevices(devs)
      }).catch(() => undefined)
    }, 4000)

    return () => {
      unlistenDevice()
      unlistenFile()
      clearInterval(interval)
    }
  }, [])

  async function handleScan() {
    setScanning(true)
    await scanLocalSendNetwork().catch(() => undefined)
    setTimeout(async () => {
      const devs = await getLocalSendDevices().catch(() => [])
      setDevices(devs)
      if (devs.length > 0 && !selectedDevice) setSelectedDevice(devs[0])
      setScanning(false)
    }, 1800)
  }

  async function handleAddManual(e: React.FormEvent) {
    e.preventDefault()
    if (!manualIp.trim()) return
    setManualBusy(true)
    setManualError(null)
    try {
      const dev = await addManualDevice(manualIp.trim())
      setDevices((current) => {
        const filtered = current.filter((d) => `${d.ip}:${d.port}` !== `${dev.ip}:${dev.port}`)
        return [dev, ...filtered]
      })
      setSelectedDevice(dev)
      setManualIp('')
      setShowManualAdd(false)
    } catch (err) {
      setManualError(err instanceof Error ? err.message : 'Cihaza bağlanılamadı. IP adresini kontrol edin.')
    } finally {
      setManualBusy(false)
    }
  }

  async function handleToggleAutoAccept(val: boolean) {
    await setAutoAccept(val).catch(() => undefined)
    if (status) setStatus({ ...status, autoAccept: val })
  }

  async function handleSendText() {
    if (!selectedDevice || !textMessage.trim()) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await sendTextToDevice(selectedDevice.ip, selectedDevice.port, textMessage.trim())
      setSendResult({ success: true, message: res || 'Metin başarıyla iletildi.' })
      setTextMessage('')
      setTimeout(() => setSendResult(null), 4000)
    } catch (e) {
      setSendResult({ success: false, message: e instanceof Error ? e.message : 'Gönderim başarısız oldu.' })
    } finally {
      setSending(false)
    }
  }

  async function handleSendFile() {
    if ((!selectedDevice && !selectedController) || !selectedFilePath) return
    setSending(true)
    setSendResult(null)
    try {
      const res = selectedController
        ? await desktop.localsend.sendCloudFile(selectedFilePath, selectedController.controllerId)
        : await desktop.localsend.sendFile(selectedDevice!.ip, selectedDevice!.port, selectedFilePath)
      setSendResult({ success: true, message: res || 'Dosya başarıyla iletildi.' })
      setSelectedFilePath(null)
      setSelectedFileName(null)
      setSelectedFileSize(0)
      setTimeout(() => setSendResult(null), 4000)
    } catch (e) {
      setSendResult({ success: false, message: e instanceof Error ? e.message : 'Dosya gönderilemedi.' })
    } finally {
      setSending(false)
    }
  }

  function handlePasteClipboard() {
    void navigator.clipboard.readText().then((text) => {
      if (text) setTextMessage(text)
    }).catch(() => undefined)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      const filePath = (file as any).path || file.name
      setSelectedFilePath(filePath)
      setSelectedFileName(file.name)
      setSelectedFileSize(file.size || 0)
    }
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const filePath = (file as any).path || file.name
      setSelectedFilePath(filePath)
      setSelectedFileName(file.name)
      setSelectedFileSize(file.size || 0)
    }
  }

  function copyText(text: string, id: string) {
    void navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function copyIpAddress() {
    if (!status?.localIp) return
    void navigator.clipboard.writeText(`${status.localIp}:53317`)
    setCopiedIp(true)
    setTimeout(() => setCopiedIp(false), 2000)
  }

  const hasTarget = Boolean(selectedDevice || selectedController)
  const activeDeviceCount = new Set([
    ...devices.map((device) => device.fingerprint || `${device.ip}:${device.port}`),
    ...pairedControllers.map((controller) => controller.controllerId || controller.id),
  ]).size
  const localDeviceForController = (controller: PairedController) =>
    devices.find((device) => device.fingerprint === controller.controllerId)
  const hasLocalPresence = (device: LocalSendDevice | undefined) => Boolean(device && Date.now() - device.lastSeen < 45_000)

  return (
    <section className="localsend-screen" aria-labelledby="localsend-title">
      {/* Sleek Top Header Bar */}
      <header className="localsend-header">
        <div className="localsend-header__left">
          <div className="localsend-header__icon">
            <Share2 size={20} />
          </div>
          <div>
            <h1 id="localsend-title" className="localsend-header__title">Ağ Paylaşımı</h1>
            <p className="localsend-header__desc">Yerel Wi-Fi ile anında, bulut kuyruğuyla uygulama kapalıyken dosya gönderin.</p>
          </div>
        </div>

        <div className="localsend-header__actions">
          {/* IP pill with 1-click copy */}
          <button
            type="button"
            className="localsend-ip-badge"
            onClick={copyIpAddress}
            title="IP ve Port adresini kopyala"
          >
            <Wifi size={13} className="localsend-ip-badge__icon" />
            <span className="localsend-ip-badge__text">
              {status?.localIp ? `${status.localIp}:53317` : 'Wi-Fi'}
            </span>
            {copiedIp ? (
              <Check size={13} className="text-emerald-400" />
            ) : (
              <Copy size={12} className="localsend-ip-badge__copy" />
            )}
          </button>

          {/* Auto Accept Switch */}
          <div className="localsend-auto-accept-pill">
            <Label htmlFor="auto-accept-switch" className="localsend-auto-accept-label">
              Oto-Kabul
            </Label>
            <Switch
              id="auto-accept-switch"
              checked={status?.autoAccept ?? true}
              onCheckedChange={(val) => void handleToggleAutoAccept(val)}
            />
          </div>

          {/* Downloads Folder Button */}
          <Button
            size="compact"
            variant="ghost"
            className="localsend-folder-btn"
            onClick={() => void openReceivedFolder()}
            title="İndirilenler klasörünü aç"
          >
            <FolderOpen size={14} />
            <span>İndirilenler</span>
          </Button>
        </div>
      </header>

      {/* Main 2-Column Glass Workspace */}
      <div className="localsend-workspace">
        {/* Left Column: Nearby Devices (Radar & List) */}
        <div className="localsend-devices-panel">
          <div className="localsend-panel-header">
            <div className="localsend-panel-header__title">
              <Radio size={15} />
              <span>Aktif Cihazlar</span>
              <span className="localsend-badge-count">{activeDeviceCount}</span>
            </div>
            <div className="localsend-panel-header__actions">
              <Button
                size="compact"
                variant="ghost"
                className="localsend-action-icon-btn"
                disabled={scanning}
                onClick={() => void handleScan()}
                title="Ağdaki cihazları tara"
              >
                <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} />
                <span>{scanning ? 'Taranıyor' : 'Yenile'}</span>
              </Button>
              <Button
                size="compact"
                variant={showManualAdd ? 'soft' : 'ghost'}
                className="localsend-action-icon-btn"
                onClick={() => setShowManualAdd(!showManualAdd)}
                title="IP ile cihaz ekle"
              >
                <Plus size={14} />
                <span>IP Ekle</span>
              </Button>
            </div>
          </div>

          {/* Collapsible Manual IP Connect Bar */}
          {showManualAdd ? (
            <form className="localsend-manual-ip-bar" onSubmit={handleAddManual}>
              <div className="localsend-manual-input-wrap">
                <Search size={13} className="localsend-manual-search-icon" />
                <Input
                  placeholder="Örn: 192.168.1.45"
                  value={manualIp}
                  onChange={(e) => setManualIp(e.target.value)}
                  className="localsend-manual-input"
                  autoFocus
                />
              </div>
              <Button
                size="compact"
                variant="accent"
                type="submit"
                disabled={manualBusy || !manualIp.trim()}
              >
                {manualBusy ? 'Bağlanıyor…' : 'Bağlan'}
              </Button>
              {manualError ? <div className="localsend-manual-error">{manualError}</div> : null}
            </form>
          ) : null}

          {/* Local + cloud targets */}
          <div className="localsend-devices-content">
            {devices.length === 0 && pairedControllers.length === 0 ? (
              <div className="localsend-radar-state">
                <div className="localsend-radar-animation">
                  <div className="radar-ring radar-ring--1" />
                  <div className="radar-ring radar-ring--2" />
                  <div className="radar-ring radar-ring--3" />
                  <div className="radar-core">
                    <Radio size={22} className="localsend-radar-pulse-icon animate-pulse" />
                  </div>
                </div>
                <h4 className="localsend-radar-heading">Cihaz Aranıyor…</h4>
                <p className="localsend-radar-subtext">
                  Yerel Wi-Fi için telefon servisinin, bulut içinse eşleştirme bilgilerinin hazır olması yeterlidir.
                </p>
                <Button
                  size="compact"
                  variant="soft"
                  className="localsend-radar-ip-btn"
                  onClick={() => setShowManualAdd(true)}
                >
                  <Plus size={13} />
                  <span>IP ile Doğrudan Bağlan</span>
                </Button>
              </div>
            ) : (
              <div className="localsend-devices-scroll">
                {devices.length > 0 ? <div className="localsend-device-section-label"><Wifi size={11} /> Yerel Wi-Fi</div> : null}
                {devices.map((dev) => {
                  const isSelected = Boolean(selectedDevice && `${selectedDevice.ip}:${selectedDevice.port}` === `${dev.ip}:${dev.port}`)
                  return (
                    <button
                      type="button"
                      key={`${dev.ip}:${dev.port}`}
                      className={`localsend-device-card ${isSelected ? 'localsend-device-card--selected' : ''}`}
                      onClick={() => {
                        setSelectedDevice(dev)
                        setSelectedController(null)
                      }}
                    >
                      <div className="localsend-device-card__icon">
                        {getDeviceIcon(dev.deviceType)}
                      </div>
                      <div className="localsend-device-card__info">
                        <div className="localsend-device-card__name">
                          <strong>{dev.alias}</strong>
                          {isSelected ? <span className="localsend-selected-pill">Hedef</span> : null}
                        </div>
                        <span className="localsend-device-card__meta">
                          {dev.deviceModel || dev.deviceType} · {dev.ip}
                        </span>
                      </div>
                      {isSelected ? <div className="localsend-device-card__check"><Check size={14} /></div> : null}
                    </button>
                  )
                })}

                {pairedControllers.length > 0 ? <div className="localsend-device-section-label"><Cloud size={11} /> Bulut hedefleri</div> : null}
                {pairedControllers.map((controller) => {
                  const localMatch = localDeviceForController(controller)
                  const isSelected = selectedController?.id === controller.id
                  const cloudOnline = Boolean(controller.lastActiveAt && Date.now() - Date.parse(controller.lastActiveAt) < 60_000)
                  return (
                    <button
                      type="button"
                      key={`cloud-${controller.id}`}
                      className={`localsend-device-card localsend-device-card--cloud ${isSelected ? 'localsend-device-card--selected' : ''}`}
                      onClick={() => {
                        setSelectedController(controller)
                        setSelectedDevice(null)
                        setSendMode('file')
                      }}
                    >
                      <div className="localsend-device-card__icon localsend-device-card__icon--cloud"><Cloud size={20} /></div>
                      <div className="localsend-device-card__info">
                        <div className="localsend-device-card__name">
                          <strong>{controller.controllerName || 'Telefon'}</strong>
                          {isSelected ? <span className="localsend-selected-pill">Hedef</span> : null}
                        </div>
                        <span className="localsend-device-card__meta">
                          {hasLocalPresence(localMatch) ? 'Yerel + Bulut hazır' : cloudOnline ? 'Bulut bağlı · Kuyruk hazır' : 'Bulut kuyruğu · Çevrim dışıyken de teslim edilir'}
                        </span>
                      </div>
                      <span className="localsend-cloud-presence" title={hasLocalPresence(localMatch) ? 'Yerel Wi-Fi ve bulut bağlı' : cloudOnline ? 'Bulut bağlı' : 'Bulut kuyruğu hazır'}>
                        {hasLocalPresence(localMatch) ? <Wifi size={12} /> : null}
                        <Cloud size={12} />
                      </span>
                      {isSelected ? <div className="localsend-device-card__check"><Check size={14} /></div> : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Main Hub (Send Content & Received History) */}
        <div className="localsend-hub-panel">
          {/* Top Segmented Navigation */}
          <div className="localsend-hub-nav">
            <div className="localsend-hub-tabs">
              <button
                type="button"
                className={`localsend-hub-tab ${activeTab === 'send' ? 'active' : ''}`}
                onClick={() => setActiveTab('send')}
              >
                <Send size={14} />
                <span>Veri Gönder</span>
              </button>
              <button
                type="button"
                className={`localsend-hub-tab ${activeTab === 'received' ? 'active' : ''}`}
                onClick={() => setActiveTab('received')}
              >
                <Download size={14} />
                <span>Alınanlar & Geçmiş</span>
                {receivedFiles.length > 0 ? (
                  <span className="localsend-hub-tab__count">{receivedFiles.length}</span>
                ) : null}
              </button>
            </div>
          </div>

          {/* Tab 1: SEND CONTENT */}
          {activeTab === 'send' ? (
            <div className="localsend-send-container">
              {/* Target Banner */}
              <div className="localsend-target-banner">
                <div className="localsend-target-banner__left">
                  <span className="localsend-target-banner__label">Hedef:</span>
                  {selectedDevice ? (
                    <div className="localsend-target-banner__device">
                      {getDeviceIcon(selectedDevice.deviceType)}
                      <strong>{selectedDevice.alias}</strong>
                      <small>({selectedDevice.ip})</small>
                    </div>
                  ) : selectedController ? (
                    <div className="localsend-target-banner__device localsend-target-banner__device--cloud">
                      <Cloud size={16} />
                      <strong>{selectedController.controllerName || 'Telefon'}</strong>
                      <small>(Bulut kuyruğu)</small>
                    </div>
                  ) : (
                    <span className="localsend-target-banner__empty">
                      ⚠️ Soldan bir yerel veya bulut cihazı seçin
                    </span>
                  )}
                </div>
              </div>

              {/* Send Mode Switcher: Metin vs Dosya */}
              <div className="localsend-mode-selector">
                <button
                  type="button"
                  className={`localsend-mode-btn ${sendMode === 'text' ? 'active' : ''}`}
                  onClick={() => setSendMode('text')}
                >
                  <MessageSquare size={14} />
                  <span>Metin & Not</span>
                </button>
                <button
                  type="button"
                  className={`localsend-mode-btn ${sendMode === 'file' ? 'active' : ''}`}
                  onClick={() => setSendMode('file')}
                >
                  <FileIcon size={14} />
                  <span>Dosya & Belge</span>
                </button>
              </div>

              {/* Mode: TEXT */}
              {sendMode === 'text' ? (
                <div className="localsend-composer-body">
                  <textarea
                    className="localsend-textarea"
                    rows={5}
                    placeholder="Göndermek istediğiniz metin, link veya notu buraya yazın…"
                    value={textMessage}
                    onChange={(e) => setTextMessage(e.target.value)}
                  />
                  <div className="localsend-composer-actions">
                    <Button
                      size="compact"
                      variant="ghost"
                      className="localsend-paste-btn"
                      onClick={handlePasteClipboard}
                    >
                      <Clipboard size={14} />
                      <span>Panodan Yapıştır</span>
                    </Button>
                    <Button
                      variant="accent"
                      className="localsend-primary-send-btn"
                      disabled={sending || !selectedDevice || !textMessage.trim()}
                      onClick={() => void handleSendText()}
                    >
                      <Send size={14} />
                      <span>{sending ? 'Gönderiliyor…' : 'Cihaza İlet'}</span>
                    </Button>
                  </div>
                </div>
              ) : (
                /* Mode: FILE */
                <div className="localsend-composer-body">
                  <input
                    type="file"
                    id="localsend-file-input"
                    className="hidden"
                    onChange={handleFileSelect}
                  />

                  {!selectedFilePath ? (
                    <label
                      htmlFor="localsend-file-input"
                      className={`localsend-dropzone ${isDragging ? 'localsend-dropzone--drag' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                    >
                      <div className="localsend-dropzone__icon">
                        <UploadCloud size={32} />
                      </div>
                      <div className="localsend-dropzone__text">
                        <strong>Dosya Seçin veya Buraya Sürükleyin</strong>
                        <span>Fotoğraf, video, PDF veya herhangi bir belge</span>
                      </div>
                    </label>
                  ) : (
                    <div className="localsend-file-selected-box">
                      <div className="localsend-file-selected-card">
                        <div className="localsend-file-selected-card__icon">
                          <FileIcon size={24} />
                        </div>
                        <div className="localsend-file-selected-card__details">
                          <strong title={selectedFileName || ''}>{selectedFileName}</strong>
                          <span>{formatFileSize(selectedFileSize)}</span>
                        </div>
                        <button
                          type="button"
                          className="localsend-file-remove-btn"
                          onClick={() => {
                            setSelectedFilePath(null)
                            setSelectedFileName(null)
                            setSelectedFileSize(0)
                          }}
                          title="Dosyayı kaldır"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <Button
                        variant="accent"
                        className="localsend-primary-send-btn localsend-primary-send-btn--file"
                        disabled={sending || !hasTarget}
                        onClick={() => void handleSendFile()}
                      >
                        <Send size={15} />
                        <span>{sending ? 'Dosya İletiliyor…' : 'Dosyayı Gönder'}</span>
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Toast / Result notification */}
              {sendResult ? (
                <div className={`localsend-alert ${sendResult.success ? 'localsend-alert--success' : 'localsend-alert--error'}`}>
                  {sendResult.success ? <Check size={16} /> : <AlertTriangle size={16} />}
                  <span>{sendResult.message}</span>
                </div>
              ) : null}
            </div>
          ) : (
            /* Tab 2: RECEIVED HISTORY */
            <div className="localsend-history-container">
              <div className="localsend-history-header">
                <span className="localsend-history-header__count">
                  Toplam {receivedFiles.length} kayıt
                </span>
                <Button
                  size="compact"
                  variant="ghost"
                  onClick={() => void openReceivedFolder()}
                >
                  <FolderOpen size={13} />
                  <span>Klasörü Aç</span>
                </Button>
              </div>

              <div className="localsend-history-list">
                {receivedFiles.length === 0 ? (
                  <div className="localsend-history-empty">
                    <Download size={28} className="localsend-history-empty-icon" />
                    <strong>Henüz Gelen Veri Yok</strong>
                    <p>Diğer cihazlarınızdan bu bilgisayara gönderilen dosya ve metinler burada listelenir.</p>
                  </div>
                ) : (
                  receivedFiles.map((rec) => (
                    <div className="localsend-history-item" key={rec.id}>
                      <div className="localsend-history-item__icon">
                        {rec.isText ? <FileText size={18} /> : <FileIcon size={18} />}
                      </div>
                      <div className="localsend-history-item__info">
                        <strong title={rec.fileName}>{rec.fileName}</strong>
                        {rec.textPreview ? (
                          <p className="localsend-history-item__snippet">{rec.textPreview}</p>
                        ) : (
                          <span className="localsend-history-item__meta">
                            {formatFileSize(rec.size)} · Gönderen: {rec.senderAlias}
                          </span>
                        )}
                      </div>
                      <div className="localsend-history-item__actions">
                        {rec.isText && rec.textPreview ? (
                          <Button
                            size="compact"
                            variant="soft"
                            onClick={() => copyText(rec.textPreview || '', rec.id)}
                          >
                            {copiedId === rec.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                            <span>{copiedId === rec.id ? 'Kopyalandı' : 'Kopyala'}</span>
                          </Button>
                        ) : (
                          <Button
                            size="compact"
                            variant="soft"
                            onClick={() => void openReceivedFolder()}
                          >
                            <FolderOpen size={13} />
                            <span>Göster</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

