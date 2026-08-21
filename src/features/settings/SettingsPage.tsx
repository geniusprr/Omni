import React, { useEffect, useState } from 'react'
import Bell from 'lucide-react/dist/esm/icons/bell.js'
import BellRing from 'lucide-react/dist/esm/icons/bell-ring.js'
import Check from 'lucide-react/dist/esm/icons/check.js'
import Copy from 'lucide-react/dist/esm/icons/copy.js'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js'
import Laptop from 'lucide-react/dist/esm/icons/laptop.js'
import QrCode from 'lucide-react/dist/esm/icons/qr-code.js'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js'
import Shield from 'lucide-react/dist/esm/icons/shield.js'
import Smartphone from 'lucide-react/dist/esm/icons/smartphone.js'
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js'
import Wifi from 'lucide-react/dist/esm/icons/wifi.js'
import WifiOff from 'lucide-react/dist/esm/icons/wifi-off.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import QRCode from 'qrcode'
import { PairingModal } from '@/components/PairingModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  createPairingPayload,
  generatePairingCode,
  generatePairingSecret,
  removePairedController,
  saveEffectiveSettings,
  testSupabaseConnection,
} from '@/features/remote/client'
import { desktop } from '@/lib/desktop'
import type { AppSettings, PairedController, RemoteConnectionStatus } from '@/types'

interface SettingsPageProps {
  settings: AppSettings
  connectionStatus: RemoteConnectionStatus
  lastHeartbeat: number | null
  pairedControllers: PairedController[]
  onSettingsChange: (newSettings: AppSettings) => void
  onRefreshControllers: () => void
}

const SUPABASE_SCHEMA_SQL = `-- ============================================================================
-- kapanış. Supabase Database Schema: Temiz Kurulum & Sıfırlama
-- ============================================================================

-- 1. Eski Çakışan Tablo ve Tipleri Güvenle Temizleme
drop table if exists public.device_notifications cascade;
drop table if exists public.device_commands cascade;
drop table if exists public.paired_controllers cascade;
drop table if exists public.devices cascade;

drop type if exists public.device_command_kind cascade;
drop type if exists public.device_command_status cascade;

-- 2. Yeni Tipleri Oluşturma
create type public.device_command_kind as enum ('shutdown', 'restart', 'cancel');
create type public.device_command_status as enum ('pending', 'processing', 'completed', 'rejected');

-- 3. Cihazlar Tablosu (Bilgisayarlar)
create table public.devices (
  id uuid primary key,
  name text not null default 'Windows PC',
  pairing_code text not null unique,
  pairing_secret text not null,
  is_online boolean not null default false,
  last_seen_at timestamptz not null default now(),
  timer_state jsonb,
  system_info jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Eşleştirilen Denetleyiciler Tablosu (Telefonlar, Tabletler, Tarayıcılar)
create table public.paired_controllers (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  controller_id text not null,
  controller_name text not null default 'Telefon',
  controller_type text default 'mobile',
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (device_id, controller_id)
);

-- 5. Komutlar Tablosu (Uzaktan Kapatma, Yeniden Başlatma, İptal)
create table public.device_commands (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  controller_id text,
  command public.device_command_kind not null,
  delay_seconds integer not null default 0 check (delay_seconds between 0 and 86400),
  status public.device_command_status not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  completed_at timestamptz
);

-- 6. Bildirimler Tablosu (PC'den Telefona Bildirim Aynalama)
create table public.device_notifications (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  notification_id text,
  app_name text not null default 'Sistem',
  title text,
  body text,
  timestamp timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 7. İndeksler
create index if not exists device_commands_pending_idx
  on public.device_commands (device_id, created_at)
  where status = 'pending';

create index if not exists devices_pairing_code_idx
  on public.devices (pairing_code);

create index if not exists paired_controllers_device_idx
  on public.paired_controllers (device_id);

create index if not exists device_notifications_device_idx
  on public.device_notifications (device_id, timestamp desc);

-- 8. RLS (Row Level Security) Etkinleştirme
alter table public.devices enable row level security;
alter table public.paired_controllers enable row level security;
alter table public.device_commands enable row level security;
alter table public.device_notifications enable row level security;

-- 9. İzin Politikaları (Drop & Create)
drop policy if exists "Allow public access to devices" on public.devices;
create policy "Allow public access to devices"
  on public.devices for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Allow public access to paired_controllers" on public.paired_controllers;
create policy "Allow public access to paired_controllers"
  on public.paired_controllers for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Allow public access to device_commands" on public.device_commands;
create policy "Allow public access to device_commands"
  on public.device_commands for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Allow public access to device_notifications" on public.device_notifications;
create policy "Allow public access to device_notifications"
  on public.device_notifications for all
  to anon, authenticated
  using (true)
  with check (true);

-- 10. Supabase Realtime Yayınları
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'devices'
  ) then
    alter publication supabase_realtime add table public.devices;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'device_commands'
  ) then
    alter publication supabase_realtime add table public.device_commands;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'paired_controllers'
  ) then
    alter publication supabase_realtime add table public.paired_controllers;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'device_notifications'
  ) then
    alter publication supabase_realtime add table public.device_notifications;
  end if;
end
$$;`

