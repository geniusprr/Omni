-- ============================================================================
-- Omni Supabase Database Schema: Cihaz Eşleştirme, Kalp Atışı & Uzaktan Kontrol
-- ============================================================================

-- 1. Eski Çakışan Tablo ve Tipleri Güvenle Temizleme
drop table if exists public.device_commands cascade;
drop table if exists public.paired_controllers cascade;
drop table if exists public.devices cascade;

drop type if exists public.device_command_kind cascade;
drop type if exists public.device_command_status cascade;

-- 2. Tipler
create type public.device_command_kind as enum ('shutdown', 'restart', 'cancel');
create type public.device_command_status as enum ('pending', 'processing', 'completed', 'rejected');

-- 2. Cihazlar Tablosu (Bilgisayarlar)
create table if not exists public.devices (
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

-- 3. Eşleştirilen Denetleyiciler Tablosu (Telefonlar, Tabletler, Tarayıcılar)
create table if not exists public.paired_controllers (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  controller_id text not null,
  controller_name text not null default 'Telefon',
  controller_type text default 'mobile',
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (device_id, controller_id)
);

-- 4. Komutlar Tablosu (Uzaktan Kapatma, Yeniden Başlatma, İptal)
create table if not exists public.device_commands (
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

-- İndeksler
create index if not exists device_commands_pending_idx
  on public.device_commands (device_id, created_at)
  where status = 'pending';

create index if not exists devices_pairing_code_idx
  on public.devices (pairing_code);

create index if not exists paired_controllers_device_idx
  on public.paired_controllers (device_id);

-- RLS (Row Level Security) Etkinleştirme
alter table public.devices enable row level security;
alter table public.paired_controllers enable row level security;
alter table public.device_commands enable row level security;

-- Anon ve Authenticated Rolleri için İzin Politikaları
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

-- Supabase Realtime Yayınları
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
end
$$;
