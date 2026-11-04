-- Yönetim paneli tamamlama: kullanıcı detayı/düzenleme, susturma, yönetici atama, odadan çıkarma,
-- mesaj denetimi, oda detayı/düzenleme, oyunu durdurma, sohbet temizleme, oda/genel sistem mesajı,
-- hediye kataloğu, bakım modu, ekonomi (günlük ödül), ek küfür listesi, bot anahtarı, filtreli işlem kaydı.
-- Her yönetim RPC'si `_is_admin()` kontrol eder ve `admin_log`'a yazar.

alter table public.profiles add column if not exists chat_muted_until timestamptz;
alter table public.gifts add column if not exists active boolean not null default true;

insert into public.app_settings (key, value) values
  ('maintenance', '{"active": false, "text": ""}'::jsonb),
  ('economy', '{"daily_diamonds": 50, "daily_coins": 200}'::jsonb),
  ('filter', '{"words": []}'::jsonb),
  ('bots', '{"enabled": true}'::jsonb)
on conflict (key) do nothing;

-- ek küfür listesi herkese açık olmasın: yalnızca yönetici RPC'siyle okunur
drop policy if exists "ayarlar herkese açık" on public.app_settings;
create policy "ayarlar herkese açık" on public.app_settings for select to anon, authenticated using (key <> 'filter');

