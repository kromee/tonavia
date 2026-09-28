create extension if not exists pgcrypto;

create type public.room_status as enum ('active', 'closed');
create type public.queue_item_status as enum ('queued', 'played', 'skipped');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{8,16}$'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  status public.room_status not null default 'active',
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nickname text not null check (char_length(trim(nickname)) between 1 and 24),
  created_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create table public.queue_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  guest_id uuid not null references public.guests (id) on delete cascade,
  spotify_track_id text not null,
  title text not null check (char_length(title) between 1 and 250),
  artist text not null check (char_length(artist) between 1 and 250),
  album_image_url text,
  position integer not null check (position > 0),
  status public.queue_item_status not null default 'queued',
  created_at timestamptz not null default now(),
  unique (room_id, position, status)
);

create index queue_items_room_position_idx on public.queue_items (room_id, position);
create index guests_room_user_idx on public.guests (room_id, user_id);
create unique index queue_items_unique_queued_track_idx
  on public.queue_items (room_id, spotify_track_id)
  where status = 'queued';

alter table public.rooms enable row level security;
alter table public.guests enable row level security;
alter table public.queue_items enable row level security;

create policy "Owners manage their rooms"
  on public.rooms
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Members can view their room"
  on public.rooms
  for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.guests
      where guests.room_id = rooms.id and guests.user_id = auth.uid()
    )
  );

create policy "Guests can view room members"
  on public.guests
  for select
  using (
    exists (
      select 1 from public.guests membership
      where membership.room_id = guests.room_id and membership.user_id = auth.uid()
    )
    or exists (
      select 1 from public.rooms
      where rooms.id = guests.room_id and rooms.owner_id = auth.uid()
    )
  );

create policy "Members can view the queue"
  on public.queue_items
  for select
  using (
    exists (
      select 1 from public.guests
      where guests.room_id = queue_items.room_id and guests.user_id = auth.uid()
    )
    or exists (
      select 1 from public.rooms
      where rooms.id = queue_items.room_id and rooms.owner_id = auth.uid()
    )
  );

create or replace function public.join_room(p_room_code text, p_nickname text)
returns table (
  room_id uuid,
  room_code text,
  room_name text,
  room_status public.room_status,
  guest_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.rooms;
  joined_guest public.guests;
begin
  if auth.uid() is null then
    raise exception 'anonymous authentication is required';
  end if;

  select * into target_room
  from public.rooms
  where code = upper(trim(p_room_code));

  if target_room.id is null then
    raise exception 'room not found';
  end if;

  insert into public.guests (room_id, user_id, nickname)
  values (target_room.id, auth.uid(), trim(p_nickname))
  on conflict (room_id, user_id)
  do update set nickname = excluded.nickname
  returning * into joined_guest;

  return query
  select target_room.id, target_room.code, target_room.name, target_room.status, joined_guest.id;
end;
$$;

create or replace function public.request_queue_item(
  p_room_id uuid,
  p_spotify_track_id text,
  p_title text,
  p_artist text,
  p_album_image_url text default null
)
returns public.queue_items
language plpgsql
security definer
set search_path = public
as $$
declare
  room_record public.rooms;
  requesting_guest public.guests;
  active_request_count integer;
  next_position integer;
  created_item public.queue_items;
begin
  select * into room_record from public.rooms where id = p_room_id for update;
  if room_record.status is distinct from 'active' then
    raise exception 'room is closed';
  end if;

  select * into requesting_guest
  from public.guests
  where room_id = p_room_id and user_id = auth.uid();
  if requesting_guest.id is null then
    raise exception 'you must join this room first';
  end if;

  select count(*) into active_request_count
  from public.queue_items
  where guest_id = requesting_guest.id and status = 'queued';
  if active_request_count >= 3 then
    raise exception 'request limit reached';
  end if;

  if exists (
    select 1 from public.queue_items
    where room_id = p_room_id
      and spotify_track_id = p_spotify_track_id
      and status = 'queued'
  ) then
    raise exception 'track is already in the queue';
  end if;

  select coalesce(max(position), 0) + 1 into next_position
  from public.queue_items
  where room_id = p_room_id and status = 'queued';

  insert into public.queue_items (
    room_id, guest_id, spotify_track_id, title, artist, album_image_url, position
  )
  values (
    p_room_id, requesting_guest.id, p_spotify_track_id, trim(p_title), trim(p_artist),
    nullif(trim(p_album_image_url), ''), next_position
  )
  returning * into created_item;

  return created_item;
end;
$$;

grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.request_queue_item(uuid, text, text, text, text) to authenticated;

alter publication supabase_realtime add table public.rooms, public.guests, public.queue_items;
