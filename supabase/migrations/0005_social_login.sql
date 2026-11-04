-- Google / Apple / e-posta ile giriş: bu yollarla gelen hesaplar kullanıcı adı ve karakter seçene kadar
-- "onboarded = false" kalır; istemci önce profil tamamlama ekranını gösterir.

alter table public.profiles add column if not exists onboarded boolean not null default true;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  chosen text := nullif(btrim(meta->>'username'), '');
  src text := coalesce(chosen, nullif(meta->>'full_name', ''), nullif(meta->>'name', ''), split_part(coalesce(new.email, ''), '@', 1));
  base text := coalesce(nullif(regexp_replace(coalesce(src, ''), '[^a-zA-Z0-9_çğıöşüÇĞİÖŞÜ]', '', 'g'), ''), 'oyuncu');
  uname text := left(base, 14);
  av text := nullif(meta->>'avatar', '');
begin
  if char_length(uname) < 3 or exists (select 1 from public.profiles where username = uname) then
    uname := left(base, 10) || '_' || substr(md5(new.id::text), 1, 4);
  end if;
  while exists (select 1 from public.profiles where username = uname) loop
    uname := left(base, 10) || '_' || substr(md5(random()::text), 1, 4);
  end loop;
  -- avatar: kısa anahtar (a01..a18) ya da eski emoji; yoksa rastgele karakter
  if av is null or char_length(av) > 4 then
    av := 'a' || lpad((1 + floor(random() * 18))::int::text, 2, '0');
  end if;
  insert into public.profiles (id, username, avatar, onboarded)
    values (new.id, uname, av, chosen is not null);
  insert into public.wallets (user_id) values (new.id);
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- profil tamamlama: kullanıcı adı + karakter seçimi
create or replace function public.complete_onboarding(p_username text, p_avatar text)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); u text := btrim(coalesce(p_username, '')); a text := btrim(coalesce(p_avatar, ''));
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if char_length(u) < 3 or char_length(u) > 20 or u !~ '^[[:alnum:]_]+$' then
    return json_build_object('ok', false, 'error', 'Kullanıcı adı 3-20 harf/rakam olmalı (boşluk yok)'); end if;
  if a = '' or char_length(a) > 4 then return json_build_object('ok', false, 'error', 'Bir karakter seç'); end if;
  if exists (select 1 from public.profiles where username = u and id <> uid) then
    return json_build_object('ok', false, 'error', 'Bu kullanıcı adı alınmış'); end if;
  update public.profiles set username = u, avatar = a, onboarded = true where id = uid;
  return json_build_object('ok', true);
exception when unique_violation then
  return json_build_object('ok', false, 'error', 'Bu kullanıcı adı alınmış');
end $$;
revoke execute on function public.complete_onboarding from public, anon;
grant execute on function public.complete_onboarding to authenticated;
