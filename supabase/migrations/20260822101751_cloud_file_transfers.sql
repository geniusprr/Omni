-- PC -> telefon bulut dosya kuyruğu.
-- Dosya gövdesi Storage'da, teslim durumu bu tabloda tutulur. Böylece telefon
-- uygulaması arayüzü kapalıyken foreground servis kuyruğu okuyup dosyayı indirir.

create table if not exists public.device_transfers (
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

alter table public.device_transfers enable row level security;

drop policy if exists "Allow public access to device_transfers" on public.device_transfers;
create policy "Allow public access to device_transfers"
  on public.device_transfers
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Public bucket + UUID based paths keep the client implementation simple while
-- the existing app's anon-only pairing model remains in use.
insert into storage.buckets (id, name, public, file_size_limit)
values ('kapanis-transfers', 'kapanis-transfers', true, 536870912)
on conflict (id) do update
set public = true, file_size_limit = 536870912;

drop policy if exists "kapanis transfer objects read" on storage.objects;
create policy "kapanis transfer objects read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'kapanis-transfers');

drop policy if exists "kapanis transfer objects insert" on storage.objects;
create policy "kapanis transfer objects insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'kapanis-transfers');

drop policy if exists "kapanis transfer objects delete" on storage.objects;
create policy "kapanis transfer objects delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'kapanis-transfers');

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'device_transfers'
  ) then
    alter publication supabase_realtime add table public.device_transfers;
  end if;
end
$$;
