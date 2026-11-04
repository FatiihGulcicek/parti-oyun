-- Gerçek zamanlı odalar: Supabase Realtime + güvenli RPC'ler (Node sunucusunun yerini alır)

create table public.rooms (
  id text primary key,
  name text not null check (char_length(name) between 2 and 30),
  topic text not null default '',
  game text not null check (game in ('uno','chat')),
  owner_id uuid references public.profiles(id) on delete set null,
  permanent boolean not null default false,
  seats uuid[] not null default array_fill(null::uuid, array[9]),
  muted boolean[] not null default array_fill(false, array[9]),
  locked boolean[] not null default array_fill(false, array[9]),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  room_id text not null references public.rooms(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index room_presence_room_idx on public.room_presence(room_id);

create table public.room_messages (
  id bigint generated always as identity primary key,
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('chat','system','gift')),
  text text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index room_messages_room_idx on public.room_messages(room_id, id desc);

-- Uno: gizli durum sadece Edge Function (service role) tarafından okunur
create table public.games (
  room_id text primary key references public.rooms(id) on delete cascade,
  state jsonb not null,
  version int not null default 0,
  deadline timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.game_public (
  room_id text primary key references public.rooms(id) on delete cascade,
  view jsonb not null,
  players uuid[] not null,
  winner uuid,
  deadline timestamptz not null,
  version int not null,
  updated_at timestamptz not null default now()
);
create table public.game_hands (
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hand jsonb not null,
  version int not null,
  primary key (room_id, user_id)
);

insert into public.rooms (id, name, topic, game, permanent) values
  ('uno1', '🎴 Uno Masası', 'Herkese açık Uno, gel otur!', 'uno', true),
  ('kafe', '☕ Sohbet Kafe', 'Tanışma ve muhabbet', 'chat', true);

-- RLS ------------------------------------------------------------------
alter table public.rooms enable row level security;
alter table public.room_presence enable row level security;
alter table public.room_messages enable row level security;
alter table public.games enable row level security;
alter table public.game_public enable row level security;
alter table public.game_hands enable row level security;

create policy "odalar okunur" on public.rooms for select to authenticated using (true);
create policy "varlık okunur" on public.room_presence for select to authenticated using (true);
create policy "mesajlar okunur" on public.room_messages for select to authenticated using (true);
create policy "oyun herkese açık kısım" on public.game_public for select to authenticated using (true);
create policy "sadece kendi elin" on public.game_hands for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.rooms, public.room_presence, public.room_messages, public.games, public.game_public, public.game_hands from anon, authenticated;
revoke select on public.games from anon, authenticated;

alter publication supabase_realtime add table public.rooms, public.room_messages, public.game_public, public.game_hands, public.friendships;

-- İÇ YARDIMCILAR ---------------------------------------------------------
create or replace function public._sys_msg(p_room text, p_text text)
returns void language sql security definer set search_path = '' as $$
  insert into public.room_messages (room_id, kind, text) values (p_room, 'system', p_text);
$$;

create or replace function public._free_seat(p_room text, p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.rooms; i int;
begin
  select * into r from public.rooms where id = p_room for update;
  if r is null or not (p_uid = any(r.seats)) then return; end if;
  for i in 1..9 loop
    if r.seats[i] = p_uid then r.seats[i] := null; r.muted[i] := false; end if;
  end loop;
  update public.rooms set seats = r.seats, muted = r.muted, updated_at = now() where id = p_room;
end $$;

create or replace function public._leave(p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare pr public.room_presence; r public.rooms; uname text; nxt uuid;
begin
  delete from public.room_presence where user_id = p_uid returning * into pr;
  if pr is null then return; end if;
  perform public._free_seat(pr.room_id, p_uid);
  select username into uname from public.profiles where id = p_uid;
  perform public._sys_msg(pr.room_id, coalesce(uname, 'Biri') || ' odadan ayrıldı');
  select * into r from public.rooms where id = pr.room_id;
  if r.owner_id = p_uid and not r.permanent then
    select s into nxt from unnest(r.seats) s where s is not null limit 1;
    if nxt is null then
      select user_id into nxt from public.room_presence where room_id = r.id order by joined_at limit 1;
    end if;
    update public.rooms set owner_id = nxt, updated_at = now() where id = r.id;
  end if;
end $$;

create or replace function public._cleanup()
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  for u in select user_id from public.room_presence where last_seen < now() - interval '60 seconds' loop
    perform public._leave(u);
  end loop;
  delete from public.rooms r where not r.permanent and r.created_at < now() - interval '2 minutes'
    and not exists (select 1 from public.room_presence p where p.room_id = r.id);
  delete from public.room_messages where created_at < now() - interval '1 day';
end $$;

create or replace function public._in_room(p_room text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.room_presence where user_id = auth.uid() and room_id = p_room);
$$;

-- LOBİ / ODA -------------------------------------------------------------
create or replace function public.lobby_rooms()
returns json language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(x order by x.online desc, x.created_at), '[]'::json) from (
    select r.id, r.name, r.topic, r.game, r.created_at,
      (select count(*) from public.room_presence p where p.room_id = r.id and p.last_seen > now() - interval '60 seconds') as online,
      (select count(*) from unnest(r.seats) s where s is not null) as seated,
      exists (select 1 from public.game_public g where g.room_id = r.id and g.winner is null) as playing,
      (select json_build_object('username', pr.username, 'avatar', pr.avatar) from public.profiles pr where pr.id = r.owner_id) as owner
    from public.rooms r
  ) x;
$$;

create or replace function public.create_room(p_name text, p_game text, p_topic text default '')
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); rid text; n int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 2 or char_length(p_name) > 30 then
    return json_build_object('ok', false, 'error', 'Oda adı 2-30 karakter olmalı'); end if;
  select count(*) into n from public.rooms where created_by = uid and created_at > now() - interval '1 minute';
  if n >= 3 then return json_build_object('ok', false, 'error', 'Çok hızlı oda açıyorsun, biraz bekle'); end if;
  rid := substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  insert into public.rooms (id, name, topic, game, owner_id, created_by)
    values (rid, p_name, left(coalesce(p_topic, ''), 60), case when p_game = 'chat' then 'chat' else 'uno' end, uid, uid);
  return json_build_object('ok', true, 'roomId', rid);
end $$;

create or replace function public.join_room(p_room text)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); cur text; uname text; r public.rooms;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public._cleanup();
  select * into r from public.rooms where id = p_room;
  if r is null then return json_build_object('ok', false, 'error', 'Oda bulunamadı'); end if;
  select room_id into cur from public.room_presence where user_id = uid;
  if cur = p_room then
    update public.room_presence set last_seen = now() where user_id = uid;
  else
    if cur is not null then perform public._leave(uid); end if;
    insert into public.room_presence (user_id, room_id) values (uid, p_room);
    select username into uname from public.profiles where id = uid;
    perform public._sys_msg(p_room, uname || ' odaya katıldı 👋');
    if r.owner_id is null and not r.permanent then
      update public.rooms set owner_id = uid, updated_at = now() where id = p_room;
    end if;
  end if;
  return json_build_object('ok', true);
end $$;

create or replace function public.heartbeat(p_room text)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  update public.room_presence set last_seen = now() where user_id = uid and room_id = p_room;
  if not found then return json_build_object('ok', false); end if;
  perform public._cleanup();
  return json_build_object('ok', true);
end $$;

create or replace function public.leave_room(p_room text)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.room_presence where user_id = auth.uid() and room_id = p_room) then
    perform public._leave(auth.uid());
  end if;
  return json_build_object('ok', true);
end $$;

-- KOLTUKLAR --------------------------------------------------------------
create or replace function public.take_seat(p_room text, p_index int)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.rooms; i int := p_index + 1; j int; gp public.game_public;
begin
  if not public._in_room(p_room) then return json_build_object('ok', false, 'error', 'Odada değilsin'); end if;
  if i < 1 or i > 9 then return json_build_object('ok', false, 'error', 'Geçersiz koltuk'); end if;
  select * into r from public.rooms where id = p_room for update;
  if r.seats[i] is not null then return json_build_object('ok', false, 'error', 'Koltuk dolu'); end if;
  if r.locked[i] and r.owner_id is distinct from uid then return json_build_object('ok', false, 'error', 'Koltuk kilitli'); end if;
  select * into gp from public.game_public where room_id = p_room;
  if gp is not null and gp.winner is null and uid = any(gp.players) then
    return json_build_object('ok', false, 'error', 'Oyun sürerken koltuk değiştiremezsin'); end if;
  for j in 1..9 loop
    if r.seats[j] = uid then r.seats[j] := null; r.muted[j] := false; end if;
  end loop;
  r.seats[i] := uid; r.muted[i] := false;
  update public.rooms set seats = r.seats, muted = r.muted, updated_at = now() where id = p_room;
  return json_build_object('ok', true);
end $$;

create or replace function public.leave_seat(p_room text)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public._in_room(p_room) then return json_build_object('ok', false, 'error', 'Odada değilsin'); end if;
  perform public._free_seat(p_room, auth.uid());
  return json_build_object('ok', true);
end $$;

create or replace function public.set_mute(p_room text, p_muted boolean)
returns json language plpgsql security definer set search_path = '' as $$
declare r public.rooms; i int;
begin
  select * into r from public.rooms where id = p_room for update;
  i := array_position(r.seats, auth.uid());
  if i is null then return json_build_object('ok', false, 'error', 'Koltukta değilsin'); end if;
  r.muted[i] := coalesce(p_muted, false);
  update public.rooms set muted = r.muted, updated_at = now() where id = p_room;
  return json_build_object('ok', true);
end $$;

create or replace function public.toggle_lock(p_room text, p_index int)
returns json language plpgsql security definer set search_path = '' as $$
declare r public.rooms; i int := p_index + 1;
begin
  select * into r from public.rooms where id = p_room for update;
  if r.owner_id is distinct from auth.uid() then return json_build_object('ok', false, 'error', 'Sadece oda sahibi'); end if;
  if i < 1 or i > 9 or r.seats[i] is not null then return json_build_object('ok', false, 'error', 'Geçersiz koltuk'); end if;
  r.locked[i] := not r.locked[i];
  update public.rooms set locked = r.locked, updated_at = now() where id = p_room;
  return json_build_object('ok', true);
end $$;

create or replace function public.kick_seat(p_room text, p_user uuid)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.rooms where id = p_room and owner_id = auth.uid()) then
    return json_build_object('ok', false, 'error', 'Sadece oda sahibi'); end if;
  if p_user = auth.uid() then return json_build_object('ok', false, 'error', 'Kendini indiremezsin'); end if;
  perform public._free_seat(p_room, p_user);
  return json_build_object('ok', true);
