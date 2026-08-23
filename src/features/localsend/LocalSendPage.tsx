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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
      <header className="localsend-header">
        <div className="localsend-header__left">
          <div className="localsend-header__icon" aria-hidden="true">
            <Share2 size={18} />
          </div>
          <div className="localsend-header__copy">
            <div className="localsend-header__eyebrow">LocalSend</div>
            <h1 id="localsend-title" className="localsend-header__title">Ağ Paylaşımı</h1>
            <p className="localsend-header__desc">Cihazlarınız arasında dosya ve metin aktarın.</p>
          </div>
        </div>

        <div className="localsend-header__actions">
          <button
            type="button"
            className="localsend-ip-badge"
            onClick={copyIpAddress}
            title="IP ve port adresini kopyala"
          >
            <Wifi size={13} className="localsend-ip-badge__icon" />
            <span>{status?.localIp ? `${status.localIp}:53317` : 'Yerel ağ'}</span>
            {copiedIp ? <Check size={12} /> : <Copy size={12} className="localsend-ip-badge__copy" />}
          </button>

          <div className="localsend-auto-accept-pill">
            <Label htmlFor="auto-accept-switch" className="localsend-auto-accept-label">Otomatik kabul</Label>
            <Switch
              id="auto-accept-switch"
              checked={status?.autoAccept ?? true}
              onCheckedChange={(val) => void handleToggleAutoAccept(val)}
            />
          </div>

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

      <div className="localsend-workspace">
        <Card className="localsend-devices-panel">
          <CardHeader className="localsend-panel-header">
            <div className="localsend-panel-header__copy">
              <div className="localsend-panel-header__title-row">
                <CardTitle className="localsend-panel-header__title">Cihazlar</CardTitle>
                <Badge variant="secondary" className="localsend-badge-count">{activeDeviceCount}</Badge>
              </div>
              <CardDescription className="localsend-panel-header__desc">Yakındaki ve eşleştirilen hedefler</CardDescription>
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
              >
                <Plus size={13} />
                <span>IP</span>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="localsend-devices-content">
            {showManualAdd ? (
              <form className="localsend-manual-ip-bar" onSubmit={handleAddManual}>
                <div className="localsend-manual-input-wrap">
                  <Search size={14} className="localsend-manual-search-icon" />
                  <Input
                    placeholder="192.168.1.45"
                    value={manualIp}
                    onChange={(e) => setManualIp(e.target.value)}
                    className="localsend-manual-input"
                    autoFocus
                  />
                </div>
                <Button size="compact" variant="accent" type="submit" disabled={manualBusy || !manualIp.trim()}>
                  {manualBusy ? 'Bağlanıyor…' : 'Bağlan'}
                </Button>
                {manualError ? <div className="localsend-manual-error">{manualError}</div> : null}
              </form>
            ) : null}

            {devices.length === 0 && pairedControllers.length === 0 ? (
              <div className="localsend-radar-state">
                <div className="localsend-empty-icon"><Radio size={20} /></div>
                <h4 className="localsend-radar-heading">Henüz cihaz görünmüyor</h4>
                <p className="localsend-radar-subtext">Aynı Wi-Fi ağındaki cihazları tarayın veya IP adresiyle doğrudan bağlanın.</p>
                <div className="localsend-empty-actions">
                  <Button size="compact" variant="soft" onClick={() => void handleScan()} disabled={scanning}>
                    <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} />
                    <span>{scanning ? 'Taranıyor' : 'Ağı tara'}</span>
                  </Button>
                  <Button size="compact" variant="ghost" onClick={() => setShowManualAdd(true)}>
                    <Plus size={13} />
                    <span>IP ekle</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="localsend-devices-scroll">
                {devices.length > 0 ? <div className="localsend-device-section-label"><Wifi size={11} /> Yerel ağ</div> : null}
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
                      <div className="localsend-device-card__icon">{getDeviceIcon(dev.deviceType)}</div>
                      <div className="localsend-device-card__info">
                        <div className="localsend-device-card__name">
                          <strong>{dev.alias}</strong>
                          {isSelected ? <Badge variant="outline" className="localsend-selected-pill">Seçili</Badge> : null}
                        </div>
                        <span className="localsend-device-card__meta">{dev.deviceModel || dev.deviceType} · {dev.ip}</span>
                      </div>
                      {isSelected ? <div className="localsend-device-card__check"><Check size={14} /></div> : null}
                    </button>
                  )
                })}

                {pairedControllers.length > 0 ? <div className="localsend-device-section-label"><Cloud size={11} /> Eşleştirilen cihazlar</div> : null}
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
                      <div className="localsend-device-card__icon localsend-device-card__icon--cloud"><Cloud size={18} /></div>
                      <div className="localsend-device-card__info">
                        <div className="localsend-device-card__name">
                          <strong>{controller.controllerName || 'Telefon'}</strong>
                          {isSelected ? <Badge variant="outline" className="localsend-selected-pill">Seçili</Badge> : null}
                        </div>
                        <span className="localsend-device-card__meta">
                          {hasLocalPresence(localMatch) ? 'Yerel + bulut hazır' : cloudOnline ? 'Bulut bağlı · kuyruk hazır' : 'Bulut kuyruğu hazır'}
                        </span>
                      </div>
                      <span className="localsend-cloud-presence" title="Bağlantı durumu">
                        {hasLocalPresence(localMatch) ? <Wifi size={12} /> : null}
                        <Cloud size={12} />
                      </span>
                      {isSelected ? <div className="localsend-device-card__check"><Check size={14} /></div> : null}
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="localsend-hub-panel">
          <Tabs
            className="localsend-main-tabs"
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as 'send' | 'received')}
          >
            <div className="localsend-hub-nav">
              <div>
                <CardTitle className="localsend-hub-title">Aktarım</CardTitle>
                <CardDescription className="localsend-hub-desc">İçeriği seçin ve hedef cihaza gönderin.</CardDescription>
              </div>
              <TabsList className="localsend-hub-tabs">
                <TabsTrigger value="send" className="localsend-hub-tab">
                  <Send size={14} />
                  <span>Gönder</span>
                </TabsTrigger>
                <TabsTrigger value="received" className="localsend-hub-tab">
                  <Download size={14} />
                  <span>Alınanlar</span>
                  {receivedFiles.length > 0 ? <Badge className="localsend-hub-tab__count">{receivedFiles.length}</Badge> : null}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="send" className="localsend-tab-content">
              <div className="localsend-send-container">
                <div className="localsend-target-banner">
                  <span className="localsend-target-banner__label">Hedef cihaz</span>
                  {selectedDevice ? (
                    <div className="localsend-target-banner__device">
                      <div className="localsend-target-banner__device-icon">{getDeviceIcon(selectedDevice.deviceType)}</div>
                      <div>
                        <strong>{selectedDevice.alias}</strong>
                        <small>{selectedDevice.ip}</small>
                      </div>
                    </div>
                  ) : selectedController ? (
                    <div className="localsend-target-banner__device localsend-target-banner__device--cloud">
                      <div className="localsend-target-banner__device-icon"><Cloud size={15} /></div>
                      <div>
                        <strong>{selectedController.controllerName || 'Telefon'}</strong>
                        <small>Bulut kuyruğu</small>
                      </div>
                    </div>
                  ) : (
                    <div className="localsend-target-banner__empty">
                      <AlertTriangle size={14} />
                      <span>Göndermeden önce soldan bir cihaz seçin.</span>
                    </div>
                  )}
                </div>

                <Tabs
                  className="localsend-mode-tabs"
                  value={sendMode}
                  onValueChange={(value) => setSendMode(value as 'text' | 'file')}
                >
                  <TabsList className="localsend-mode-selector">
                    <TabsTrigger value="text" className="localsend-mode-btn" disabled={Boolean(selectedController)}>
                      <MessageSquare size={14} />
                      <span>Metin</span>
                    </TabsTrigger>
                    <TabsTrigger value="file" className="localsend-mode-btn">
                      <FileIcon size={14} />
                      <span>Dosya</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="text" className="localsend-composer-body">
                    <div className="localsend-message-composer">
                      <Button
                        size="compact"
                        variant="ghost"
                        className="localsend-paste-btn localsend-paste-btn--icon"
                        onClick={handlePasteClipboard}
                        title="Panodan yapıştır"
                        aria-label="Panodan yapıştır"
                      >
                        <Clipboard size={15} />
                      </Button>
                      <textarea
                        className="localsend-textarea"
                        rows={2}
                        placeholder="Mesaj, bağlantı veya kısa bir not yazın…"
                        value={textMessage}
                        onChange={(e) => setTextMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            if (!sending && selectedDevice && textMessage.trim()) void handleSendText()
                          }
                        }}
                      />
                      <Button
                        variant="accent"
                        className="localsend-primary-send-btn"
                        disabled={sending || !selectedDevice || !textMessage.trim()}
                        onClick={() => void handleSendText()}
                      >
                        <Send size={14} />
                        <span>{sending ? 'Gönderiliyor…' : 'Gönder'}</span>
                      </Button>
                    </div>
                    <p className="localsend-composer-hint">Enter ile gönder · Shift + Enter ile yeni satır</p>
                  </TabsContent>

                  <TabsContent value="file" className="localsend-composer-body">
                    <div className="localsend-composer-heading">
                      <div>
                        <strong>Dosya gönder</strong>
                        <span>Tek bir dosya seçin veya alana sürükleyin.</span>
                      </div>
                    </div>
                    <input type="file" id="localsend-file-input" className="hidden" onChange={handleFileSelect} />
                    {!selectedFilePath ? (
                      <label
                        htmlFor="localsend-file-input"
                        className={`localsend-dropzone ${isDragging ? 'localsend-dropzone--drag' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                      >
                        <div className="localsend-dropzone__icon"><UploadCloud size={22} /></div>
                        <div className="localsend-dropzone__text">
                          <strong>Dosya seçin veya sürükleyin</strong>
                          <span>Fotoğraf, video, PDF veya belge</span>
                        </div>
                      </label>
                    ) : (
                      <div className="localsend-file-selected-box">
                        <div className="localsend-file-selected-card">
                          <div className="localsend-file-selected-card__icon"><FileIcon size={20} /></div>
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
                            <X size={15} />
                          </button>
                        </div>
                        <Button
                          variant="accent"
                          className="localsend-primary-send-btn localsend-primary-send-btn--file"
                          disabled={sending || !hasTarget}
                          onClick={() => void handleSendFile()}
                        >
                          <Send size={14} />
                          <span>{sending ? 'Gönderiliyor…' : 'Dosyayı gönder'}</span>
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                {sendResult ? (
                  <div className={`localsend-alert ${sendResult.success ? 'localsend-alert--success' : 'localsend-alert--error'}`}>
                    {sendResult.success ? <Check size={15} /> : <AlertTriangle size={15} />}
                    <span>{sendResult.message}</span>
                  </div>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="received" className="localsend-tab-content">
              <div className="localsend-history-container">
                <div className="localsend-history-header">
                  <div>
                    <strong>Son alınanlar</strong>
                    <span>{receivedFiles.length} kayıt</span>
                  </div>
                  <Button size="compact" variant="ghost" onClick={() => void openReceivedFolder()}>
                    <FolderOpen size={13} />
                    <span>Klasörü aç</span>
                  </Button>
                </div>

                <div className="localsend-history-list">
                  {receivedFiles.length === 0 ? (
                    <div className="localsend-history-empty">
                      <div className="localsend-empty-icon"><Download size={20} /></div>
                      <strong>Henüz alınan içerik yok</strong>
                      <p>Bu bilgisayara gelen dosya ve metinler burada görünür.</p>
                    </div>
                  ) : (
                    receivedFiles.map((rec) => (
                      <div className="localsend-history-item" key={rec.id}>
                        <div className="localsend-history-item__icon">{rec.isText ? <FileText size={17} /> : <FileIcon size={17} />}</div>
                        <div className="localsend-history-item__info">
                          <strong title={rec.fileName}>{rec.fileName}</strong>
                          {rec.textPreview ? (
                            <p className="localsend-history-item__snippet">{rec.textPreview}</p>
                          ) : (
                            <span className="localsend-history-item__meta">{formatFileSize(rec.size)} · {rec.senderAlias}</span>
                          )}
                        </div>
                        <div className="localsend-history-item__actions">
                          {rec.isText && rec.textPreview ? (
                            <Button size="compact" variant="ghost" onClick={() => copyText(rec.textPreview || '', rec.id)}>
                              {copiedId === rec.id ? <Check size={13} /> : <Copy size={13} />}
                              <span>{copiedId === rec.id ? 'Kopyalandı' : 'Kopyala'}</span>
                            </Button>
                          ) : (
                            <Button size="compact" variant="ghost" onClick={() => void openReceivedFolder()}>
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
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </section>
  )
}

