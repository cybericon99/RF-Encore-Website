-- GuildCore database schema for RF Online NEXT
-- Run this entire file in Supabase SQL Editor as a project administrator.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  server text,
  region text not null default 'SEA',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.guild_memberships (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','officer','member')),
  created_at timestamptz not null default now(),
  unique(guild_id,user_id)
);

create table if not exists public.roster_members (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  ign text not null check (char_length(ign) between 1 and 50),
  class_name text not null default 'Other',
  faction text not null default 'Other',
  combat_power bigint not null default 0 check (combat_power >= 0),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists roster_members_guild_cp_idx on public.roster_members(guild_id,combat_power desc);
create index if not exists roster_members_guild_ign_idx on public.roster_members(guild_id,lower(ign));

create table if not exists public.cp_history (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  roster_member_id uuid not null references public.roster_members(id) on delete cascade,
  combat_power bigint not null check (combat_power >= 0),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now()
);
create index if not exists cp_history_guild_recorded_idx on public.cp_history(guild_id,recorded_at desc);

create table if not exists public.guild_events (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  event_type text not null default 'Guild event',
  starts_at timestamptz not null,
  location text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists guild_events_guild_starts_idx on public.guild_events(guild_id,starts_at);

-- Webhook URL is intentionally never selectable by normal browser clients.
create table if not exists public.guild_integrations (
  guild_id uuid primary key references public.guilds(id) on delete cascade,
  discord_webhook_url text not null,
  channel_label text,
  updated_at timestamptz not null default now()
);

create or replace function public.is_guild_member(target_guild uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.guild_memberships gm where gm.guild_id=target_guild and gm.user_id=auth.uid()); $$;

create or replace function public.is_guild_officer(target_guild uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.guild_memberships gm where gm.guild_id=target_guild and gm.user_id=auth.uid() and gm.role in ('owner','admin','officer')); $$;

create or replace function public.is_guild_admin(target_guild uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.guild_memberships gm where gm.guild_id=target_guild and gm.user_id=auth.uid() and gm.role in ('owner','admin')); $$;

grant execute on function public.is_guild_member(uuid) to authenticated;
grant execute on function public.is_guild_officer(uuid) to authenticated;
grant execute on function public.is_guild_admin(uuid) to authenticated;

-- Keep profile records synchronized with auth accounts.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id,email,display_name)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1)))
  on conflict(id) do update set email=excluded.email, display_name=coalesce(public.profiles.display_name,excluded.display_name);
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_guildcore on auth.users;
create trigger on_auth_user_created_guildcore after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.guilds enable row level security;
alter table public.guild_memberships enable row level security;
alter table public.roster_members enable row level security;
alter table public.cp_history enable row level security;
alter table public.guild_events enable row level security;
alter table public.guild_integrations enable row level security;

create policy "profiles read self or shared guild" on public.profiles for select to authenticated
using (id=auth.uid() or exists(
  select 1 from public.guild_memberships mine join public.guild_memberships theirs on mine.guild_id=theirs.guild_id
  where mine.user_id=auth.uid() and theirs.user_id=profiles.id
));
create policy "profile update self" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

create policy "guild members can read guild" on public.guilds for select to authenticated using (public.is_guild_member(id));
create policy "authenticated can create guild" on public.guilds for insert to authenticated with check (created_by=auth.uid());
create policy "guild admins update guild" on public.guilds for update to authenticated using (public.is_guild_admin(id)) with check (public.is_guild_admin(id));
create policy "guild owner/admin delete guild" on public.guilds for delete to authenticated using (public.is_guild_admin(id));

create policy "members read memberships in shared guild" on public.guild_memberships for select to authenticated using (public.is_guild_member(guild_id));
create policy "admins grant membership" on public.guild_memberships for insert to authenticated with check (
  (public.is_guild_admin(guild_id)) or
  (user_id=auth.uid() and role='owner' and exists(select 1 from public.guilds g where g.id=guild_id and g.created_by=auth.uid()))
);
create policy "admins update membership" on public.guild_memberships for update to authenticated using (public.is_guild_admin(guild_id)) with check (public.is_guild_admin(guild_id));
create policy "admins or self leave membership" on public.guild_memberships for delete to authenticated using (public.is_guild_admin(guild_id) or user_id=auth.uid());

create policy "guild members read roster" on public.roster_members for select to authenticated using (public.is_guild_member(guild_id));
create policy "officers insert roster" on public.roster_members for insert to authenticated with check (public.is_guild_officer(guild_id));
create policy "officers update roster" on public.roster_members for update to authenticated using (public.is_guild_officer(guild_id)) with check (public.is_guild_officer(guild_id));
create policy "officers delete roster" on public.roster_members for delete to authenticated using (public.is_guild_officer(guild_id));

create policy "guild members read cp history" on public.cp_history for select to authenticated using (public.is_guild_member(guild_id));
create policy "officers insert cp history" on public.cp_history for insert to authenticated with check (public.is_guild_officer(guild_id));

create policy "guild members read events" on public.guild_events for select to authenticated using (public.is_guild_member(guild_id));
create policy "officers create events" on public.guild_events for insert to authenticated with check (public.is_guild_officer(guild_id));
create policy "officers update events" on public.guild_events for update to authenticated using (public.is_guild_officer(guild_id)) with check (public.is_guild_officer(guild_id));
create policy "officers delete events" on public.guild_events for delete to authenticated using (public.is_guild_officer(guild_id));

-- No authenticated read policy exists for this table: webhook secrets remain server-only.
create policy "admins insert integration" on public.guild_integrations for insert to authenticated with check (public.is_guild_admin(guild_id));
create policy "admins update integration" on public.guild_integrations for update to authenticated using (public.is_guild_admin(guild_id)) with check (public.is_guild_admin(guild_id));
create policy "admins delete integration" on public.guild_integrations for delete to authenticated using (public.is_guild_admin(guild_id));

-- Ensure API roles can use tables; RLS remains the actual authorization boundary.
grant usage on schema public to authenticated;
grant select,insert,update,delete on public.profiles,public.guilds,public.guild_memberships,public.roster_members,public.cp_history,public.guild_events,public.guild_integrations to authenticated;

-- Automatically record a CP snapshot when a roster member is created or their CP changes.
create or replace function public.record_cp_snapshot()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op='INSERT' or new.combat_power is distinct from old.combat_power then
    insert into public.cp_history(guild_id,roster_member_id,combat_power,recorded_by)
    values(new.guild_id,new.id,new.combat_power,auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists roster_cp_snapshot on public.roster_members;
create trigger roster_cp_snapshot after insert or update of combat_power on public.roster_members
for each row execute procedure public.record_cp_snapshot();

-- Keep owner creation safe and atomic via the RPC below.
create or replace function public.create_guild(guild_name text, guild_server text default null, guild_region text default 'SEA')
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(guild_name)) < 1 or char_length(trim(guild_name)) > 80 then raise exception 'Guild name must be 1–80 characters'; end if;
  insert into public.guilds(name,server,region,created_by) values(trim(guild_name),nullif(trim(guild_server),''),coalesce(nullif(trim(guild_region),''),'SEA'),auth.uid()) returning id into new_id;
  insert into public.guild_memberships(guild_id,user_id,role) values(new_id,auth.uid(),'owner');
  return new_id;
end;
$$;
grant execute on function public.create_guild(text,text,text) to authenticated;