create or replace function public._setting(p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.app_settings where key = p_key
$$;

create or replace function public._maintenance()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((public._setting('maintenance')->>'active')::boolean, false)
$$;

create or replace function public._chat_muted(p uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p and chat_muted_until is not null and chat_muted_until > now())
$$;

-- KÜFÜR FİLTRESİ: sabit liste + panelden eklenen kelimeler -------------------------------
create or replace function public._censor(p text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  extra text;
  pat text;
  k text;
  outp text := p;
  pos int := 1;
  s int; e int;
begin
  if p is null or p = '' then return p; end if;
  select string_agg(regexp_replace(lower(translate(w, 'İI', 'iı')), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\w*', '|')
    into extra
    from jsonb_array_elements_text(coalesce(public._setting('filter')->'words', '[]'::jsonb)) w
    where char_length(btrim(w)) between 2 and 30;
  pat := '\m(' || array_to_string(array[
    'amk', 'amq', 'aq', 'am[ıi]na', 'am[ıi]n[ıi]', 'amc[ıi][kğ]\w*',
    's[iı]kt[iı]r\w*', 's[iı]ker[iı]m\w*', 's[iı]key[iı]m\w*', 'sik(?!ayet|ke|ay|l)\w*',
    'or[o0]s[pb]u\w*', 'piç\w*', 'dal?yarr?a[kğ]\w*', 'yarr?a[kğ]\w*',
    'göt(ü|ün|e|ten|veren|lek|lekler|oş)?',
    'pezeven[kg]\w*', 'kahpe\w*', '[sş]erefs[iı]z\w*', '[iı]bne\w*', 'ipne\w*',
    'gavat\w*', 'kaltak\w*', 'fah[iı][sş]e\w*', 'yav[sş]ak\w*', 'pu[sş]t\w*', 'oç'
  ], '|') || coalesce('|' || extra, '') || ')\M';
  k := lower(translate(p, 'İI', 'iı'));
  if char_length(k) <> char_length(p) then outp := k; end if;
  loop
    s := regexp_instr(k, pat, pos, 1, 0);
    exit when s = 0;
    e := regexp_instr(k, pat, pos, 1, 1);
    exit when e <= s;
    outp := overlay(outp placing repeat('*', e - s) from s for e - s);
    pos := e;
  end loop;
  return outp;
end $$;

-- KULLANICI TARAFI: bakım modu, susturma, ekonomi, kapalı hediye ------------------------
create or replace function public.my_status()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('admin', public._is_admin(), 'banned_until', p.banned_until, 'ban_reason', p.ban_reason,
                           'muted_until', p.chat_muted_until)
  from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.join_room(p_room text)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); cur text; uname text; r public.rooms; ban timestamptz;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if public._banned(uid) then return json_build_object('ok', false, 'banned', true, 'error', 'Hesabın askıya alındı'); end if;
  if public._maintenance() and not public._is_admin(uid) then
    return json_build_object('ok', false, 'banned', true, 'error', 'Uygulama bakımda, birazdan tekrar dene'); end if;
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
declare uid uuid := auth.uid(); t text := btrim(coalesce(p_text, '')); m timestamptz;
begin
  if not public._in_room(p_room) then return json_build_object('ok', false, 'error', 'Odada değilsin'); end if;
  if public._banned(uid) then return json_build_object('ok', false, 'error', 'Hesabın askıya alındı'); end if;
  select chat_muted_until into m from public.profiles where id = uid;
  if m is not null and m > now() then
    return json_build_object('ok', false, 'error',
      'Sohbetten susturuldun (' || greatest(1, ceil(extract(epoch from m - now()) / 60))::int || ' dk)'); end if;
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
  if public._maintenance() and not public._is_admin(uid) then
    return json_build_object('ok', false, 'error', 'Uygulama bakımda'); end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 2 or char_length(p_name) > 30 then
    return json_build_object('ok', false, 'error', 'Oda adı 2-30 karakter olmalı'); end if;
  g := case when p_game in ('chat', 'ludo', 'draw', 'spy', 'tavla', 'okey') then p_game else 'uno' end;
  if coalesce(public._setting('games')->'disabled' ? g, false) then
    return json_build_object('ok', false, 'error', 'Bu oyun şu an kapalı'); end if;
  select count(*) into n from public.rooms where created_by = uid and created_at > now() - interval '1 minute';
  if n >= 3 then return json_build_object('ok', false, 'error', 'Çok hızlı oda açıyorsun, biraz bekle'); end if;
  rid := substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  insert into public.rooms (id, name, topic, game, owner_id, created_by)
    values (rid, p_name, left(coalesce(p_topic, ''), 60), g, uid, uid);
  return json_build_object('ok', true, 'roomId', rid);
end $$;

-- günlük ödül miktarı panelden ayarlanır
create or replace function public.claim_daily()
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); w public.wallets; eco jsonb := coalesce(public._setting('economy'), '{}'::jsonb);
  d bigint := least(greatest(coalesce((eco->>'daily_diamonds')::bigint, 50), 0), 100000);
  c bigint := least(greatest(coalesce((eco->>'daily_coins')::bigint, 200), 0), 1000000);
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  update public.wallets set diamonds = diamonds + d, coins = coins + c, last_daily = current_date
    where user_id = uid and (last_daily is null or last_daily < current_date)
    returning * into w;
  if w is null then return json_build_object('ok', false, 'reason', 'already_claimed'); end if;
  return json_build_object('ok', true, 'diamonds', w.diamonds, 'coins', w.coins, 'got_diamonds', d, 'got_coins', c);
end $$;

-- kapatılan hediye gönderilemez
create or replace function public.send_gift(p_receiver uuid, p_gift text, p_qty int, p_room text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); g public.gifts; cost bigint; left_d bigint;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_receiver = uid then return json_build_object('ok', false, 'reason', 'self_gift'); end if;
  if p_qty is null or p_qty < 1 or p_qty > 999 then return json_build_object('ok', false, 'reason', 'bad_qty'); end if;
  select * into g from public.gifts where id = p_gift;
  if g is null or not g.active then return json_build_object('ok', false, 'reason', 'no_gift'); end if;
  if not exists (select 1 from public.profiles where id = p_receiver) then
    return json_build_object('ok', false, 'reason', 'no_receiver'); end if;
  cost := g.price::bigint * p_qty;
  update public.wallets set diamonds = diamonds - cost
    where user_id = uid and diamonds >= cost returning diamonds into left_d;
  if left_d is null then return json_build_object('ok', false, 'reason', 'insufficient'); end if;
  update public.profiles set wealth = wealth + cost, level = 1 + floor(sqrt((wealth + cost) / 100.0))::int where id = uid;
  update public.profiles set charm = charm + cost where id = p_receiver;
  insert into public.gift_transactions (sender, receiver, gift_id, qty, total, room_id)
    values (uid, p_receiver, p_gift, p_qty, cost, p_room);
  return json_build_object('ok', true, 'diamonds', left_d, 'total', cost, 'icon', g.icon, 'name', g.name, 'tier', g.tier);
end $$;

-- botlar panelden kapatılabilir
create or replace function public.add_bot(p_room text)
returns json language plpgsql security definer set search_path = '' as $$
declare r public.rooms; bot uuid; bname text; i int; seated int; target int;
begin
  if not public._in_room(p_room) then return json_build_object('ok', false, 'error', 'Odada değilsin'); end if;
  if not coalesce((public._setting('bots')->>'enabled')::boolean, true) then
    return json_build_object('ok', false, 'error', 'Botlar şu an kapalı'); end if;
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

-- YÖNETİM: ÖZET -------------------------------------------------------------------------
create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return json_build_object(
    'users', (select count(*) from public.profiles where not is_bot),
    'bots', (select count(*) from public.profiles where is_bot),
    'new_today', (select count(*) from public.profiles where not is_bot and created_at > now() - interval '1 day'),
    'online', (select count(*) from public.room_presence where last_seen > now() - interval '60 seconds'),
    'rooms', (select count(*) from public.rooms),
    'active_rooms', (select count(distinct room_id) from public.room_presence where last_seen > now() - interval '60 seconds'),
    'playing', (select count(*) from public.game_public where winner is null),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'banned', (select count(*) from public.profiles where banned_until > now()),
    'muted', (select count(*) from public.profiles where chat_muted_until > now()),
    'diamonds', (select coalesce(sum(w.diamonds), 0) from public.wallets w join public.profiles p on p.id = w.user_id where not p.is_bot),
    'coins', (select coalesce(sum(w.coins), 0) from public.wallets w join public.profiles p on p.id = w.user_id where not p.is_bot),
    'gifts_today', (select coalesce(sum(total), 0) from public.gift_transactions where created_at > now() - interval '1 day'),
    'messages_today', (select count(*) from public.room_messages where kind = 'chat' and created_at > now() - interval '1 day'),
    'maintenance', public._maintenance(),
    'by_game', (select coalesce(json_object_agg(game, c), '{}'::json) from (
      select r.game, count(*) c from public.room_presence p join public.rooms r on r.id = p.room_id
      where p.last_seen > now() - interval '60 seconds' group by r.game) x),
    'signups', (select json_agg(json_build_object('day', d::date, 'count',
        (select count(*) from public.profiles p where not p.is_bot and p.created_at >= d and p.created_at < d + interval '1 day')) order by d)
      from generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') d),
    'gifts_week', (select json_agg(json_build_object('day', d::date, 'total',
        (select coalesce(sum(t.total), 0) from public.gift_transactions t where t.created_at >= d and t.created_at < d + interval '1 day')) order by d)
      from generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') d)
  );
end $$;

-- YÖNETİM: KULLANICILAR -------------------------------------------------------------------
drop function if exists public.admin_users(text, text);
create or replace function public.admin_users(p_q text default '', p_filter text default 'all', p_offset int default 0)
returns json language plpgsql stable security definer set search_path = '' as $$
declare q text := '%' || replace(replace(coalesce(btrim(p_q), ''), '%', ''), '_', '\_') || '%';
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select json_agg(x) from (
    select p.id, p.username, p.avatar, p.level, p.created_at, p.is_bot, p.banned_until, p.ban_reason, p.chat_muted_until,
      public._is_admin(p.id) as is_admin, w.diamonds, w.coins,
      (select count(*) from public.reports r where r.target = p.id and r.status = 'open') as open_reports,
      (select rp.room_id from public.room_presence rp where rp.user_id = p.id and rp.last_seen > now() - interval '60 seconds') as room
    from public.profiles p left join public.wallets w on w.user_id = p.id left join auth.users u on u.id = p.id
    where (p.username ilike q or coalesce(u.email, '') ilike q or p.id::text = btrim(coalesce(p_q, '')))
      and case coalesce(p_filter, 'all')
        when 'banned' then p.banned_until > now()
        when 'muted' then p.chat_muted_until > now()
        when 'reported' then exists (select 1 from public.reports r where r.target = p.id and r.status = 'open')
        when 'admins' then public._is_admin(p.id)
        when 'bots' then p.is_bot
        when 'online' then exists (select 1 from public.room_presence rp where rp.user_id = p.id and rp.last_seen > now() - interval '60 seconds')
        when 'rich' then true
        else not p.is_bot end
    order by case when p_filter = 'rich' then w.diamonds end desc nulls last, p.created_at desc
    limit 50 offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::json);
end $$;

create or replace function public.admin_user_detail(p_user uuid)
returns json language plpgsql stable security definer set search_path = '' as $$
declare res json;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  select json_build_object(
    'profile', (select row_to_json(x) from (select p.id, p.username, p.avatar, p.bio, p.level, p.charm, p.wealth, p.created_at,
                  p.is_bot, p.banned_until, p.ban_reason, p.chat_muted_until, p.onboarded, p.is_admin as admin_flag) x),
    'admin', public._is_admin(p.id),
    'main_admin', exists (select 1 from public.admin_emails a where a.email = lower(u.email) and u.email_confirmed_at is not null),
    'email', case when p.is_bot then null else u.email end,
    'provider', u.raw_app_meta_data->>'provider',
    'confirmed', u.email_confirmed_at is not null,
    'last_sign_in', u.last_sign_in_at,
    'wallet', (select row_to_json(x) from (select w.diamonds, w.coins, w.last_daily from public.wallets w where w.user_id = p.id) x),
    'room', (select json_build_object('id', r.id, 'name', r.name, 'game', r.game) from public.room_presence rp
             join public.rooms r on r.id = rp.room_id where rp.user_id = p.id and rp.last_seen > now() - interval '60 seconds'),
    'friends', (select count(*) from public.friendships f where f.status = 'accepted' and p.id in (f.requester, f.addressee)),
    'blocked_by', (select count(*) from public.user_blocks b where b.blocked = p.id),
    'reports_filed', (select count(*) from public.reports r where r.reporter = p.id),
    'reports', coalesce((select json_agg(x) from (
        select r.id, r.reason, r.details, r.status, r.room_id, r.created_at, f.username as reporter
        from public.reports r join public.profiles f on f.id = r.reporter where r.target = p.id
        order by r.created_at desc limit 10) x), '[]'::json),
    'messages', coalesce((select json_agg(x) from (
        select m.id, m.room_id, m.text, m.created_at from public.room_messages m
        where m.user_id = p.id and m.kind = 'chat' order by m.id desc limit 20) x), '[]'::json),
    'gifts_sent', (select coalesce(sum(total), 0) from public.gift_transactions t where t.sender = p.id),
    'gifts_received', (select coalesce(sum(total), 0) from public.gift_transactions t where t.receiver = p.id),
    'gifts', coalesce((select json_agg(x) from (
        select t.id, t.qty, t.total, t.created_at, g.icon, g.name,
          case when t.sender = p.id then 'out' else 'in' end as dir,
          (select o.username from public.profiles o where o.id = case when t.sender = p.id then t.receiver else t.sender end) as other
        from public.gift_transactions t join public.gifts g on g.id = t.gift_id
        where p.id in (t.sender, t.receiver) order by t.id desc limit 10) x), '[]'::json),
    'history', coalesce((select json_agg(x) from (
        select l.action, l.detail, l.created_at, a.username as admin from public.admin_log l
        left join public.profiles a on a.id = l.admin_id where l.target = p.id::text order by l.id desc limit 10) x), '[]'::json)
  ) into res
  from public.profiles p left join auth.users u on u.id = p.id where p.id = p_user;
  if res is null then return json_build_object('ok', false, 'error', 'Kullanıcı bulunamadı'); end if;
  return res;
end $$;

create or replace function public.admin_update_user(p_user uuid, p_username text default null, p_bio text default null,
                                                    p_avatar text default null, p_level int default null)
returns json language plpgsql security definer set search_path = '' as $$
declare u text := btrim(p_username); a text := btrim(p_avatar); ch jsonb := '{}'::jsonb;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then return json_build_object('ok', false, 'error', 'Kullanıcı bulunamadı'); end if;
  if u is not null then
    if char_length(u) < 3 or char_length(u) > 20 or u !~ '^[[:alnum:]_]+$' then
      return json_build_object('ok', false, 'error', 'Kullanıcı adı 3-20 harf/rakam olmalı (boşluk yok)'); end if;
    if exists (select 1 from public.profiles where username = u and id <> p_user) then
      return json_build_object('ok', false, 'error', 'Bu kullanıcı adı alınmış'); end if;
    update public.profiles set username = u where id = p_user; ch := ch || jsonb_build_object('username', u);
  end if;
  if p_bio is not null then
    update public.profiles set bio = left(btrim(p_bio), 120) where id = p_user; ch := ch || jsonb_build_object('bio', left(btrim(p_bio), 120));
  end if;
  if a is not null then
    if a = '' or char_length(a) > 4 then return json_build_object('ok', false, 'error', 'Geçersiz karakter'); end if;
    update public.profiles set avatar = a where id = p_user; ch := ch || jsonb_build_object('avatar', a);
  end if;
  if p_level is not null then
    if p_level < 1 or p_level > 999 then return json_build_object('ok', false, 'error', 'Seviye 1-999 olmalı'); end if;
    update public.profiles set level = p_level where id = p_user; ch := ch || jsonb_build_object('level', p_level);
  end if;
  if ch = '{}'::jsonb then return json_build_object('ok', false, 'error', 'Değişiklik yok'); end if;
  perform public._admin_log('edit_user', p_user::text, ch);
  return json_build_object('ok', true);
exception when unique_violation then
  return json_build_object('ok', false, 'error', 'Bu kullanıcı adı alınmış');
end $$;

create or replace function public.admin_mute(p_user uuid, p_minutes int)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then return json_build_object('ok', false, 'error', 'Kendini susturamazsın'); end if;
  if coalesce(p_minutes, 0) <= 0 then
    update public.profiles set chat_muted_until = null where id = p_user;
    perform public._admin_log('unmute', p_user::text, null);
    return json_build_object('ok', found);
  end if;
  if public._is_admin(p_user) then return json_build_object('ok', false, 'error', 'Yönetici susturulamaz'); end if;
  update public.profiles set chat_muted_until = now() + make_interval(mins => least(p_minutes, 5256000)) where id = p_user;
  if not found then return json_build_object('ok', false, 'error', 'Kullanıcı bulunamadı'); end if;
  perform public._admin_log('mute', p_user::text, jsonb_build_object('minutes', p_minutes));
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_set_admin(p_user uuid, p_on boolean)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then return json_build_object('ok', false, 'error', 'Kendi yetkini değiştiremezsin'); end if;
  if exists (select 1 from public.profiles where id = p_user and is_bot) then
    return json_build_object('ok', false, 'error', 'Bot yönetici olamaz'); end if;
  update public.profiles set is_admin = coalesce(p_on, false) where id = p_user;
  if not found then return json_build_object('ok', false, 'error', 'Kullanıcı bulunamadı'); end if;
  if not p_on and public._is_admin(p_user) then
    return json_build_object('ok', false, 'error', 'Bu hesap e-postayla tanımlı ana yönetici, panelden kaldırılamaz'); end if;
  if p_on then update public.profiles set banned_until = null, ban_reason = null, chat_muted_until = null where id = p_user; end if;
  perform public._admin_log(case when p_on then 'admin_add' else 'admin_remove' end, p_user::text, null);
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_list_admins()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select json_agg(x order by x.main desc, x.username) from (
    select p.id, p.username, p.avatar,
      exists (select 1 from public.admin_emails a where a.email = lower(u.email) and u.email_confirmed_at is not null) as main
    from public.profiles p left join auth.users u on u.id = p.id
    where p.is_admin or exists (select 1 from public.admin_emails a where a.email = lower(u.email) and u.email_confirmed_at is not null)) x), '[]'::json);
end $$;

-- kullanıcıyı bulunduğu odadan çıkarır (yeniden girebilir; kalıcı engel için yasakla)
create or replace function public.admin_kick(p_user uuid, p_minutes int default 0)
returns json language plpgsql security definer set search_path = '' as $$
declare rid text;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  select room_id into rid from public.room_presence where user_id = p_user;
  if rid is null then return json_build_object('ok', false, 'error', 'Kullanıcı şu an bir odada değil'); end if;
  if coalesce(p_minutes, 0) > 0 then
    insert into public.room_bans (room_id, user_id, until) values (rid, p_user, now() + make_interval(mins => least(p_minutes, 10080)))
      on conflict (room_id, user_id) do update set until = excluded.until;
  end if;
  insert into public.room_messages (room_id, kind, text, meta)
    values (rid, 'system', 'Bir kullanıcı yönetici tarafından odadan çıkarıldı', jsonb_build_object('kicked', p_user, 'by', 'admin'));
  perform public._leave(p_user);
  perform public._admin_log('kick', p_user::text, jsonb_build_object('room', rid, 'minutes', p_minutes));
  return json_build_object('ok', true);
end $$;

-- YÖNETİM: MESAJLAR -----------------------------------------------------------------------
create or replace function public.admin_messages(p_q text default '', p_room text default null, p_user uuid default null, p_before bigint default null)
returns json language plpgsql stable security definer set search_path = '' as $$
declare q text := '%' || replace(replace(coalesce(btrim(p_q), ''), '%', ''), '_', '\_') || '%';
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select json_agg(x) from (
    select m.id, m.room_id, m.text, m.created_at, r.name as room_name,
      json_build_object('id', p.id, 'username', p.username, 'avatar', p.avatar) as author
    from public.room_messages m join public.profiles p on p.id = m.user_id left join public.rooms r on r.id = m.room_id
    where m.kind = 'chat' and m.text ilike q
      and (p_room is null or p_room = '' or m.room_id = p_room)
      and (p_user is null or m.user_id = p_user)
      and (p_before is null or m.id < p_before)
    order by m.id desc limit 60) x), '[]'::json);