export function SettingsPage({
  settings,
  connectionStatus,
  lastHeartbeat,
  pairedControllers,
  onSettingsChange,
  onRefreshControllers,
}: SettingsPageProps) {
  const [url, setUrl] = useState(settings.supabaseUrl)
  const [key, setKey] = useState(settings.supabaseAnonKey)
  const [deviceName, setDeviceName] = useState(settings.deviceName)
  const [autostart, setAutostart] = useState(settings.autostart)
  const [notifMirroring, setNotifMirroring] = useState(settings.notificationMirroringEnabled !== false)
  const [ntfyEnabled, setNtfyEnabled] = useState(Boolean(settings.ntfyEnabled))
  const [ntfyTopic, setNtfyTopic] = useState(settings.ntfyTopic || `kapanis_${settings.deviceId.slice(0, 8)}`)
  const [listenerStatus, setListenerStatus] = useState<{ running: boolean; accessGranted: boolean; historyCount: number }>({ running: false, accessGranted: false, historyCount: 0 })
  const [testNotifSent, setTestNotifSent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedSql, setCopiedSql] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedLocalLink, setCopiedLocalLink] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testingConnection, setTestingConnection] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [localQrDataUrl, setLocalQrDataUrl] = useState<string | null>(null)
  const [qrModalTab, setQrModalTab] = useState<'cloud' | 'local'>('cloud')
  const [showQrModal, setShowQrModal] = useState(false)
  const [showSqlModal, setShowSqlModal] = useState(false)
  const [heartbeatAgo, setHeartbeatAgo] = useState<string>('')
  const [localDevices, setLocalDevices] = useState<import('@/types').LocalSendDevice[]>([])
  const [localIps, setLocalIps] = useState<string[]>([])

  useEffect(() => {
    void desktop.localsend.getStatus().then((st) => {
      if (st && st.allIps && st.allIps.length > 0) setLocalIps(st.allIps)
      else if (st && st.localIp) setLocalIps([st.localIp])
    }).catch(() => undefined)
    void desktop.localsend.getDevices().then(setLocalDevices).catch(() => undefined)
    const unlisten = desktop.localsend.onDeviceDiscovered(() => {
      void desktop.localsend.getDevices().then(setLocalDevices).catch(() => undefined)
    })
    return () => {
      unlisten()
    }
  }, [])

  useEffect(() => {
    void desktop.notifications.getStatus().then(setListenerStatus).catch(() => undefined)
    const interval = setInterval(() => {
      void desktop.notifications.getStatus().then(setListenerStatus).catch(() => undefined)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  const cloudPayload = createPairingPayload(settings, localIps, 53317)
  const cloudRemoteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?mode=remote&pair_data=${encodeURIComponent(cloudPayload)}`
    : ''
  const localCompanionUrl = localIps.length > 0 ? `http://${localIps[0]}:53317` : 'http://localhost:53317'

  useEffect(() => {
    setUrl(settings.supabaseUrl)
    setKey(settings.supabaseAnonKey)
    setDeviceName(settings.deviceName)
    setAutostart(settings.autostart)
    setNotifMirroring(settings.notificationMirroringEnabled !== false)
    setNtfyEnabled(Boolean(settings.ntfyEnabled))
    setNtfyTopic(settings.ntfyTopic || `kapanis_${settings.deviceId.slice(0, 8)}`)
  }, [settings])

  useEffect(() => {
    if (!cloudRemoteUrl) return
    void QRCode.toDataURL(cloudRemoteUrl, {
      margin: 2,
      width: 240,
      color: {
        dark: '#ffffff',
        light: '#141822',
      },
    }).then(setQrDataUrl).catch(() => undefined)
  }, [cloudRemoteUrl])

  useEffect(() => {
    if (!localCompanionUrl) return
    void QRCode.toDataURL(localCompanionUrl, {
      margin: 2,
      width: 240,
      color: {
        dark: '#ffffff',
        light: '#141822',
      },
    }).then(setLocalQrDataUrl).catch(() => undefined)
  }, [localCompanionUrl])

  useEffect(() => {
    const interval = setInterval(() => {
      if (!lastHeartbeat) {
        setHeartbeatAgo('')
        return
      }
      const diffSec = Math.floor((Date.now() - lastHeartbeat) / 1000)
      if (diffSec < 5) setHeartbeatAgo('az önce')
      else if (diffSec < 60) setHeartbeatAgo(`${diffSec} sn önce`)
      else setHeartbeatAgo(`${Math.floor(diffSec / 60)} dk önce`)
    }, 1000)
    return () => clearInterval(interval)
  }, [lastHeartbeat])

  async function handleSaveSettings() {
    setSaving(true)
    setTestResult(null)
    const updated: AppSettings = {
      ...settings,
      supabaseUrl: url.trim(),
      supabaseAnonKey: key.trim(),
      deviceName: deviceName.trim() || 'Windows PC',
      autostart,
      notificationMirroringEnabled: notifMirroring,
      ntfyEnabled,
      ntfyTopic: ntfyTopic.trim(),
      lastSavedAt: Date.now(),
    }
    try {
      await saveEffectiveSettings(updated)
      onSettingsChange(updated)
      setTestResult({ success: true, message: 'Ayarlar başarıyla kaydedildi.' })
    } catch {
      setTestResult({ success: false, message: 'Ayarlar kaydedilemedi.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleSendTestNotification() {
    await desktop.notifications.test('kapanış. Test Bildirimi', 'Bilgisayarınızdan telefonunuza başarıyla iletildi!')
    setTestNotifSent(true)
    setTimeout(() => setTestNotifSent(false), 2500)
  }

  async function handleTestConnection() {
    setTestingConnection(true)
    setTestResult(null)
    const res = await testSupabaseConnection(url.trim(), key.trim())
    setTestResult(res)
    setTestingConnection(false)
  }

  async function handleRegeneratePairingCode() {
    const newCode = generatePairingCode()
    const newSecret = generatePairingSecret()
    const updated: AppSettings = {
      ...settings,
      pairingCode: newCode,
      pairingSecret: newSecret,
    }
    await saveEffectiveSettings(updated)
    onSettingsChange(updated)
  }

  async function handleRemoveController(id: string) {
    if (!settings.supabaseUrl || !settings.supabaseAnonKey) return
    await removePairedController(settings.supabaseUrl, settings.supabaseAnonKey, id)
    onRefreshControllers()
  }

  function copyText(text: string, setCopied: (v: boolean) => void) {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="utility-screen settings-screen" aria-labelledby="settings-title">
      <header className="screen-heading">
        <div>
          <h1 id="settings-title">Ayarlar</h1>
          <p>Windows başlangıcı, Supabase bağlantısı ve cihaz eşleştirme.</p>
        </div>
        <div className="settings-status-badge">
          {connectionStatus === 'connected' ? (
            <span className="status-badge status-badge--online">
              <span className="status-badge__dot" /> Supabase Bağlı
            </span>
          ) : connectionStatus === 'connecting' ? (
            <span className="status-badge status-badge--connecting">
              <span className="status-badge__dot" /> Bağlanıyor...
            </span>
          ) : (
            <span className="status-badge status-badge--offline">
              <WifiOff size={13} /> Bağlantı Yok
            </span>
          )}
        </div>
      </header>

      <div className="settings-scroll-area">
        {/* Windows Başlangıcı */}
        <div className="settings-card">
          <div className="settings-card__header">
            <div className="settings-card__icon"><Laptop size={17} /></div>
            <div>
              <h3>Windows ile Başlatma</h3>
              <p>Bilgisayar açıldığında kapanış. arka planda otomatik çalışsın.</p>
            </div>
          </div>
          <div className="settings-card__body settings-row">
            <Label htmlFor="autostart-toggle">Windows açılışında başlat</Label>
            <Switch
              id="autostart-toggle"
              checked={autostart}
              onCheckedChange={(val) => {
                setAutostart(val)
                const updated = { ...settings, autostart: val }
                void saveEffectiveSettings(updated)
                onSettingsChange(updated)
              }}
            />
          </div>
        </div>

        {/* PC Bildirim Aynalama */}
        <div className="settings-card">
          <div className="settings-card__header">
            <div className="settings-card__icon"><Bell size={17} /></div>
            <div>
              <h3>PC Bildirim Aynalama (Telefona İletim)</h3>
              <p>Windows'a gelen WhatsApp, Chrome, Discord, Sistem vb. bildirimleri telefona aktar.</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="settings-row" style={{ marginBottom: '14px' }}>
              <div>
                <Label htmlFor="notif-mirror-toggle" style={{ fontWeight: 600 }}>Bildirim Aynalama Aktif</Label>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '2px 0 0' }}>
                  {listenerStatus.running ? '✓ Windows bildirim dinleyicisi arka planda çalışıyor' : 'Dinleyici başlatılıyor...'}
                </p>
              </div>
              <Switch
                id="notif-mirror-toggle"
                checked={notifMirroring}
                onCheckedChange={(val) => {
                  setNotifMirroring(val)
                  const updated = { ...settings, notificationMirroringEnabled: val }
                  void saveEffectiveSettings(updated)
                  onSettingsChange(updated)
                }}
              />
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', marginTop: '10px' }}>
              <div className="settings-row" style={{ marginBottom: '10px' }}>
                <div>
                  <Label htmlFor="ntfy-toggle" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BellRing size={14} color="#38bdf8" /> ntfy.sh Kilit Ekranı Bildirimi (Dışarıdayken)
                  </Label>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '2px 0 0' }}>
                    Telefon kilitliyken ve tarayıcı kapalıyken bile sesli/titreşimli push bildirimi gönderir.
                  </p>
                </div>
                <Switch
                  id="ntfy-toggle"
                  checked={ntfyEnabled}
                  onCheckedChange={(val) => {
                    setNtfyEnabled(val)
                    const updated = { ...settings, ntfyEnabled: val }
                    void saveEffectiveSettings(updated)
                    onSettingsChange(updated)
                  }}
                />
              </div>

              {ntfyEnabled && (
                <div className="compact-field" style={{ marginTop: '8px' }}>
                  <Label htmlFor="ntfy-topic-input">ntfy.sh Gizli Kanal Adı (Topic)</Label>
                  <Input
                    id="ntfy-topic-input"
                    value={ntfyTopic}
                    placeholder="kapanis_xxxxxx"
                    onChange={(e) => setNtfyTopic(e.target.value)}
                  />
                  <span className="field-hint">
                    Telefondaki ücretsiz ntfy uygulamasından bu kanala abone olarak kilit ekranında bildirim alabilirsiniz.
                  </span>
                </div>
              )}
            </div>

            <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
              <Button
                variant="soft"
                size="compact"
                onClick={() => void handleSendTestNotification()}
              >
                {testNotifSent ? <Check size={14} /> : <Bell size={14} />}
                {testNotifSent ? 'Test Bildirimi Gönderildi!' : 'Test Bildirimi Gönder'}
              </Button>
            </div>
          </div>
        </div>

        {/* Bu Bilgisayar ve Eşleştirme Kodu */}
        <div className="settings-card settings-card--highlight">
          <div className="settings-card__header">
            <div className="settings-card__icon"><Shield size={17} /></div>
            <div>
              <h3>Bu Bilgisayar & Eşleştirme</h3>
              <p>Telefondan ya da başka bir PC'den kontrol için benzersiz kod.</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="compact-field">
              <Label htmlFor="device-name-input">Bilgisayar Adı</Label>
              <Input
                id="device-name-input"
                value={deviceName}
                placeholder="Örn: Masaüstü PC"
                onChange={(e) => setDeviceName(e.target.value)}
              />
            </div>

            <div className="pairing-code-box">
              <div className="pairing-code-display">
                <span className="pairing-code-label">EŞLEŞTİRME KODU</span>
                <strong className="pairing-code-value">{settings.pairingCode}</strong>
              </div>
              <div className="pairing-code-actions">
                <Button
                  size="compact"
                  variant="soft"
                  onClick={() => copyText(settings.pairingCode, setCopiedCode)}
                >
                  {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                  {copiedCode ? 'Kopyalandı' : 'Kodu Kopyala'}
                </Button>
                <Button
                  size="compact"
                  variant="soft"
                  onClick={() => copyText(cloudRemoteUrl, setCopiedLink)}
                >
                  {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                  {copiedLink ? 'Link Kopyalandı' : 'Eşleştirme Linki'}
                </Button>
                <Button
                  size="compact"
                  variant="accent"
                  onClick={() => setShowQrModal(true)}
                >
                  <QrCode size={14} /> QR Kod ile Bağlan
                </Button>
                <Button
                  size="compact"
                  variant="ghost"
                  title="Yeni eşleştirme kodu üret"
                  onClick={() => void handleRegeneratePairingCode()}
                >
                  <RefreshCw size={14} />
                </Button>
              </div>
            </div>

            <div className="heartbeat-info">
              <span className="runtime-dot" />
              <span>Kalp atışı aktif (15 sn) {heartbeatAgo ? `· Son sinyal: ${heartbeatAgo}` : ''}</span>
            </div>
          </div>
        </div>

        {/* Eşleştirilen Cihazlar Listesi */}
        <div className="settings-card">
          <div className="settings-card__header">
            <div className="settings-card__icon"><Smartphone size={17} /></div>
            <div>
              <h3>Eşleştirilen Cihazlar ({pairedControllers.length + localDevices.length})</h3>
              <p>Bu bilgisayara uzaktan erişim izni olan yerel Wi-Fi ve bulut cihazları.</p>
            </div>
          </div>
          <div className="settings-card__body">
            {pairedControllers.length === 0 && localDevices.length === 0 ? (
              <div className="paired-empty">
                <Smartphone size={22} />
                <span>Henüz eşleşmiş bir cihaz yok. Telefondan QR kodu okutun veya aynı Wi-Fi ağından bağlanın.</span>
              </div>
            ) : (
              <div className="paired-list">
                {localDevices.map((dev) => (
                  <div className="paired-item" key={`local-${dev.ip}-${dev.port}`}>
                    <div className="paired-item__icon">
                      <Smartphone size={15} />
                    </div>
                    <div className="paired-item__info">
                      <strong>{dev.alias || 'Yerel Cihaz'}</strong>
                      <small>Yerel Ağ (Wi-Fi) · {dev.ip}:{dev.port} · {dev.deviceModel || 'Mobil'}</small>
                    </div>
                    <span className="status-badge status-badge--online" style={{ fontSize: '11px', padding: '2px 8px' }}>
                      <span className="status-badge__dot" /> Yerel Bağlı
                    </span>
                  </div>
                ))}
                {pairedControllers.map((ctrl) => (
                  <div className="paired-item" key={ctrl.id}>
                    <div className="paired-item__icon">
                      {ctrl.controllerType === 'desktop' ? <Laptop size={15} /> : <Smartphone size={15} />}
                    </div>
                    <div className="paired-item__info">
                      <strong>{ctrl.controllerName || 'Telefon Denetleyici'}</strong>
                      <small>Bulut (Supabase) · Son aktiflik: {ctrl.lastActiveAt ? new Date(ctrl.lastActiveAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : 'Bilinmiyor'}</small>
                    </div>
                    <Button
                      size="compact"
                      variant="icon"
                      title="Bağlantıyı Kes / Kaldır"
                      onClick={() => void handleRemoveController(ctrl.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Supabase Bağlantı Ayarları */}
        <div className="settings-card">
          <div className="settings-card__header">
            <div className="settings-card__icon"><Wifi size={17} /></div>
            <div>
              <h3>Supabase Bağlantısı</h3>
              <p>Gerçek zamanlı komutlar ve kalp atışı için veritabanı ayarları.</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="compact-field">
              <Label htmlFor="supabase-url">Supabase URL</Label>
              <Input
                id="supabase-url"
                value={url}
                placeholder="https://xyzcompany.supabase.co"
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <div className="compact-field">
              <Label htmlFor="supabase-key">Supabase Publishable / Anon Key</Label>
              <Input
                id="supabase-key"
                type="password"
                value={key}
                placeholder="eyJhbGciOiJIUzI1NiIsIn..."
                onChange={(e) => setKey(e.target.value)}
              />
            </div>

            <div className="settings-actions-row">
              <Button
                variant="accent"
                disabled={saving}
                onClick={() => void handleSaveSettings()}
              >
                {saving ? 'Kaydediliyor…' : 'Ayarları Kaydet'}
              </Button>
              <Button
                variant="soft"
                disabled={testingConnection || !url || !key}
                onClick={() => void handleTestConnection()}
              >
                {testingConnection ? 'Test Ediliyor…' : 'Bağlantıyı Test Et'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowSqlModal(true)}
              >
                <ExternalLink size={14} /> SQL Şeması
              </Button>
            </div>

            {testResult ? (
              <div className={`settings-alert ${testResult.success ? 'settings-alert--success' : 'settings-alert--error'}`}>
                {testResult.message}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* QR Kod Modalı (Modern Theme-Aware PairingModal) */}
      <PairingModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        settings={settings}
        connectionStatus={connectionStatus}
        pairedControllers={pairedControllers}
        onSettingsChange={onSettingsChange}
      />

      {/* SQL Şeması Modalı */}
      {showSqlModal ? (
        <div className="settings-modal-overlay" onClick={() => setShowSqlModal(false)}>
          <div className="settings-modal settings-modal--large" onClick={(e) => e.stopPropagation()}>
            <header className="settings-modal__header">
              <h3>Supabase SQL Kurulum Şeması</h3>
              <Button size="compact" variant="icon" onClick={() => setShowSqlModal(false)}>
                <X size={15} />
              </Button>
            </header>
            <div className="settings-modal__body">
              <p>Supabase panelinizde <strong>SQL Editor</strong> bölümüne yapıştırıp <strong>Run</strong> butonuna basarak tabloları oluşturabilirsiniz:</p>
              <textarea
                className="sql-code-box"
                readOnly
                value={SUPABASE_SCHEMA_SQL}
                rows={10}
              />
              <div className="settings-modal__actions">
                <Button
                  variant="accent"
                  onClick={() => copyText(SUPABASE_SCHEMA_SQL, setCopiedSql)}
                >
                  {copiedSql ? <Check size={15} /> : <Copy size={15} />}
                  {copiedSql ? 'SQL Kopyalandı!' : 'Tüm SQL Kodunu Kopyala'}
                </Button>
                <Button variant="ghost" onClick={() => setShowSqlModal(false)}>
                  Kapat
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
