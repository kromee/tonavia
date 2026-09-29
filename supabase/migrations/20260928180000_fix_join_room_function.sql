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

  select r.* into target_room
  from public.rooms r
  where r.code = upper(trim(p_room_code));

  if target_room.id is null then
    raise exception 'room not found';
  end if;

  insert into public.guests (room_id, user_id, nickname)
  values (target_room.id, auth.uid(), trim(p_nickname))
  on conflict on constraint guests_room_id_user_id_key
  do update set nickname = excluded.nickname
  returning * into joined_guest;

  return query
  select target_room.id, target_room.code, target_room.name, target_room.status, joined_guest.id;
end;
$$;

grant execute on function public.join_room(text, text) to authenticated;
