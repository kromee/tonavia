create or replace function public.has_room_access(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.rooms
      where id = p_room_id and owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.guests
      where room_id = p_room_id and user_id = auth.uid()
    );
$$;

revoke all on function public.has_room_access(uuid) from public;
grant execute on function public.has_room_access(uuid) to authenticated;

drop policy "Members can view their room" on public.rooms;
drop policy "Guests can view room members" on public.guests;
drop policy "Members can view the queue" on public.queue_items;

create policy "Members can view joined rooms"
  on public.rooms
  for select
  using (public.has_room_access(id));

create policy "Members can view room guests"
  on public.guests
  for select
  using (public.has_room_access(room_id));

create policy "Members can view room queue"
  on public.queue_items
  for select
  using (public.has_room_access(room_id));
