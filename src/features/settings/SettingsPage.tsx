import React, { useEffect, useMemo, useState } from 'react'
import Bell from 'lucide-react/dist/esm/icons/bell.js'
import BellRing from 'lucide-react/dist/esm/icons/bell-ring.js'
import Check from 'lucide-react/dist/esm/icons/check.js'
import CloudIcon from 'lucide-react/dist/esm/icons/cloud.js'
import Copy from 'lucide-react/dist/esm/icons/copy.js'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js'
import Laptop from 'lucide-react/dist/esm/icons/laptop.js'
import Languages from 'lucide-react/dist/esm/icons/languages.js'
import Moon from 'lucide-react/dist/esm/icons/moon.js'
import MousePointer2 from 'lucide-react/dist/esm/icons/mouse-pointer-2.js'
import Palette from 'lucide-react/dist/esm/icons/palette.js'
import QrCode from 'lucide-react/dist/esm/icons/qr-code.js'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import Shield from 'lucide-react/dist/esm/icons/shield.js'
import Smartphone from 'lucide-react/dist/esm/icons/smartphone.js'
import Sun from 'lucide-react/dist/esm/icons/sun.js'
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js'
import Wifi from 'lucide-react/dist/esm/icons/wifi.js'
import WifiOff from 'lucide-react/dist/esm/icons/wifi-off.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import QRCode from 'qrcode'
import { PairingModal } from '@/components/PairingModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { LANGUAGE_OPTIONS, detectSystemLocale, formatDateTime, formatTime, useI18n, type AppLocale } from '@/i18n'
import type { AppTheme } from '@/theme'
import type { AppSettings, LocalSendDevice, PairedController, RemoteConnectionStatus, RemoteDesktopStatus, RemoteTrustedDevice } from '@/types'

interface SettingsPageProps {
  settings: AppSettings
  connectionStatus: RemoteConnectionStatus
  lastHeartbeat: number | null
  pairedControllers: PairedController[]
  localDevices: LocalSendDevice[]
  onSettingsChange: (newSettings: AppSettings) => void
  onRefreshControllers: () => void
  appTheme: AppTheme
  onThemeChange: (theme: AppTheme) => void
}

const APPEARANCE_THEMES: Array<{
  id: AppTheme
  name: string
  description: string
  previewClass: string
  icon: typeof Sun
}> = [
  { id: 'obsidian', name: 'Obsidyen', description: 'Dengeli grafit yüzeyler ve net beyaz detaylar', previewClass: 'settings-theme-option__preview--obsidian', icon: Moon },
  { id: 'rose', name: 'Pembe', description: 'Koyu gül tonları ve yumuşak pembe vurgular', previewClass: 'settings-theme-option__preview--rose', icon: Palette },
  { id: 'violet', name: 'Mor', description: 'Mürdüm yüzeyler ve rafine mor detaylar', previewClass: 'settings-theme-option__preview--violet', icon: Palette },
  { id: 'ocean', name: 'Okyanus', description: 'Koyu teal yüzeyler ve ferah mavi vurgular', previewClass: 'settings-theme-option__preview--ocean', icon: Palette },
  { id: 'light', name: 'Açık', description: 'Aydınlık ve temiz gündüz görünümü', previewClass: 'settings-theme-option__preview--light', icon: Sun },
]

const SETTINGS_SECTIONS = [
  { id: 'general', label: 'Genel', description: 'Başlangıç ve cihaz görünümü', icon: Laptop },
  { id: 'appearance', label: 'Görünüm', description: 'Tema ve arayüz tercihleri', icon: Palette },
  { id: 'language', label: 'Dil', description: 'Uygulama dili ve bölgesel biçimler', icon: Languages },
  { id: 'notifications', label: 'Bildirimler', description: 'Telefon bildirim aktarımı', icon: Bell },
  { id: 'devices', label: 'Cihazlar', description: 'Eşleştirme ve erişim', icon: Smartphone },
  { id: 'connection', label: 'Bağlantı', description: 'Supabase ve senkronizasyon', icon: Wifi },
] as const

type SettingsSection = typeof SETTINGS_SECTIONS[number]['id']

