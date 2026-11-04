-- Botlar: Uno, Ludo, Tavla ve Okey masalarına bot eklenebilir.
-- Botlar gerçek kullanıcı gibi davranmaz: adları "Robo_" ile başlar, profiles.is_bot = true, giriş yapamazlar
-- (rastgele şifre, kimseyle paylaşılmaz). Hamlelerini hakem Edge Function'ları sunucuda yapar.

alter table public.profiles add column if not exists is_bot boolean not null default false;

-- bot hesapları (giriş yapılamaz; handle_new_user tetikleyicisi profil + cüzdan açar)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'bot' || v.i || '@bots.parti.local', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
       '{"provider": "email", "providers": ["email"]}'::jsonb,
       jsonb_build_object('username', v.name, 'avatar', v.av), now(), now()
from (values (1, 'Robo_Ayşe', 'a09'), (2, 'Robo_Mehmet', 'a07'), (3, 'Robo_Zeynep', 'a13'), (4, 'Robo_Can', 'a18'),
             (5, 'Robo_Elif', 'a14'), (6, 'Robo_Deniz', 'a02'), (7, 'Robo_Ece', 'a06'), (8, 'Robo_Kaan', 'a04')) v(i, name, av)
where not exists (select 1 from auth.users u where u.email = 'bot' || v.i || '@bots.parti.local');

update public.profiles p set is_bot = true, bio = 'Ben bir botum 🤖'
from auth.users u where u.id = p.id and u.email like 'bot%@bots.parti.local';

create or replace function public._bot_games()
returns text[] language sql immutable set search_path = '' as $$ select array['uno', 'ludo', 'tavla', 'okey'] $$;

create or replace function public._max_players(p_game text)
returns int language sql immutable set search_path = '' as $$
  select case p_game when 'uno' then 6 when 'ludo' then 4 when 'tavla' then 2 when 'okey' then 4 else 0 end
$$;

-- bot ekleme/çıkarma yetkisi: oda sahibi (ya da yönetici); sahipsiz kalıcı odada koltuktaki biri
create or replace function public._can_manage_bots(r public.rooms)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when r.owner_id is not null then r.owner_id = auth.uid() or public._is_admin()
              else auth.uid() = any(r.seats) or public._is_admin() end
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
    where is_bot and not (id = any(r.seats)) order by random() limit 1;
  if bot is null then return json_build_object('ok', false, 'error', 'Boşta bot kalmadı'); end if;
  -- ev sahibi koltuğu (1) dışındaki ilk boş ve kilitsiz koltuk
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

create or replace function public.remove_bot(p_room text, p_bot uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare r public.rooms; bname text;
begin
  if not public._in_room(p_room) then return json_build_object('ok', false, 'error', 'Odada değilsin'); end if;
  select * into r from public.rooms where id = p_room;
  if not exists (select 1 from public.profiles where id = p_bot and is_bot) then
    return json_build_object('ok', false, 'error', 'Bu bir bot değil'); end if;
  if not public._can_manage_bots(r) then return json_build_object('ok', false, 'error', 'Sadece oda sahibi botu kaldırabilir'); end if;
  perform public._free_seat(p_room, p_bot);
  select username into bname from public.profiles where id = p_bot;
  perform public._sys_msg(p_room, '🤖 ' || coalesce(bname, 'Bot') || ' masadan kalktı');
  return json_build_object('ok', true);
end $$;

-- odadan son insan çıkınca botlar da koltuklarından kalkar (kalıcı odalarda boş masada bot kalmasın)
create or replace function public._leave(p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare pr public.room_presence; r public.rooms; uname text; nxt uuid; i int;
begin
  delete from public.room_presence where user_id = p_uid returning * into pr;
  if pr is null then return; end if;
  perform public._free_seat(pr.room_id, p_uid);
  select username into uname from public.profiles where id = p_uid;
  perform public._sys_msg(pr.room_id, coalesce(uname, 'Biri') || ' odadan ayrıldı');
  select * into r from public.rooms where id = pr.room_id for update;
  if r is null then return; end if;
  if not exists (select 1 from public.room_presence where room_id = r.id) then
    for i in 1..9 loop
      if r.seats[i] is not null and exists (select 1 from public.profiles where id = r.seats[i] and is_bot) then
        r.seats[i] := null; r.muted[i] := false;
      end if;
    end loop;
    update public.rooms set seats = r.seats, muted = r.muted, updated_at = now() where id = r.id;
  end if;
  if r.owner_id = p_uid and not r.permanent then
    select s into nxt from unnest(r.seats) s where s is not null
      and not exists (select 1 from public.profiles b where b.id = s and b.is_bot) limit 1;
    if nxt is null then
      select user_id into nxt from public.room_presence where room_id = r.id order by joined_at limit 1;
    end if;
    update public.rooms set owner_id = nxt, updated_at = now() where id = r.id;
  end if;
end $$;

revoke execute on function public._bot_games, public._max_players, public._can_manage_bots, public._leave from public, anon, authenticated;
revoke execute on function public.add_bot, public.remove_bot from public, anon;
grant execute on function public.add_bot, public.remove_bot to authenticated;
