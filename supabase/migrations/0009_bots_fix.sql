-- 0008 düzeltmesi: `x = any(seats)` boş (NULL) koltuk içeren dizide eşleşme yoksa NULL döner.
-- Bu yüzden boşta bot bulunamıyordu ve yetki kontrolü NULL dönüp atlanabiliyordu. coalesce ile kesinleştir.

create or replace function public._can_manage_bots(r public.rooms)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(case when r.owner_id is not null then r.owner_id = auth.uid() or public._is_admin()
                       else coalesce(auth.uid() = any(r.seats), false) or public._is_admin() end, false)
$$;

create or replace function public.add_bot(p_room text)
returns json language plpgsql security definer set search_path = '' as $$
declare r public.rooms; bot uuid; bname text; i int; seated int; target int;
begin
  if not public._in_room(p_room) then return json_build_object('ok', false, 'error', 'Odada değilsin'); end if;
  select * into r from public.rooms where id = p_room for update;
  if not (r.game = any(public._bot_games())) then return json_build_object('ok', false, 'error', 'Bu oyunda bot oynayamaz'); end if;
  if not public._can_manage_bots(r) then
    return json_build_object('ok', false, 'error', case when r.owner_id is null then 'Bot eklemek için koltuğa otur' else 'Sadece oda sahibi bot ekleyebilir' end); end if;
  if exists (select 1 from public.game_public g where g.room_id = p_room and g.winner is null) then
    return json_build_object('ok', false, 'error', 'Oyun sürerken bot eklenemez'); end if;
  select count(*) into seated from unnest(r.seats) s where s is not null;
  if seated >= public._max_players(r.game) then return json_build_object('ok', false, 'error', 'Masa dolu'); end if;
  select id, username into bot, bname from public.profiles
    where is_bot and not coalesce(id = any(r.seats), false) order by random() limit 1;
  if bot is null then return json_build_object('ok', false, 'error', 'Boşta bot kalmadı'); end if;
  target := null;
  for i in 2..9 loop
    if r.seats[i] is null and not r.locked[i] then target := i; exit; end if;
  end loop;
  if target is null then return json_build_object('ok', false, 'error', 'Boş koltuk yok'); end if;
  r.seats[target] := bot; r.muted[target] := true;
  update public.rooms set seats = r.seats, muted = r.muted, updated_at = now() where id = p_room;
  perform public._sys_msg(p_room, '🤖 ' || bname || ' masaya oturdu');
  return json_build_object('ok', true);
end $$;

revoke execute on function public._can_manage_bots from public, anon, authenticated;
revoke execute on function public.add_bot from public, anon;
grant execute on function public.add_bot to authenticated;