const SUPABASE_SCHEMA_SQL = `-- ============================================================================
-- Eon Supabase Database Schema: Temiz Kurulum & Sıfırlama
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

-- 7. Bulut Dosya Kuyruğu (PC'den Telefona, uygulama kapalıyken teslim)
create table public.device_transfers (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  controller_id text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  size bigint not null default 0 check (size >= 0),
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  local_uri text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists device_transfers_pending_idx
  on public.device_transfers (device_id, controller_id, created_at)
  where status = 'pending';

grant select, insert, update, delete on table public.device_transfers to anon, authenticated;

-- PostgREST erişimi RLS'den ayrıdır. Masaüstü INSERT, telefon SELECT kullanır.
grant select, insert, update, delete on table public.device_notifications to anon, authenticated;

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
alter table public.device_transfers enable row level security;

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

drop policy if exists "Allow public access to device_transfers" on public.device_transfers;
create policy "Allow public access to device_transfers"
  on public.device_transfers for all
  to anon, authenticated
  using (true)
  with check (true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('kapanis-transfers', 'kapanis-transfers', true, 536870912)
on conflict (id) do update set public = true, file_size_limit = 536870912;

drop policy if exists "kapanis transfer objects read" on storage.objects;
create policy "kapanis transfer objects read" on storage.objects for select
  to anon, authenticated using (bucket_id = 'kapanis-transfers');
drop policy if exists "kapanis transfer objects insert" on storage.objects;
create policy "kapanis transfer objects insert" on storage.objects for insert
  to anon, authenticated with check (bucket_id = 'kapanis-transfers');
drop policy if exists "kapanis transfer objects delete" on storage.objects;
create policy "kapanis transfer objects delete" on storage.objects for delete
  to anon, authenticated using (bucket_id = 'kapanis-transfers');

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
  if not exists (
    select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'device_transfers'
  ) then
    alter publication supabase_realtime add table public.device_transfers;
  end if;
end
$$;`