end $$;

create or replace function public.admin_delete_message(p_id bigint)
returns json language plpgsql security definer set search_path = '' as $$
declare m public.room_messages;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  delete from public.room_messages where id = p_id returning * into m;
  if m is null then return json_build_object('ok', false, 'error', 'Mesaj bulunamadı'); end if;
  insert into public.room_messages (room_id, kind, text, meta)
    values (m.room_id, 'system', 'Bir mesaj yönetici tarafından silindi', jsonb_build_object('deleted', m.id));
  perform public._admin_log('delete_message', m.user_id::text, jsonb_build_object('room', m.room_id, 'text', m.text));
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_delete_user_messages(p_user uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare n int; rid text;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  with d as (delete from public.room_messages where user_id = p_user and kind = 'chat' returning id, room_id)
  select count(*) into n from d;
  for rid in select room_id from public.room_presence group by room_id loop
    insert into public.room_messages (room_id, kind, text, meta) values (rid, 'system', '🧹 Bazı mesajlar yönetici tarafından silindi',
      jsonb_build_object('deleted_user', p_user));
  end loop;
  perform public._admin_log('delete_messages', p_user::text, jsonb_build_object('count', n));
  return json_build_object('ok', true, 'count', n);
end $$;

-- YÖNETİM: ODALAR -------------------------------------------------------------------------
create or replace function public.admin_room_detail(p_room text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare r public.rooms;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  select * into r from public.rooms where id = p_room;
  if r is null then return json_build_object('ok', false, 'error', 'Oda bulunamadı'); end if;
  return json_build_object(
    'room', json_build_object('id', r.id, 'name', r.name, 'topic', r.topic, 'game', r.game, 'permanent', r.permanent,
                              'created_at', r.created_at, 'owner_id', r.owner_id,
                              'owner', (select username from public.profiles where id = r.owner_id)),
    'seats', (select json_agg(json_build_object('seat', i, 'locked', r.locked[i], 'user',
                case when r.seats[i] is null then null else
                  (select json_build_object('id', p.id, 'username', p.username, 'avatar', p.avatar, 'is_bot', p.is_bot)
                   from public.profiles p where p.id = r.seats[i]) end) order by i)
              from generate_series(1, 9) i),
    'people', coalesce((select json_agg(json_build_object('id', p.id, 'username', p.username, 'avatar', p.avatar,
                'online', rp.last_seen > now() - interval '60 seconds', 'joined_at', rp.joined_at) order by rp.joined_at)
              from public.room_presence rp join public.profiles p on p.id = rp.user_id where rp.room_id = r.id), '[]'::json),
    'game', (select json_build_object('running', g.winner is null, 'players', g.players, 'updated_at', g.updated_at,
               'winner', (select username from public.profiles where id = g.winner))
             from public.game_public g where g.room_id = r.id),
    'bans', coalesce((select json_agg(json_build_object('id', p.id, 'username', p.username, 'until', b.until))
              from public.room_bans b join public.profiles p on p.id = b.user_id where b.room_id = r.id and b.until > now()), '[]'::json),
    'messages', coalesce((select json_agg(x order by x.id) from (
        select m.id, m.kind, m.text, m.created_at, p.username from public.room_messages m
        left join public.profiles p on p.id = m.user_id where m.room_id = r.id order by m.id desc limit 30) x), '[]'::json)
  );
end $$;

create or replace function public.admin_update_room(p_room text, p_name text, p_topic text, p_game text, p_permanent boolean)
returns json language plpgsql security definer set search_path = '' as $$
declare r public.rooms; n text := btrim(coalesce(p_name, ''));
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  select * into r from public.rooms where id = p_room for update;
  if r is null then return json_build_object('ok', false, 'error', 'Oda bulunamadı'); end if;
  if char_length(n) < 2 or char_length(n) > 30 then return json_build_object('ok', false, 'error', 'Oda adı 2-30 karakter olmalı'); end if;
  if p_game not in ('uno', 'chat', 'ludo', 'draw', 'spy', 'tavla', 'okey') then return json_build_object('ok', false, 'error', 'Geçersiz oyun'); end if;
  if p_game <> r.game then
    if exists (select 1 from public.game_public g where g.room_id = p_room and g.winner is null) then
      return json_build_object('ok', false, 'error', 'Oyun sürerken oyun türü değiştirilemez'); end if;
    delete from public.games where room_id = p_room;
    delete from public.game_public where room_id = p_room;
    delete from public.game_hands where room_id = p_room;
  end if;
  update public.rooms set name = n, topic = left(btrim(coalesce(p_topic, '')), 60), game = p_game,
    permanent = coalesce(p_permanent, r.permanent), updated_at = now() where id = p_room;
  perform public._sys_msg(p_room, '🛠️ Oda bilgileri yönetici tarafından güncellendi');
  perform public._admin_log('edit_room', p_room, jsonb_build_object('name', n, 'topic', p_topic, 'game', p_game, 'permanent', p_permanent));
  return json_build_object('ok', true);
end $$;

-- sistem mesajı: tek odaya ya da (p_room boşsa) içinde kimse olan tüm odalara
create or replace function public.admin_room_message(p_room text, p_text text)
returns json language plpgsql security definer set search_path = '' as $$
declare t text := left(btrim(coalesce(p_text, '')), 200); n int := 0; rid text;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if t = '' then return json_build_object('ok', false, 'error', 'Mesaj boş'); end if;
  for rid in select r.id from public.rooms r where (coalesce(p_room, '') <> '' and r.id = p_room)
      or (coalesce(p_room, '') = '' and exists (select 1 from public.room_presence p where p.room_id = r.id)) loop
    insert into public.room_messages (room_id, kind, text, meta) values (rid, 'system', '📢 ' || t, jsonb_build_object('admin', true));
    n := n + 1;
  end loop;
  if n = 0 then return json_build_object('ok', false, 'error', 'Mesaj gidecek oda yok'); end if;
  perform public._admin_log('broadcast', coalesce(nullif(p_room, ''), '*'), jsonb_build_object('text', t, 'rooms', n));
  return json_build_object('ok', true, 'rooms', n);
end $$;

create or replace function public.admin_clear_chat(p_room text)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  delete from public.room_messages where room_id = p_room;
  insert into public.room_messages (room_id, kind, text, meta)
    values (p_room, 'system', '🧹 Sohbet yönetici tarafından temizlendi', jsonb_build_object('cleared', true));
  perform public._admin_log('clear_chat', p_room, null);
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_stop_game(p_room text)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.game_public where room_id = p_room) and not exists (select 1 from public.games where room_id = p_room) then
    return json_build_object('ok', false, 'error', 'Bu odada oyun yok'); end if;
  delete from public.games where room_id = p_room;
  delete from public.game_public where room_id = p_room;
  delete from public.game_hands where room_id = p_room;
  insert into public.room_messages (room_id, kind, text, meta)
    values (p_room, 'system', '⛔ Oyun yönetici tarafından durduruldu', jsonb_build_object('game_stopped', true));
  perform public._admin_log('stop_game', p_room, null);
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_free_seat(p_room text, p_seat int)
returns json language plpgsql security definer set search_path = '' as $$
declare r public.rooms; who uuid;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if p_seat is null or p_seat < 1 or p_seat > 9 then return json_build_object('ok', false, 'error', 'Geçersiz koltuk'); end if;
  select * into r from public.rooms where id = p_room for update;
  if r is null then return json_build_object('ok', false, 'error', 'Oda bulunamadı'); end if;
  who := r.seats[p_seat];
  if who is null then return json_build_object('ok', false, 'error', 'Koltuk zaten boş'); end if;
  r.seats[p_seat] := null; r.muted[p_seat] := false;
  update public.rooms set seats = r.seats, muted = r.muted, updated_at = now() where id = p_room;
  perform public._sys_msg(p_room, '💺 ' || coalesce((select username from public.profiles where id = who), 'Biri') || ' yönetici tarafından koltuktan kaldırıldı');
  perform public._admin_log('free_seat', p_room, jsonb_build_object('seat', p_seat, 'user', who));
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_unban_room(p_room text, p_user uuid)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  delete from public.room_bans where room_id = p_room and user_id = p_user;
  perform public._admin_log('room_unban', p_room, jsonb_build_object('user', p_user));
  return json_build_object('ok', found);
end $$;

-- YÖNETİM: HEDİYELER ----------------------------------------------------------------------
create or replace function public.admin_gifts()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select json_agg(x order by x.sort, x.price) from (
    select g.id, g.name, g.icon, g.price, g.tier, g.sort, g.active,
      (select coalesce(sum(t.qty), 0) from public.gift_transactions t where t.gift_id = g.id) as sold,
      (select coalesce(sum(t.total), 0) from public.gift_transactions t where t.gift_id = g.id) as revenue
    from public.gifts g) x), '[]'::json);
