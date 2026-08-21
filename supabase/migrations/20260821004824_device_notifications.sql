-- ============================================================================
-- PC bildirimlerinin telefona aktarılması için kalıcı bildirim tablosu.
-- Bu migration mevcut cihaz/bildirim kayıtlarını silmeden eksik altyapıyı tamamlar.
-- ============================================================================

create table if not exists public.device_notifications (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  notification_id text,
  app_name text not null default 'Sistem',
  title text,
  body text,
  timestamp timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists device_notifications_device_timestamp_idx
  on public.device_notifications (device_id, timestamp desc);

-- PostgREST erişimi RLS'den ayrıdır; mobil istemci SELECT, masaüstü INSERT yapar.
grant select, insert, update, delete on table public.device_notifications to anon, authenticated;

alter table public.device_notifications enable row level security;

drop policy if exists "Allow public access to device_notifications" on public.device_notifications;
create policy "Allow public access to device_notifications"
  on public.device_notifications
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Realtime istemcileri tabloyu dinleyebilirse anlık akış da çalışır; Android ayrıca
-- REST polling kullandığı için publication eksik olsa bile geçmiş akışı korunur.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'device_notifications'
  ) then
    alter publication supabase_realtime add table public.device_notifications;
  end if;
end
$$;