export function SettingsPage({
  settings,
  connectionStatus,
  lastHeartbeat,
  pairedControllers,
  localDevices,
  onSettingsChange,
  onRefreshControllers,
  appTheme,
  onThemeChange,
}: SettingsPageProps) {
  const { locale, localeTag, setLocale, t } = useI18n()
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')
  const [languageSearch, setLanguageSearch] = useState('')
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
  const [localIps, setLocalIps] = useState<string[]>([])
  const [remoteEnabled, setRemoteEnabled] = useState(settings.remoteDesktopEnabled !== false)
  const [remoteStatus, setRemoteStatus] = useState<RemoteDesktopStatus>({ state: 'ready', sessionId: null, controllerId: null, controllerName: null, display: null, lastError: null })
  const [trustedRemoteDevices, setTrustedRemoteDevices] = useState<RemoteTrustedDevice[]>([])

  const systemLocale = detectSystemLocale()
  const selectedLanguage = LANGUAGE_OPTIONS.find((language) => language.code === locale) || LANGUAGE_OPTIONS[0]
  const systemLanguage = LANGUAGE_OPTIONS.find((language) => language.code === systemLocale) || LANGUAGE_OPTIONS[0]
  const filteredLanguages = useMemo(() => {
    const query = languageSearch.trim().toLocaleLowerCase(localeTag)
    if (!query) return LANGUAGE_OPTIONS
    return LANGUAGE_OPTIONS.filter((language) =>
      `${language.nativeName} ${language.label} ${language.code}`.toLocaleLowerCase(localeTag).includes(query),
    )
  }, [languageSearch, localeTag])

  function handleLanguageChange(nextLocale: AppLocale) {
    setLocale(nextLocale)
    const updated: AppSettings = { ...settings, language: nextLocale, lastSavedAt: Date.now() }
    void saveEffectiveSettings(updated)
    onSettingsChange(updated)
  }

  useEffect(() => {
    void desktop.localsend.getStatus().then((st) => {
      if (st && st.allIps && st.allIps.length > 0) setLocalIps(st.allIps)
      else if (st && st.localIp) setLocalIps([st.localIp])
    }).catch(() => undefined)
    return undefined
  }, [])

  useEffect(() => {
    setRemoteEnabled(settings.remoteDesktopEnabled !== false)
    void desktop.remoteDesktop.getStatus().then(setRemoteStatus).catch(() => undefined)
    void desktop.remoteDesktop.listTrustedDevices().then(setTrustedRemoteDevices).catch(() => undefined)
    return desktop.remoteDesktop.onState(setRemoteStatus)
  }, [settings.remoteDesktopEnabled])

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
    setRemoteEnabled(settings.remoteDesktopEnabled !== false)
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
    const relativeTime = new Intl.RelativeTimeFormat(localeTag, { numeric: 'auto' })
    const interval = setInterval(() => {
      if (!lastHeartbeat) {
        setHeartbeatAgo('')
        return
      }
      const diffSec = Math.floor((Date.now() - lastHeartbeat) / 1000)
      if (diffSec < 5) setHeartbeatAgo(relativeTime.format(0, 'second'))
      else if (diffSec < 60) setHeartbeatAgo(relativeTime.format(-diffSec, 'second'))
      else setHeartbeatAgo(relativeTime.format(-Math.floor(diffSec / 60), 'minute'))
    }, 1000)
    return () => clearInterval(interval)
  }, [lastHeartbeat, localeTag])

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
      remoteDesktopEnabled: remoteEnabled,
      lastSavedAt: Date.now(),
    }
    try {
      await saveEffectiveSettings(updated)
      onSettingsChange(updated)
      setTestResult({ success: true, message: t('Ayarlar başarıyla kaydedildi.') })
    } catch {
      setTestResult({ success: false, message: t('Ayarlar kaydedilemedi.') })
    } finally {
      setSaving(false)
    }
  }

  async function handleSendTestNotification() {
    await desktop.notifications.test(t('Eon Test Bildirimi'), t('Bilgisayarınızdan telefonunuza başarıyla iletildi!'))
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

  async function handleRemoteEnabledChange(enabled: boolean) {
    setRemoteEnabled(enabled)
    await desktop.remoteDesktop.setEnabled(enabled)
    const updated = { ...settings, remoteDesktopEnabled: enabled }
    await saveEffectiveSettings(updated)
    onSettingsChange(updated)
  }

  async function handleRevokeRemoteDevice(id: string) {
    await desktop.remoteDesktop.revokeTrustedDevice(id)
    setTrustedRemoteDevices(await desktop.remoteDesktop.listTrustedDevices())
  }

  async function handleRevokeAllRemoteDevices() {
    await desktop.remoteDesktop.revokeAllTrustedDevices()
    setTrustedRemoteDevices([])
  }

  function copyText(text: string, setCopied: (v: boolean) => void) {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const localUnpairedDevices = localDevices.filter((device) =>
    !pairedControllers.some((controller) => controller.controllerId === device.fingerprint)
  )
  const activeLocal = (device: LocalSendDevice | undefined) => Boolean(device && Date.now() - device.lastSeen < 45_000)
  const activeCloud = (controller: PairedController) => Boolean(
    controller.lastActiveAt && Date.now() - Date.parse(controller.lastActiveAt) < 60_000,
  )
  const activeDeviceCount = new Set([
    ...localDevices.map((device) => device.fingerprint),
    ...pairedControllers.map((controller) => controller.controllerId),
  ]).size

  return (
    <section className="utility-screen settings-screen" aria-labelledby="settings-title">
      <header className="screen-heading settings-page-heading">
        <div>
          <span className="settings-page-heading__eyebrow">EON / {t('Sistem')}</span>
          <h1 id="settings-title">{t('Ayarlar')}</h1>
          <p>{t('Uygulamanın görünümünü, bağlantılarını ve cihaz erişimini yönetin.')}</p>
        </div>
        <div className="settings-status-badge">
          {connectionStatus === 'connected' ? (
            <span className="status-badge status-badge--online">
              <span className="status-badge__dot" /> {t('Supabase Bağlı')}
            </span>
          ) : connectionStatus === 'connecting' ? (
            <span className="status-badge status-badge--connecting">
              <span className="status-badge__dot" /> {t('Bağlanıyor...')}
            </span>
          ) : (
            <span className="status-badge status-badge--offline">
              <WifiOff size={13} /> {t('Bağlantı Yok')}
            </span>
          )}
        </div>
      </header>

      <div className="settings-workspace">
        <aside className="settings-navigation" aria-label={t('Ayarlar alt menüsü')}>
          <div className="settings-navigation__label">{t('Çalışma alanı')}</div>
          <nav className="settings-navigation__list">
            {SETTINGS_SECTIONS.map((section) => {
              const Icon = section.icon
              const isActive = activeSection === section.id
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`settings-navigation__item ${isActive ? 'settings-navigation__item--active' : ''}`}
                  onClick={() => setActiveSection(section.id)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="settings-navigation__icon"><Icon size={15} /></span>
                  <span className="settings-navigation__copy">
                    <strong>{t(section.label)}</strong>
                    <small>{t(section.description)}</small>
                  </span>
                </button>
              )
            })}
          </nav>
          <div className="settings-navigation__footer">
            <span className="settings-navigation__footer-dot" />
            <span>{t('Eon masaüstü')}</span>
          </div>
        </aside>

      <div className="settings-scroll-area" data-active-section={activeSection}>
        <div className="settings-section-intro">
          <span>{t(SETTINGS_SECTIONS.find((section) => section.id === activeSection)?.label || '')}</span>
          <p>{t(SETTINGS_SECTIONS.find((section) => section.id === activeSection)?.description || '')}</p>
        </div>

        {/* Windows Başlangıcı */}
        <div className="settings-card" data-settings-section="general">
          <div className="settings-card__header">
            <div className="settings-card__icon"><Laptop size={17} /></div>
            <div>
              <h3>{t('Windows ile Başlatma')}</h3>
              <p>{t('Bilgisayar açıldığında Eon arka planda otomatik çalışsın.')}</p>
            </div>
          </div>
          <div className="settings-card__body settings-row">
            <Label htmlFor="autostart-toggle">{t('Windows açılışında başlat')}</Label>
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

        {/* Görünüm ve tema */}
        <div className="settings-card settings-card--appearance" data-settings-section="appearance">
          <div className="settings-card__header">
            <div className="settings-card__icon"><Palette size={17} /></div>
            <div>
              <h3>{t('Tema ve görünüm')}</h3>
              <p>{t('Arayüzün ana görünümünü ve vurgu karakterini seçin.')}</p>
            </div>
          </div>
          <div className="settings-theme-options" role="group" aria-label={t('Tema seçimi')}>
            {APPEARANCE_THEMES.map((theme) => {
              const Icon = theme.icon
              const active = appTheme === theme.id
              return (
                <button
                  key={theme.id}
                  type="button"
                  className={`settings-theme-option ${active ? 'settings-theme-option--active' : ''}`}
                  data-theme={theme.id}
                  onClick={() => onThemeChange(theme.id)}
                  aria-pressed={active}
                >
                  <span className={`settings-theme-option__preview ${theme.previewClass}`}><Icon size={17} /></span>
                  <span><strong>{t(theme.name)}</strong><small>{t(theme.description)}</small></span>
                  {active ? <Check className="settings-theme-option__check" size={14} aria-hidden="true" /> : null}
                </button>
              )
            })}
          </div>
        </div>

        <Card className="settings-card settings-card--language" data-settings-section="language">
          <CardHeader className="settings-card__header">
            <div className="settings-card__icon"><Languages size={17} /></div>
            <div className="settings-language-heading-copy">
              <CardTitle>{t('Uygulama dili')}</CardTitle>
              <CardDescription>{t('Eon ilk açılışta sistem dilinizi otomatik seçer. Buradan istediğiniz zaman değiştirebilirsiniz.')}</CardDescription>
            </div>
            <Badge variant="outline" className="settings-language-current-badge">
              {selectedLanguage.nativeName}
            </Badge>
          </CardHeader>
          <CardContent className="settings-card__body settings-language-body">
            <div className="settings-language-summary">
              <div>
                <span className="settings-language-summary__label">{t('Sistem dili')}</span>
                <strong>{systemLanguage.nativeName}</strong>
              </div>
              {locale === systemLocale ? <Badge variant="secondary">{t('Otomatik seçildi')}</Badge> : null}
            </div>

            <div className="settings-language-search">
              <Search size={16} aria-hidden="true" />
              <Input
                value={languageSearch}
                onChange={(event) => setLanguageSearch(event.target.value)}
                placeholder={t('Dil ara...')}
                aria-label={t('Dil ara...')}
              />
            </div>

            <div className="settings-language-grid" role="listbox" aria-label={t('Uygulama dili')}>
              {filteredLanguages.map((language) => {
                const active = language.code === locale
                return (
                  <button
                    type="button"
                    className={`settings-language-option ${active ? 'settings-language-option--active' : ''}`}
                    key={language.code}
                    role="option"
                    aria-selected={active}
                    onClick={() => handleLanguageChange(language.code)}
                  >
                    <span className="settings-language-option__code">{language.code.toUpperCase()}</span>
                    <span className="settings-language-option__copy">
                      <strong>{language.nativeName}</strong>
                      <small>{language.label}</small>
                    </span>
                    {active ? <span className="settings-language-option__check"><Check size={14} /> {t('Seçili')}</span> : null}
                  </button>
                )
              })}
            </div>
            <p className="settings-language-footnote">{t('Arayüz dili anında uygulanır. Tarih, saat ve sayı biçimleri de seçilen dile uyarlanır.')}</p>
          </CardContent>
        </Card>

        {/* PC Bildirim Aynalama */}
        <div className="settings-card" data-settings-section="notifications">
          <div className="settings-card__header">
            <div className="settings-card__icon"><Bell size={17} /></div>
            <div>
              <h3>{t('PC Bildirim Aynalama (Telefona İletim)')}</h3>
              <p>{t("Windows'a gelen WhatsApp, Chrome, Discord, Sistem vb. bildirimleri telefona aktar.")}</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="settings-row" style={{ marginBottom: '14px' }}>
              <div>
                <Label htmlFor="notif-mirror-toggle" style={{ fontWeight: 600 }}>{t('Bildirim Aynalama Aktif')}</Label>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '2px 0 0' }}>
                  {listenerStatus.running ? t('✓ Windows bildirim dinleyicisi arka planda çalışıyor') : t('Dinleyici başlatılıyor...')}
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
                    <BellRing size={14} color="#38bdf8" /> {t('ntfy.sh Kilit Ekranı Bildirimi (Dışarıdayken)')}
                  </Label>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '2px 0 0' }}>
                    {t('Telefon kilitliyken ve tarayıcı kapalıyken bile sesli/titreşimli push bildirimi gönderir.')}
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
                  <Label htmlFor="ntfy-topic-input">{t('ntfy.sh Gizli Kanal Adı (Topic)')}</Label>
                  <Input
                    id="ntfy-topic-input"
                    value={ntfyTopic}
                    placeholder="kapanis_xxxxxx"
                    onChange={(e) => setNtfyTopic(e.target.value)}
                  />
                  <span className="field-hint">
                    {t('Telefondaki ücretsiz ntfy uygulamasından bu kanala abone olarak kilit ekranında bildirim alabilirsiniz.')}
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
                {testNotifSent ? t('Test Bildirimi Gönderildi!') : t('Test Bildirimi Gönder')}
              </Button>
            </div>
          </div>
        </div>

        {/* Bu Bilgisayar ve Eşleştirme Kodu */}
        <div className="settings-card settings-card--highlight" data-settings-section="devices">
          <div className="settings-card__header">
            <div className="settings-card__icon"><Shield size={17} /></div>
            <div>
              <h3>{t('Bu Bilgisayar & Eşleştirme')}</h3>
              <p>{t("Telefondan ya da başka bir PC'den kontrol için benzersiz kod.")}</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="compact-field">
              <Label htmlFor="device-name-input">{t('Bilgisayar Adı')}</Label>
              <Input
                id="device-name-input"
                value={deviceName}
                placeholder={t('Örn: Masaüstü PC')}
                onChange={(e) => setDeviceName(e.target.value)}
              />
            </div>

            <div className="pairing-code-box">
              <div className="pairing-code-display">
                <span className="pairing-code-label">{t('EŞLEŞTİRME KODU')}</span>
                <strong className="pairing-code-value">{settings.pairingCode}</strong>
              </div>
              <div className="pairing-code-actions">
                <Button
                  size="compact"
                  variant="soft"
                  onClick={() => copyText(settings.pairingCode, setCopiedCode)}
                >
                  {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                  {copiedCode ? t('Kopyalandı') : t('Kodu Kopyala')}
                </Button>
                <Button
                  size="compact"
                  variant="soft"
                  onClick={() => copyText(cloudRemoteUrl, setCopiedLink)}
                >
                  {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                  {copiedLink ? t('Link Kopyalandı') : t('Eşleştirme Linki')}
                </Button>
                <Button
                  size="compact"
                  variant="accent"
                  onClick={() => setShowQrModal(true)}
                >
                  <QrCode size={14} /> {t('QR Kod ile Bağlan')}
                </Button>
                <Button
                  size="compact"
                  variant="ghost"
                  title={t('Yeni eşleştirme kodu üret')}
                  onClick={() => void handleRegeneratePairingCode()}
                >
                  <RefreshCw size={14} />
                </Button>
              </div>
            </div>

            <div className="heartbeat-info">
              <span className="runtime-dot" />
              <span>{t('Kalp atışı aktif (15 sn)')} {heartbeatAgo ? `· ${t('Son sinyal')}: ${heartbeatAgo}` : ''}</span>
            </div>
          </div>
        </div>

        {/* Mobil PC Ekranı */}
        <div className="settings-card settings-card--highlight" data-settings-section="devices">
          <div className="settings-card__header">
            <div className="settings-card__icon"><MousePointer2 size={17} /></div>
            <div>
              <h3>{t('Mobil PC Ekranı')}</h3>
              <p>{t('Aynı Wi‑Fi ağındaki telefondan ekranı gör, mouse’u hareket ettir ve yazı yaz.')}</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="settings-row" style={{ marginBottom: '12px' }}>
              <div>
                <Label htmlFor="remote-desktop-toggle" style={{ fontWeight: 600 }}>{t('PC Ekranı aktif')}</Label>
                <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '2px 0 0' }}>
                  {remoteStatus.state === 'connected'
                    ? t('{device} bağlı', { device: remoteStatus.controllerName || t('Mobil cihaz') })
                    : remoteEnabled ? t('LAN bağlantısı için hazır') : t('Mobil ekran kontrolü kapalı')}
                </p>
              </div>
              <Switch id="remote-desktop-toggle" checked={remoteEnabled} onCheckedChange={(value) => void handleRemoteEnabledChange(value)} />
            </div>

            {remoteStatus.sessionId ? (
              <div className="heartbeat-info" style={{ marginBottom: '12px' }}>
                <span className="runtime-dot" />
                <span>{t('{device} şu anda PC ekranını kontrol ediyor.', { device: remoteStatus.controllerName || t('Mobil cihaz') })}</span>
                <Button size="compact" variant="ghost" onClick={() => void desktop.remoteDesktop.stopSession()}>{t('Oturumu Kapat')}</Button>
              </div>
            ) : null}

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
              <div className="settings-row" style={{ marginBottom: '8px' }}>
                <div>
                  <Label style={{ fontWeight: 600 }}>{t('Güvenilen telefonlar')}</Label>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '2px 0 0' }}>{t('PIN yalnızca yeni eşleşmede istenir.')}</p>
                </div>
                {trustedRemoteDevices.length > 0 ? <Button size="compact" variant="ghost" onClick={() => void handleRevokeAllRemoteDevices()}>{t('Tümünü İptal Et')}</Button> : null}
              </div>
              {trustedRemoteDevices.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>{t('Henüz güvenilen mobil cihaz yok.')}</p>
              ) : trustedRemoteDevices.map((device) => (
                <div className="paired-item" key={device.id}>
                  <div className="paired-item__icon"><Smartphone size={15} /></div>
                  <div className="paired-item__info">
                    <strong>{device.controllerName}</strong>
                    <small>{t('Son kullanım')}: {formatDateTime(device.lastActiveAt, undefined, locale)}</small>
                  </div>
                  <Button size="compact" variant="icon" title={t('Güveni kaldır')} onClick={() => void handleRevokeRemoteDevice(device.id)}><Trash2 size={14} /></Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Eşleştirilen Cihazlar Listesi */}
        <div className="settings-card" data-settings-section="devices">
          <div className="settings-card__header">
            <div className="settings-card__icon"><Smartphone size={17} /></div>
            <div>
              <h3>{t('Aktif Cihazlar')} ({activeDeviceCount})</h3>
              <p>{t('Bu bilgisayara uzaktan erişim izni olan yerel Wi-Fi ve bulut cihazları.')}</p>
            </div>
          </div>
          <div className="settings-card__body">
            {pairedControllers.length === 0 && localDevices.length === 0 ? (
              <div className="paired-empty">
                <Smartphone size={22} />
                <span>{t('Henüz eşleşmiş bir cihaz yok. Telefondan QR kodu okutun veya aynı Wi-Fi ağından bağlanın.')}</span>
              </div>
            ) : (
              <div className="paired-list">
                {localUnpairedDevices.map((dev) => (
                  <div className="paired-item" key={`local-${dev.ip}-${dev.port}`}>
                    <div className="paired-item__icon">
                      <Smartphone size={15} />
                    </div>
                    <div className="paired-item__info">
                      <strong>{dev.alias || t('Yerel Cihaz')}</strong>
                      <small>{dev.ip}:{dev.port} · {dev.deviceModel || t('Mobil')}</small>
                    </div>
                    <span className={`status-badge ${activeLocal(dev) ? 'status-badge--online' : 'status-badge--offline'}`} style={{ fontSize: '11px', padding: '2px 8px' }}>
                      <span className="status-badge__dot" /> {activeLocal(dev) ? t('Yerel') : t('Bekliyor')}
                    </span>
                  </div>
                ))}
                {pairedControllers.map((ctrl) => (
                  <div className="paired-item" key={ctrl.id}>
                    <div className="paired-item__icon">
                      {ctrl.controllerType === 'desktop' ? <Laptop size={15} /> : <Smartphone size={15} />}
                    </div>
                    <div className="paired-item__info">
                      <strong>{ctrl.controllerName || t('Telefon Denetleyici')}</strong>
                      <small>{t('Son aktiflik')}: {ctrl.lastActiveAt ? formatTime(ctrl.lastActiveAt, { hour: '2-digit', minute: '2-digit' }, locale) : t('Bilinmiyor')}</small>
                    </div>
                    <div className="paired-item__presence" title={t('Bağlantı kanalları')}>
                      {activeLocal(localDevices.find((device) => device.fingerprint === ctrl.controllerId)) ? <span className="presence-chip presence-chip--local"><Wifi size={11} /> {t('Yerel')}</span> : null}
                      {activeCloud(ctrl) ? <span className="presence-chip presence-chip--cloud"><CloudIcon size={11} /> {t('Bulut')}</span> : null}
                      {!activeLocal(localDevices.find((device) => device.fingerprint === ctrl.controllerId)) && !activeCloud(ctrl) ? <span className="presence-chip presence-chip--offline"><WifiOff size={11} /> {t('Bekliyor')}</span> : null}
                    </div>
                    <Button
                      size="compact"
                      variant="icon"
                      title={t('Bağlantıyı Kes / Kaldır')}
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
        <div className="settings-card" data-settings-section="connection">
          <div className="settings-card__header">
            <div className="settings-card__icon"><Wifi size={17} /></div>
            <div>
              <h3>{t('Supabase Bağlantısı')}</h3>
              <p>{t('Gerçek zamanlı komutlar ve kalp atışı için veritabanı ayarları.')}</p>
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
                {saving ? t('Kaydediliyor…') : t('Ayarları Kaydet')}
              </Button>
              <Button
                variant="soft"
                disabled={testingConnection || !url || !key}
                onClick={() => void handleTestConnection()}
              >
                {testingConnection ? t('Test Ediliyor…') : t('Bağlantıyı Test Et')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowSqlModal(true)}
              >
                <ExternalLink size={14} /> {t('SQL Şeması')}
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
              <h3>{t('Supabase SQL Kurulum Şeması')}</h3>
              <Button size="compact" variant="icon" onClick={() => setShowSqlModal(false)}>
                <X size={15} />
              </Button>
            </header>
            <div className="settings-modal__body">
              <p>{t('Supabase panelinizde SQL Editor bölümüne yapıştırıp Run butonuna basarak tabloları oluşturabilirsiniz:')}</p>
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
                  {copiedSql ? t('SQL Kopyalandı!') : t('Tüm SQL Kodunu Kopyala')}
                </Button>
                <Button variant="ghost" onClick={() => setShowSqlModal(false)}>
                  {t('Kapat')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