end $$;

-- SOHBET / HEDİYE --------------------------------------------------------
create or replace function public.send_chat(p_room text, p_text text)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t text := btrim(coalesce(p_text, ''));
begin
  if not public._in_room(p_room) then return json_build_object('ok', false, 'error', 'Odada değilsin'); end if;
  if t = '' then return json_build_object('ok', false, 'error', 'Boş mesaj'); end if;
  if exists (select 1 from public.room_messages where room_id = p_room and user_id = uid and kind = 'chat'
             and created_at > now() - interval '700 milliseconds') then
    return json_build_object('ok', false, 'error', 'Çok hızlı'); end if;
  insert into public.room_messages (room_id, user_id, kind, text) values (p_room, uid, 'chat', left(t, 200));
  return json_build_object('ok', true);
end $$;

create or replace function public.room_gift(p_room text, p_receiver uuid, p_gift text, p_qty int)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); res json; rname text;
begin
  if not public._in_room(p_room) then return json_build_object('ok', false, 'reason', 'not_in_room'); end if;
  if not exists (select 1 from public.room_presence where user_id = p_receiver and room_id = p_room) then
    return json_build_object('ok', false, 'reason', 'no_receiver'); end if;
  res := public.send_gift(p_receiver, p_gift, p_qty, p_room);
  if (res->>'ok')::boolean then
    select username into rname from public.profiles where id = p_receiver;
    insert into public.room_messages (room_id, user_id, kind, text, meta) values (p_room, uid, 'gift',
      rname || ' kişisine ' || p_qty || '× ' || (res->>'icon') || ' ' || (res->>'name') || ' gönderdi',
      json_build_object('to', p_receiver, 'icon', res->>'icon', 'name', res->>'name', 'tier', res->>'tier',
                        'qty', p_qty, 'total', (res->>'total')::bigint)::jsonb);
  end if;
  return res;
end $$;

-- YETKİLER ---------------------------------------------------------------
revoke execute on function public._sys_msg, public._free_seat, public._leave, public._cleanup, public._in_room from public, anon, authenticated;
revoke execute on function public.lobby_rooms, public.create_room, public.join_room, public.heartbeat, public.leave_room,
  public.take_seat, public.leave_seat, public.set_mute, public.toggle_lock, public.kick_seat, public.send_chat, public.room_gift
  from public, anon;
grant execute on function public.lobby_rooms, public.create_room, public.join_room, public.heartbeat, public.leave_room,
  public.take_seat, public.leave_seat, public.set_mute, public.toggle_lock, public.kick_seat, public.send_chat, public.room_gift
  to authenticated;
