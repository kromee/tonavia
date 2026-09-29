-- Spotify playback sync: tracks what is playing, removes finished songs
-- and frees the guest's request slot as soon as their song starts.

alter table public.queue_items
  drop constraint if exists queue_items_room_id_position_status_key;

alter table public.queue_items
  add column if not exists started_at timestamptz,
  add column if not exists played_at timestamptz,
  add column if not exists sent_to_spotify_at timestamptz;

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
  where guest_id = requesting_guest.id and status = 'queued' and started_at is null;
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
  where room_id = p_room_id;

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

drop function if exists public.get_room_queue(text);

create function public.get_room_queue(p_room_code text)
returns table (
  room_id uuid,
  room_code text,
  room_name text,
  room_status public.room_status,
  item_id uuid,
  title text,
  artist text,
  album_image_url text,
  spotify_track_id text,
  queue_position integer,
  requested_by text,
  started_at timestamptz,
  sent_to_spotify_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.code,
    r.name,
    r.status,
    q.id,
    q.title,
    q.artist,
    q.album_image_url,
    q.spotify_track_id,
    q.position,
    g.nickname,
    q.started_at,
    q.sent_to_spotify_at
  from public.rooms r
  left join public.queue_items q
    on q.room_id = r.id
   and q.status = 'queued'
  left join public.guests g
    on g.id = q.guest_id
  where r.code = upper(trim(p_room_code))
  order by q.position nulls last;
$$;

revoke all on function public.get_room_queue(text) from public;
grant execute on function public.get_room_queue(text) to anon, authenticated;

create or replace function public.sync_room_playback(p_room_id uuid, p_spotify_track_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  if not exists (
    select 1 from public.rooms where id = p_room_id and owner_id = auth.uid()
  ) then
    raise exception 'only the room owner can sync playback';
  end if;

  select id into target_id
  from public.queue_items
  where room_id = p_room_id
    and status = 'queued'
    and spotify_track_id = p_spotify_track_id
  order by position
  limit 1;

  update public.queue_items
  set status = 'played', played_at = now()
  where room_id = p_room_id
    and status = 'queued'
    and started_at is not null
    and id is distinct from target_id;

  if target_id is not null then
    update public.queue_items
    set started_at = coalesce(started_at, now())
    where id = target_id;
  end if;
end;
$$;

create or replace function public.mark_queue_item_sent(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.queue_items q
  set sent_to_spotify_at = now()
  from public.rooms r
  where q.id = p_item_id
    and r.id = q.room_id
    and r.owner_id = auth.uid();
end;
$$;

create or replace function public.remove_queue_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.queue_items q
  set status = 'skipped', played_at = now()
  from public.rooms r
  where q.id = p_item_id
    and q.status = 'queued'
    and r.id = q.room_id
    and r.owner_id = auth.uid();
end;
$$;

revoke all on function public.sync_room_playback(uuid, text) from public;
revoke all on function public.mark_queue_item_sent(uuid) from public;
revoke all on function public.remove_queue_item(uuid) from public;
grant execute on function public.sync_room_playback(uuid, text) to authenticated;
grant execute on function public.mark_queue_item_sent(uuid) to authenticated;
grant execute on function public.remove_queue_item(uuid) to authenticated;
