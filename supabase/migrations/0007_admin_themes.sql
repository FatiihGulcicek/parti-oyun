-- Yönetim paneli + uygulama ayarları (tema, duyuru, kapalı oyunlar) + hesap yasaklama.
-- Tüm yönetim işlemleri `_is_admin()` kontrolü yapan security definer RPC'lerdir ve `admin_log`'a yazılır.

-- YÖNETİCİLER --------------------------------------------------------------
-- Yönetici: e-postası `admin_emails` içinde ve DOĞRULANMIŞ hesap, ya da profiles.is_admin = true.
create table public.admin_emails (email text primary key check (email = lower(email)));
alter table public.admin_emails enable row level security;
revoke all on public.admin_emails from anon, authenticated;
insert into public.admin_emails (email) values ('fatiihgulcicek@gmail.com') on conflict do nothing;

alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists banned_until timestamptz;
alter table public.profiles add column if not exists ban_reason text;

create or replace function public._is_admin(p uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select p is not null and (
    exists (select 1 from public.profiles where id = p and is_admin)
    or exists (select 1 from auth.users u join public.admin_emails a on a.email = lower(u.email)
               where u.id = p and u.email_confirmed_at is not null)
  );
$$;

create or replace function public._banned(p uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p and banned_until is not null and banned_until > now());
$$;

create table public.admin_log (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target text,
  detail jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_log enable row level security;
revoke all on public.admin_log from anon, authenticated;

create or replace function public._admin_log(p_action text, p_target text, p_detail jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.admin_log (admin_id, action, target, detail) values (auth.uid(), p_action, p_target, p_detail);
$$;

-- AYARLAR ------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy "ayarlar herkese açık" on public.app_settings for select to anon, authenticated using (true);
revoke insert, update, delete on public.app_settings from anon, authenticated;
alter publication supabase_realtime add table public.app_settings;

insert into public.app_settings (key, value) values
  ('theme', '{"mode": "auto", "active": "default", "schedule": {}}'::jsonb),
  ('announcement', '{"text": "", "active": false}'::jsonb),
  ('games', '{"disabled": []}'::jsonb)
on conflict (key) do nothing;

-- KULLANICI: kendi durumum ----------------------------------------------------
create or replace function public.my_status()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('admin', public._is_admin(), 'banned_until', p.banned_until, 'ban_reason', p.ban_reason)
  from public.profiles p where p.id = auth.uid();
$$;

-- YASAKLI HESAP: oda/sohbet/oda açma engeli ------------------------------------
create or replace function public.join_room(p_room text)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); cur text; uname text; r public.rooms; ban timestamptz;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if public._banned(uid) then return json_build_object('ok', false, 'banned', true, 'error', 'Hesabın askıya alındı'); end if;
  perform public._cleanup();
  select * into r from public.rooms where id = p_room;
  if r is null then return json_build_object('ok', false, 'error', 'Oda bulunamadı'); end if;
  select until into ban from public.room_bans where room_id = p_room and user_id = uid and until > now();
  if ban is not null then
    return json_build_object('ok', false, 'kicked', true, 'error',
      'Bu odadan atıldın, ' || greatest(1, ceil(extract(epoch from ban - now()) / 60))::int || ' dk sonra tekrar deneyebilirsin');
  end if;
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

create or replace function public.send_chat(p_room text, p_text text)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t text := btrim(coalesce(p_text, ''));
begin
  if not public._in_room(p_room) then return json_build_object('ok', false, 'error', 'Odada değilsin'); end if;
  if public._banned(uid) then return json_build_object('ok', false, 'error', 'Hesabın askıya alındı'); end if;
  if t = '' then return json_build_object('ok', false, 'error', 'Boş mesaj'); end if;
  if exists (select 1 from public.room_messages where room_id = p_room and user_id = uid and kind = 'chat'
             and created_at > now() - interval '700 milliseconds') then
    return json_build_object('ok', false, 'error', 'Çok hızlı'); end if;
  insert into public.room_messages (room_id, user_id, kind, text) values (p_room, uid, 'chat', public._censor(left(t, 200)));
  return json_build_object('ok', true);
end $$;

create or replace function public.create_room(p_name text, p_game text, p_topic text default '')
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); rid text; n int; g text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if public._banned(uid) then return json_build_object('ok', false, 'error', 'Hesabın askıya alındı'); end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 2 or char_length(p_name) > 30 then
    return json_build_object('ok', false, 'error', 'Oda adı 2-30 karakter olmalı'); end if;
  g := case when p_game in ('chat', 'ludo', 'draw', 'spy', 'tavla', 'okey') then p_game else 'uno' end;
  if exists (select 1 from public.app_settings where key = 'games' and value->'disabled' ? g) then
    return json_build_object('ok', false, 'error', 'Bu oyun şu an kapalı'); end if;
  select count(*) into n from public.rooms where created_by = uid and created_at > now() - interval '1 minute';
  if n >= 3 then return json_build_object('ok', false, 'error', 'Çok hızlı oda açıyorsun, biraz bekle'); end if;
  rid := substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  insert into public.rooms (id, name, topic, game, owner_id, created_by)
    values (rid, p_name, left(coalesce(p_topic, ''), 60), g, uid, uid);
  return json_build_object('ok', true, 'roomId', rid);
end $$;

-- YÖNETİM RPC'LERİ -----------------------------------------------------------
create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return json_build_object(
    'users', (select count(*) from public.profiles),
    'new_today', (select count(*) from public.profiles where created_at > now() - interval '1 day'),
    'online', (select count(*) from public.room_presence where last_seen > now() - interval '60 seconds'),
    'rooms', (select count(*) from public.rooms),
    'playing', (select count(*) from public.game_public where winner is null),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'banned', (select count(*) from public.profiles where banned_until > now()),
    'diamonds', (select coalesce(sum(diamonds), 0) from public.wallets),
    'gifts_today', (select coalesce(sum(total), 0) from public.gift_transactions where created_at > now() - interval '1 day'),
    'by_game', (select coalesce(json_object_agg(game, c), '{}'::json) from (
      select r.game, count(*) c from public.room_presence p join public.rooms r on r.id = p.room_id
      where p.last_seen > now() - interval '60 seconds' group by r.game) x)
  );
end $$;

create or replace function public.admin_users(p_q text default '', p_filter text default 'all')
returns json language plpgsql stable security definer set search_path = '' as $$
declare q text := '%' || replace(replace(coalesce(btrim(p_q), ''), '%', ''), '_', '\_') || '%';
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select json_agg(x) from (
    select p.id, p.username, p.avatar, p.level, p.created_at, p.is_admin, p.banned_until, p.ban_reason,
      w.diamonds, w.coins,
      (select count(*) from public.reports r where r.target = p.id and r.status = 'open') as open_reports,
      (select rp.room_id from public.room_presence rp where rp.user_id = p.id and rp.last_seen > now() - interval '60 seconds') as room
    from public.profiles p left join public.wallets w on w.user_id = p.id
    where p.username ilike q
      and (p_filter <> 'banned' or p.banned_until > now())
      and (p_filter <> 'reported' or exists (select 1 from public.reports r where r.target = p.id and r.status = 'open'))
    order by p.created_at desc limit 50) x), '[]'::json);
