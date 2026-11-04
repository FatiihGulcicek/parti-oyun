-- Moderasyon: şikayet, engelleme, sohbette kötü söz filtresi, oda sahibine "odadan at".

-- ENGELLEME ---------------------------------------------------------------
create table public.user_blocks (
  blocker uuid not null references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index user_blocks_blocked_idx on public.user_blocks(blocked);
alter table public.user_blocks enable row level security;
create policy "kendi engellerini gör" on public.user_blocks
  for select to authenticated using (blocker = (select auth.uid()));
revoke insert, update, delete on public.user_blocks from anon, authenticated;

-- iki kullanıcı arasında herhangi bir yönde engel var mı
create or replace function public._blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_blocks
                 where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;

create or replace function public.block_user(p_target uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_target is null or p_target = uid then return json_build_object('ok', false, 'error', 'Kendini engelleyemezsin'); end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    return json_build_object('ok', false, 'error', 'Kullanıcı bulunamadı'); end if;
  insert into public.user_blocks (blocker, blocked) values (uid, p_target) on conflict do nothing;
  -- engellenen kişiyle arkadaşlık / bekleyen istekler silinir
  delete from public.friendships where (requester = uid and addressee = p_target) or (requester = p_target and addressee = uid);
  return json_build_object('ok', true);
end $$;

create or replace function public.unblock_user(p_target uuid)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from public.user_blocks where blocker = auth.uid() and blocked = p_target;
  return json_build_object('ok', true);
end $$;

-- engellenenin sohbet mesajları engelleyene hiç gelmez (geçmiş + Realtime, RLS ile)
drop policy if exists "mesajlar okunur" on public.room_messages;
create policy "mesajlar okunur" on public.room_messages for select to authenticated using (
  kind <> 'chat' or user_id is null or not exists (
    select 1 from public.user_blocks b where b.blocker = (select auth.uid()) and b.blocked = room_messages.user_id)
);

-- engel varsa (iki yönde de) arkadaşlık isteği atılamaz
create or replace function public.send_friend_request(p_target uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_target = uid then return json_build_object('ok', false, 'reason', 'self'); end if;
  if public._blocked_between(uid, p_target) then
    return json_build_object('ok', false, 'error', 'Bu kullanıcıya arkadaşlık isteği gönderemezsin'); end if;
  -- karşı taraf zaten istek atmışsa direkt kabul et
  update public.friendships set status = 'accepted'
    where requester = p_target and addressee = uid;
  if found then return json_build_object('ok', true, 'status', 'accepted'); end if;
  insert into public.friendships (requester, addressee) values (uid, p_target)
    on conflict do nothing;
  return json_build_object('ok', true, 'status', 'pending');
end $$;

-- ŞİKAYET -----------------------------------------------------------------
create table public.reports (
  id bigint generated always as identity primary key,
  reporter uuid not null references public.profiles(id) on delete cascade,
  target uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('insult', 'harassment', 'spam', 'inappropriate', 'scam', 'other')),
  details text not null default '' check (char_length(details) <= 300),
  room_id text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  check (reporter <> target)
);
create index reports_target_idx on public.reports(target, created_at desc);
create index reports_reporter_idx on public.reports(reporter, created_at desc);
alter table public.reports enable row level security;
-- istemci şikayetleri okuyamaz/yazamaz; sadece RPC (ve service role / panel)
revoke all on public.reports from anon, authenticated;

create or replace function public.report_user(p_target uuid, p_reason text, p_details text default '', p_room text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_target is null or p_target = uid then return json_build_object('ok', false, 'error', 'Kendini şikayet edemezsin'); end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    return json_build_object('ok', false, 'error', 'Kullanıcı bulunamadı'); end if;
  if p_reason is null or p_reason not in ('insult', 'harassment', 'spam', 'inappropriate', 'scam', 'other') then
    return json_build_object('ok', false, 'error', 'Bir şikayet sebebi seç'); end if;
  if exists (select 1 from public.reports where reporter = uid and target = p_target and created_at > now() - interval '1 hour') then
    return json_build_object('ok', false, 'error', 'Bu kullanıcıyı kısa süre önce şikayet ettin'); end if;
  select count(*) into n from public.reports where reporter = uid and created_at > now() - interval '1 hour';
  if n >= 10 then return json_build_object('ok', false, 'error', 'Çok fazla şikayet gönderdin, biraz bekle'); end if;
  insert into public.reports (reporter, target, reason, details, room_id)
    values (uid, p_target, p_reason, left(btrim(coalesce(p_details, '')), 300),
            case when p_room is not null and exists (select 1 from public.rooms where id = p_room) then p_room end);
  return json_build_object('ok', true);
end $$;

-- KÖTÜ SÖZ FİLTRESİ ---------------------------------------------------------
-- Eşleştirme, Türkçeye göre küçültülmüş bir kopyada yapılır (İ→i, I→ı); bulunan kelimeler
-- orijinal metinde aynı konumda yıldızlanır. Masum kelimeler korunur (ör. şikayet, sikke, götürmek, sıkıntı).
create or replace function public._censor(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  pat constant text := '\m(' || array_to_string(array[
    'amk', 'amq', 'aq', 'am[ıi]na', 'am[ıi]n[ıi]', 'amc[ıi][kğ]\w*',
    's[iı]kt[iı]r\w*', 's[iı]ker[iı]m\w*', 's[iı]key[iı]m\w*', 'sik(?!ayet|ke|ay|l)\w*',
    'or[o0]s[pb]u\w*', 'piç\w*', 'dal?yarr?a[kğ]\w*', 'yarr?a[kğ]\w*',
    'göt(ü|ün|e|ten|veren|lek|lekler|oş)?',
    'pezeven[kg]\w*', 'kahpe\w*', '[sş]erefs[iı]z\w*', '[iı]bne\w*', 'ipne\w*',
    'gavat\w*', 'kaltak\w*', 'fah[iı][sş]e\w*', 'yav[sş]ak\w*', 'pu[sş]t\w*', 'oç'
  ], '|') || ')\M';
  k text;
  outp text := p;
  pos int := 1;
  s int; e int;
begin
  if p is null or p = '' then return p; end if;
  k := lower(translate(p, 'İI', 'iı'));
  if char_length(k) <> char_length(p) then outp := k; end if; -- nadir: küçültme uzunluğu değiştirdi
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

create or replace function public.send_chat(p_room text, p_text text)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t text := btrim(coalesce(p_text, ''));
begin
  if not public._in_room(p_room) then return json_build_object('ok', false, 'error', 'Odada değilsin'); end if;
  if t = '' then return json_build_object('ok', false, 'error', 'Boş mesaj'); end if;
  if exists (select 1 from public.room_messages where room_id = p_room and user_id = uid and kind = 'chat'
             and created_at > now() - interval '700 milliseconds') then
    return json_build_object('ok', false, 'error', 'Çok hızlı'); end if;
  insert into public.room_messages (room_id, user_id, kind, text) values (p_room, uid, 'chat', public._censor(left(t, 200)));
  return json_build_object('ok', true);
end $$;

-- ODADAN AT -----------------------------------------------------------------
create table public.room_bans (
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  until timestamptz not null,
  primary key (room_id, user_id)
);
alter table public.room_bans enable row level security;
revoke all on public.room_bans from anon, authenticated;

create or replace function public.kick_from_room(p_room text, p_user uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); uname text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.rooms where id = p_room and owner_id = uid) then
    return json_build_object('ok', false, 'error', 'Sadece oda sahibi'); end if;
  if p_user is null or p_user = uid then return json_build_object('ok', false, 'error', 'Kendini atamazsın'); end if;
  delete from public.room_bans where until < now();
  insert into public.room_bans (room_id, user_id, until) values (p_room, p_user, now() + interval '10 minutes')
    on conflict (room_id, user_id) do update set until = excluded.until;
  if exists (select 1 from public.room_presence where user_id = p_user and room_id = p_room) then
    delete from public.room_presence where user_id = p_user and room_id = p_room;
    perform public._free_seat(p_room, p_user);
    select username into uname from public.profiles where id = p_user;
    insert into public.room_messages (room_id, kind, text, meta)
      values (p_room, 'system', coalesce(uname, 'Biri') || ' odadan atıldı 🚫', json_build_object('kicked', p_user)::jsonb);
  end if;
  return json_build_object('ok', true);
end $$;

-- atılan kullanıcı süre dolana kadar odaya giremez
create or replace function public.join_room(p_room text)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); cur text; uname text; r public.rooms; ban timestamptz;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
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

-- YETKİLER ------------------------------------------------------------------
revoke execute on function public._blocked_between, public._censor from public, anon, authenticated;
revoke execute on function public.block_user, public.unblock_user, public.report_user, public.kick_from_room,
  public.send_friend_request, public.send_chat, public.join_room from public, anon;
grant execute on function public.block_user, public.unblock_user, public.report_user, public.kick_from_room,
  public.send_friend_request, public.send_chat, public.join_room to authenticated;