end $$;

create or replace function public.admin_save_gift(p_id text, p_name text, p_icon text, p_price int, p_tier text, p_sort int, p_active boolean)
returns json language plpgsql security definer set search_path = '' as $$
declare i text := lower(btrim(coalesce(p_id, ''))); n text := btrim(coalesce(p_name, '')); ic text := btrim(coalesce(p_icon, ''));
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if i !~ '^[a-z0-9_]{2,20}$' then return json_build_object('ok', false, 'error', 'Kimlik 2-20 küçük harf/rakam olmalı'); end if;
  if char_length(n) < 1 or char_length(n) > 20 then return json_build_object('ok', false, 'error', 'Ad 1-20 karakter olmalı'); end if;
  if char_length(ic) < 1 or char_length(ic) > 8 then return json_build_object('ok', false, 'error', 'Bir emoji gir'); end if;
  if p_price is null or p_price < 1 or p_price > 1000000 then return json_build_object('ok', false, 'error', 'Fiyat 1-1.000.000 olmalı'); end if;
  if p_tier not in ('small', 'medium', 'large') then return json_build_object('ok', false, 'error', 'Geçersiz boyut'); end if;
  insert into public.gifts (id, name, icon, price, tier, sort, active)
    values (i, n, ic, p_price, p_tier, coalesce(p_sort, 0), coalesce(p_active, true))
    on conflict (id) do update set name = excluded.name, icon = excluded.icon, price = excluded.price,
      tier = excluded.tier, sort = excluded.sort, active = excluded.active;
  perform public._admin_log('gift', i, jsonb_build_object('name', n, 'icon', ic, 'price', p_price, 'tier', p_tier, 'active', p_active));
  return json_build_object('ok', true);