end $$;

create or replace function public.admin_grant(p_user uuid, p_diamonds bigint, p_coins bigint)
returns json language plpgsql security definer set search_path = '' as $$
declare w public.wallets;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if abs(coalesce(p_diamonds, 0)) > 1000000 or abs(coalesce(p_coins, 0)) > 10000000 then
    return json_build_object('ok', false, 'error', 'Tutar çok büyük'); end if;
  update public.wallets set diamonds = greatest(0, diamonds + coalesce(p_diamonds, 0)),
                            coins = greatest(0, coins + coalesce(p_coins, 0))
    where user_id = p_user returning * into w;
  if w is null then return json_build_object('ok', false, 'error', 'Kullanıcı bulunamadı'); end if;
  perform public._admin_log('grant', p_user::text, json_build_object('diamonds', p_diamonds, 'coins', p_coins)::jsonb);
  return json_build_object('ok', true, 'diamonds', w.diamonds, 'coins', w.coins);
end $$;

create or replace function public.admin_ban(p_user uuid, p_minutes int, p_reason text default '')
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then return json_build_object('ok', false, 'error', 'Kendini yasaklayamazsın'); end if;
  if public._is_admin(p_user) then return json_build_object('ok', false, 'error', 'Yönetici yasaklanamaz'); end if;
  if coalesce(p_minutes, 0) <= 0 then
    update public.profiles set banned_until = null, ban_reason = null where id = p_user;
    perform public._admin_log('unban', p_user::text, null);
    return json_build_object('ok', true);
  end if;
  update public.profiles set banned_until = now() + make_interval(mins => least(p_minutes, 5256000)),
    ban_reason = left(btrim(coalesce(p_reason, '')), 200) where id = p_user;
  if not found then return json_build_object('ok', false, 'error', 'Kullanıcı bulunamadı'); end if;
  perform public._leave(p_user); -- bulunduğu odadan çıkar
  perform public._admin_log('ban', p_user::text, json_build_object('minutes', p_minutes, 'reason', p_reason)::jsonb);
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_rooms()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select json_agg(x order by x.online desc, x.created_at desc) from (
    select r.id, r.name, r.topic, r.game, r.permanent, r.created_at,
      (select count(*) from public.room_presence p where p.room_id = r.id and p.last_seen > now() - interval '60 seconds') as online,
      exists (select 1 from public.game_public g where g.room_id = r.id and g.winner is null) as playing,
      (select pr.username from public.profiles pr where pr.id = r.owner_id) as owner
    from public.rooms r) x), '[]'::json);
