create type public.device_command_kind as enum ('shutdown', 'restart', 'cancel');
create type public.device_command_status as enum ('pending', 'processing', 'completed', 'rejected');

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.device_commands (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  command public.device_command_kind not null,
  delay_seconds integer not null default 0 check (delay_seconds between 0 and 86400),
  status public.device_command_status not null default 'pending',
  error_message text check (error_message is null or char_length(error_message) <= 240),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  completed_at timestamptz,
  constraint device_commands_expiry_check check (expires_at > created_at),
  constraint device_commands_device_owner_fkey
    foreign key (device_id, owner_id)
    references public.devices (id, owner_id)
    on delete cascade
);

create index device_commands_pending_idx
  on public.device_commands (device_id, created_at)
  where status = 'pending';

create index device_commands_owner_idx
  on public.device_commands (owner_id, created_at desc);

alter table public.devices enable row level security;
alter table public.device_commands enable row level security;

revoke all on table public.devices from anon;
revoke all on table public.device_commands from anon;
grant select, insert, update, delete on table public.devices to authenticated;
grant select, insert, update, delete on table public.device_commands to authenticated;

create policy "owners can read their devices"
  on public.devices
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "owners can create their devices"
  on public.devices
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "owners can update their devices"
  on public.devices
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "owners can delete their devices"
  on public.devices
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "owners can read their commands"
  on public.device_commands
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "owners can create commands for their devices"
  on public.device_commands
  for insert
  to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1
      from public.devices
      where devices.id = device_commands.device_id
        and devices.owner_id = (select auth.uid())
    )
  );

create policy "owners can update their commands"
  on public.device_commands
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1
      from public.devices
      where devices.id = device_commands.device_id
        and devices.owner_id = (select auth.uid())
    )
  );

create policy "owners can delete their commands"
  on public.device_commands
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'device_commands'
  ) then
    alter publication supabase_realtime add table public.device_commands;
  end if;
end
$$;