end $$;

-- YÖNETİM: AYARLAR ------------------------------------------------------------------------
create or replace function public.admin_get_setting(p_key text)
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return coalesce(public._setting(p_key), 'null'::jsonb)::json;
end $$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if p_key not in ('theme', 'announcement', 'games', 'maintenance', 'economy', 'filter', 'bots') then
    return json_build_object('ok', false, 'error', 'Geçersiz ayar'); end if;
  if pg_column_size(p_value) > 20000 then return json_build_object('ok', false, 'error', 'Ayar çok büyük'); end if;
  if p_key = 'filter' and jsonb_typeof(p_value->'words') is distinct from 'array' then
    return json_build_object('ok', false, 'error', 'Kelime listesi geçersiz'); end if;
  insert into public.app_settings (key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public._admin_log('setting', p_key, case when p_key = 'filter' then jsonb_build_object('words', jsonb_array_length(p_value->'words')) else p_value end);
  return json_build_object('ok', true);
end $$;

-- YÖNETİM: İŞLEM KAYDI (filtre + sayfalama) ------------------------------------------------
drop function if exists public.admin_log_list();
create or replace function public.admin_log_list(p_action text default null, p_before bigint default null)
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select json_agg(x) from (
    select l.id, l.action, l.target, l.detail, l.created_at, p.username as admin,
      case when l.target ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then (select t.username from public.profiles t where t.id = l.target::uuid) end as target_name
    from public.admin_log l left join public.profiles p on p.id = l.admin_id
    where (p_action is null or p_action = '' or l.action = p_action)
      and (p_before is null or l.id < p_before)
    order by l.id desc limit 50) x), '[]'::json);