end $$;

create or replace function public.admin_close_room(p_room text)
returns json language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  for u in select user_id from public.room_presence where room_id = p_room loop
    insert into public.room_messages (room_id, kind, text, meta)
      values (p_room, 'system', 'Oda yönetici tarafından kapatıldı', json_build_object('kicked', u)::jsonb);
    perform public._leave(u);
  end loop;
  delete from public.rooms where id = p_room;
  perform public._admin_log('close_room', p_room, null);
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_create_room(p_name text, p_game text, p_topic text default '')
returns json language plpgsql security definer set search_path = '' as $$
declare rid text;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 or char_length(btrim(p_name)) > 30 then
    return json_build_object('ok', false, 'error', 'Oda adı 2-30 karakter olmalı'); end if;
  if p_game not in ('uno', 'chat', 'ludo', 'draw', 'spy', 'tavla', 'okey') then
    return json_build_object('ok', false, 'error', 'Geçersiz oyun'); end if;
  rid := p_game || substr(md5(random()::text), 1, 4);
  insert into public.rooms (id, name, topic, game, permanent) values (rid, btrim(p_name), left(coalesce(p_topic, ''), 60), p_game, true);
  perform public._admin_log('create_room', rid, json_build_object('name', p_name, 'game', p_game)::jsonb);
  return json_build_object('ok', true, 'roomId', rid);
end $$;

create or replace function public.admin_reports(p_status text default 'open')
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select json_agg(x) from (
    select r.id, r.reason, r.details, r.status, r.room_id, r.created_at,
      json_build_object('id', t.id, 'username', t.username, 'avatar', t.avatar, 'banned_until', t.banned_until) as target,
      json_build_object('id', f.id, 'username', f.username, 'avatar', f.avatar) as reporter,
      (select count(*) from public.reports r2 where r2.target = r.target) as total_against
    from public.reports r join public.profiles t on t.id = r.target join public.profiles f on f.id = r.reporter
    where r.status = coalesce(p_status, 'open')
    order by r.created_at desc limit 100) x), '[]'::json);
end $$;

create or replace function public.admin_resolve_report(p_id bigint, p_status text)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if p_status not in ('open', 'reviewed', 'dismissed') then return json_build_object('ok', false, 'error', 'Geçersiz durum'); end if;
  update public.reports set status = p_status where id = p_id;
  perform public._admin_log('report', p_id::text, json_build_object('status', p_status)::jsonb);
  return json_build_object('ok', found);
end $$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if p_key not in ('theme', 'announcement', 'games') then return json_build_object('ok', false, 'error', 'Geçersiz ayar'); end if;
  if pg_column_size(p_value) > 20000 then return json_build_object('ok', false, 'error', 'Ayar çok büyük'); end if;
  insert into public.app_settings (key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public._admin_log('setting', p_key, p_value);
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_log_list()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select json_agg(x) from (
    select l.id, l.action, l.target, l.detail, l.created_at, p.username as admin
    from public.admin_log l left join public.profiles p on p.id = l.admin_id
    order by l.id desc limit 60) x), '[]'::json);
end $$;

-- YETKİLER ------------------------------------------------------------------
revoke execute on function public._is_admin, public._banned, public._admin_log from public, anon, authenticated;
revoke execute on function public.my_status, public.join_room, public.send_chat, public.create_room,
  public.admin_stats, public.admin_users, public.admin_grant, public.admin_ban, public.admin_rooms, public.admin_close_room,
  public.admin_create_room, public.admin_reports, public.admin_resolve_report, public.admin_set_setting, public.admin_log_list
  from public, anon;
grant execute on function public.my_status, public.join_room, public.send_chat, public.create_room,
  public.admin_stats, public.admin_users, public.admin_grant, public.admin_ban, public.admin_rooms, public.admin_close_room,
  public.admin_create_room, public.admin_reports, public.admin_resolve_report, public.admin_set_setting, public.admin_log_list
  to authenticated;
