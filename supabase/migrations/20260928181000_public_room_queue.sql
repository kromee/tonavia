create or replace function public.get_room_queue(p_room_code text)
returns table (
  room_id uuid,
  room_code text,
  room_name text,
  room_status public.room_status,
  item_id uuid,
  title text,
  artist text,
  queue_position integer,
  requested_by text
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
    q.position as queue_position,
    g.nickname
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