end $$;

-- YETKİLER --------------------------------------------------------------------------------
revoke execute on function public._setting, public._maintenance, public._chat_muted, public._censor from public, anon, authenticated;
revoke execute on function public.my_status, public.join_room, public.send_chat, public.create_room, public.claim_daily,
  public.send_gift, public.add_bot,
  public.admin_stats, public.admin_users, public.admin_user_detail, public.admin_update_user, public.admin_mute,
  public.admin_set_admin, public.admin_list_admins, public.admin_kick, public.admin_messages, public.admin_delete_message,
  public.admin_delete_user_messages, public.admin_room_detail, public.admin_update_room, public.admin_room_message,
  public.admin_clear_chat, public.admin_stop_game, public.admin_free_seat, public.admin_unban_room, public.admin_gifts,
  public.admin_save_gift, public.admin_get_setting, public.admin_set_setting, public.admin_log_list
  from public, anon;
grant execute on function public.my_status, public.join_room, public.send_chat, public.create_room, public.claim_daily,
  public.send_gift, public.add_bot,
  public.admin_stats, public.admin_users, public.admin_user_detail, public.admin_update_user, public.admin_mute,
  public.admin_set_admin, public.admin_list_admins, public.admin_kick, public.admin_messages, public.admin_delete_message,
  public.admin_delete_user_messages, public.admin_room_detail, public.admin_update_room, public.admin_room_message,
  public.admin_clear_chat, public.admin_stop_game, public.admin_free_seat, public.admin_unban_room, public.admin_gifts,
  public.admin_save_gift, public.admin_get_setting, public.admin_set_setting, public.admin_log_list
  to authenticated;
