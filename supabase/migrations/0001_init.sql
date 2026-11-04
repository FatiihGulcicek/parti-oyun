-- Parti uygulaması: profil, cüzdan, arkadaşlık, hediye ekonomisi

-- PROFİLLER -------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 20),
  avatar text not null default '😀',
  bio text not null default '' check (char_length(bio) <= 120),
  level int not null default 1,
  charm bigint not null default 0,   -- aldığı hediyelerin değeri
  wealth bigint not null default 0,  -- gönderdiği hediyelerin değeri
  created_at timestamptz not null default now()
);

-- CÜZDAN ----------------------------------------------------------------
create table public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  diamonds bigint not null default 500 check (diamonds >= 0),
  coins bigint not null default 1000 check (coins >= 0),
  last_daily date
);

-- ARKADAŞLIK ------------------------------------------------------------
create table public.friendships (
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index friendships_addressee_idx on public.friendships(addressee);

-- HEDİYELER -------------------------------------------------------------
create table public.gifts (
  id text primary key,
  name text not null,
  icon text not null,
  price int not null check (price > 0),
  tier text not null default 'small' check (tier in ('small','medium','large')),
  sort int not null default 0
);

insert into public.gifts (id, name, icon, price, tier, sort) values
  ('rose','Gül','🌹',1,'small',1),
  ('heart','Kalp','💖',5,'small',2),
  ('cake','Pasta','🎂',20,'small',3),
  ('crown','Taç','👑',99,'medium',4),
  ('car','Spor Araba','🏎️',520,'large',5),
  ('rocket','Roket','🚀',1314,'large',6),
  ('castle','Şato','🏰',5200,'large',7);

create table public.gift_transactions (
  id bigint generated always as identity primary key,
  sender uuid not null references public.profiles(id) on delete cascade,
  receiver uuid not null references public.profiles(id) on delete cascade,
  gift_id text not null references public.gifts(id),
  qty int not null check (qty between 1 and 999),
  total bigint not null,
  room_id text,
  created_at timestamptz not null default now()
);
create index gift_tx_sender_idx on public.gift_transactions(sender);
create index gift_tx_receiver_idx on public.gift_transactions(receiver);

-- YENİ KULLANICI → profil + cüzdan -------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  base text := coalesce(nullif(regexp_replace(new.raw_user_meta_data->>'username','[^a-zA-Z0-9_çğıöşüÇĞİÖŞÜ]','','g'),''),'oyuncu');
  uname text := left(base, 14);
begin
  if exists (select 1 from public.profiles where username = uname) or char_length(uname) < 3 then
    uname := left(base, 10) || '_' || substr(md5(new.id::text), 1, 4);
  end if;
  insert into public.profiles (id, username, avatar)
    values (new.id, uname, coalesce(new.raw_user_meta_data->>'avatar','😀'));
  insert into public.wallets (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS -------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.friendships enable row level security;
alter table public.gifts enable row level security;
alter table public.gift_transactions enable row level security;

create policy "profiller herkese açık" on public.profiles
  for select to authenticated using (true);
create policy "kendi profilini güncelle" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- sadece bu kolonlar istemciden güncellenebilir
revoke update on public.profiles from authenticated, anon;
grant update (username, avatar, bio) on public.profiles to authenticated;

create policy "kendi cüzdanını gör" on public.wallets
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.wallets from authenticated, anon;

create policy "kendi arkadaşlıklarını gör" on public.friendships
  for select to authenticated using ((select auth.uid()) in (requester, addressee));
create policy "arkadaşlığı sil" on public.friendships
  for delete to authenticated using ((select auth.uid()) in (requester, addressee));
revoke insert, update on public.friendships from authenticated, anon;

create policy "hediye kataloğu" on public.gifts
  for select to authenticated using (true);

create policy "kendi hediye geçmişi" on public.gift_transactions
  for select to authenticated using ((select auth.uid()) in (sender, receiver));
revoke insert, update, delete on public.gift_transactions from authenticated, anon;

-- RPC: GÜNLÜK ÖDÜL ------------------------------------------------------
create or replace function public.claim_daily()
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); w public.wallets;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  update public.wallets set diamonds = diamonds + 50, coins = coins + 200, last_daily = current_date
    where user_id = uid and (last_daily is null or last_daily < current_date)
    returning * into w;
  if w is null then return json_build_object('ok', false, 'reason', 'already_claimed'); end if;
  return json_build_object('ok', true, 'diamonds', w.diamonds, 'coins', w.coins);
end $$;

-- RPC: HEDİYE GÖNDER (atomik) -------------------------------------------
create or replace function public.send_gift(p_receiver uuid, p_gift text, p_qty int, p_room text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); g public.gifts; cost bigint; left_d bigint;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_receiver = uid then return json_build_object('ok', false, 'reason', 'self_gift'); end if;
  if p_qty is null or p_qty < 1 or p_qty > 999 then return json_build_object('ok', false, 'reason', 'bad_qty'); end if;
  select * into g from public.gifts where id = p_gift;
  if g is null then return json_build_object('ok', false, 'reason', 'no_gift'); end if;
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

-- RPC: ARKADAŞLIK -------------------------------------------------------
create or replace function public.send_friend_request(p_target uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_target = uid then return json_build_object('ok', false, 'reason', 'self'); end if;
  -- karşı taraf zaten istek atmışsa direkt kabul et
  update public.friendships set status = 'accepted'
    where requester = p_target and addressee = uid;
  if found then return json_build_object('ok', true, 'status', 'accepted'); end if;
  insert into public.friendships (requester, addressee) values (uid, p_target)
    on conflict do nothing;
  return json_build_object('ok', true, 'status', 'pending');
end $$;

create or replace function public.respond_friend_request(p_requester uuid, p_accept boolean)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_accept then
    update public.friendships set status = 'accepted'
      where requester = p_requester and addressee = uid and status = 'pending';
  else
    delete from public.friendships where requester = p_requester and addressee = uid and status = 'pending';
  end if;
  return json_build_object('ok', found);
end $$;

revoke execute on function public.claim_daily, public.send_gift, public.send_friend_request, public.respond_friend_request, public.handle_new_user from public, anon;
grant execute on function public.claim_daily, public.send_gift, public.send_friend_request, public.respond_friend_request to authenticated;

-- 0002
revoke execute on function public.handle_new_user() from authenticated, anon, public;
