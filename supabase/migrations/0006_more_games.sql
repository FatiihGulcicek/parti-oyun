-- Yeni oyunlar: Çiz-Tahmin (draw), Casus Kim? (spy), Tavla (tavla), Okey (okey).
-- Durumları Uno/Ludo ile aynı tablolarda: `games` (sadece service role), `game_public`, `game_hands`.

alter table public.rooms drop constraint if exists rooms_game_check;
alter table public.rooms add constraint rooms_game_check
  check (game in ('uno', 'chat', 'ludo', 'draw', 'spy', 'tavla', 'okey'));

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
    values (rid, p_name, left(coalesce(p_topic, ''), 60),
            case when p_game in ('chat', 'ludo', 'draw', 'spy', 'tavla', 'okey') then p_game else 'uno' end, uid, uid);
  return json_build_object('ok', true, 'roomId', rid);
end $$;

revoke execute on function public.create_room from public, anon;
grant execute on function public.create_room to authenticated;

insert into public.rooms (id, name, topic, game, permanent) values
  ('cizim1', '🎨 Çiz-Tahmin Odası', 'Çiz, tahmin et, puanları topla!', 'draw', true),
  ('casus1', '🕵️ Casus Kim? Masası', 'Aranızda bir casus var…', 'spy', true),
  ('tavla1', '⚪ Tavla Kahvesi', 'Bir el tavla atalım mı?', 'tavla', true),
  ('okey1', '🀄 Okey Salonu', '4 kişilik okey masası', 'okey', true)
on conflict (id) do nothing;
