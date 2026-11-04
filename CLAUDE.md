# Parti — proje notları (Claude için)

WePlay/TopTop tarzı sesli oda + mini oyun uygulaması. Arayüz dili **Türkçe**; kullanıcıya görünen tüm metinler Türkçe olmalı.

## Mimari
- `client/`: React 19 + Vite + TypeScript, Capacitor ile mobil. Canlı adres: https://parti-oyun.vercel.app (Vercel projesi `parti-oyun`, root dizin `client`, build `vite build`; `main` dalına push → otomatik yayın).
- `client/src/net.ts`: TÜM sunucu iletişimi burada. Ekranlar sadece `call('olay', veri)` ve `bus.on/off` kullanır. Yeni özellik eklerken yeni bir `case` ekle, ekranlardan doğrudan Supabase çağırma.
- `supabase/` (proje ref: `qtusjbviruqfwolbsvgx`, Frankfurt):
  - `migrations/`: şema. Yeni değişiklik = yeni numaralı dosya (`0003_...sql`); eskileri düzenleme.
  - `functions/game`: Uno hakemi (`uno.ts` saf motor + `index.ts`). Yeni oyun eklerken aynı kalıbı kullan: saf motor + testler + Edge Function.
  - `functions/ludo`: Ludo (Kızma Birader) hakemi (`ludo.ts` saf motor + `index.ts`); zar sunucuda atılır. Oyun durumu Uno ile aynı `games` / `game_public` tablolarında; her hakem yalnızca kendi `rooms.game` türündeki odaları kabul eder.
  - `functions/draw` (Çiz-Tahmin), `functions/spy` (Casus Kim?), `functions/tavla`, `functions/okey`: aynı kalıp (saf motor + `*.test.ts` + `index.ts`). Gizli bilgi (çizerin kelimesi, casusun kim olduğu, Okey eli) `game_hands`'te; çizim çizgileri DB'ye yazılmaz, oda kanalında Realtime broadcast ile akar (`draw:send`).
  - İstemcide oyun kaydı `client/src/games.ts` (ad, ikon, oyuncu sayısı, hakem fonksiyonu). Uno dışındaki oyunlar `game:state` olayıyla gelir, `game:start` / `game:move` ile oynanır; masa bileşeni `components/GameTable.tsx` üzerinden seçilir.
  - `functions/register`: kullanıcı adı + şifreyle kayıt (e-posta `u<hex>@parti.local`, istemcideki `loginEmail` ile aynı olmalı).
  - Giriş yöntemleri: kullanıcı adı (register fonksiyonu), e-posta + şifre, Google, Apple (Supabase Auth; `net.ts` içinde `oauthLogin`/`emailLogin`/`emailRegister`). Kullanıcı adı seçmeden gelen hesaplarda `profiles.onboarded = false` → istemci `Onboarding` ekranını gösterir, `complete_onboarding` RPC'si tamamlar.
  - Avatarlar: `client/src/components/Avatar.tsx` içindeki SVG karakterler; `profiles.avatar`'da kısa anahtar (`a01`…`a18`) ya da eski emoji saklanır.
  - Yönetim paneli (`client/src/screens/Admin.tsx`): tüm işlemler `admin_*` RPC'leri (0007), her biri `_is_admin()` kontrol eder ve `admin_log`'a yazar. Yönetici = `admin_emails` içindeki DOĞRULANMIŞ e-posta ya da `profiles.is_admin`. Yasaklı hesap: `profiles.banned_until` (join_room / send_chat / create_room reddeder).
  - Ayarlar `app_settings` (theme / announcement / games / maintenance / economy / bots / filter; herkes okur — `filter` hariç, onu yalnızca `admin_get_setting` okur —, Realtime ile anında yayılır, yazma yalnızca `admin_set_setting`). Bakım modu (`maintenance.active`) yönetici dışındakileri `join_room`/`create_room`'da reddeder; istemci `Maintenance` ekranını gösterir. Kapalı oyunlar hakemlerin `start` adımında da reddedilir.
  - Panel tam sürüm (0010): kullanıcı detayı/düzenleme, sohbetten susturma (`profiles.chat_muted_until`, `send_chat` reddeder), yönetici atama (`admin_set_admin`), odadan çıkarma, mesaj arama/silme, oda detayı/düzenleme/oyunu durdurma/sohbet temizleme/koltuk boşaltma, sistem mesajı, hediye kataloğu (`gifts.active`), günlük ödül miktarı, ek küfür listesi. Yönetici işlemlerinin istemciye etkisi sistem mesajının `meta` alanıyla gelir (`kicked`+`by:'admin'`, `cleared`, `deleted`, `deleted_user`, `game_stopped`).
  - Temalar `client/src/themes.ts` (+ `styles.css` içinde `html.theme-<id>` renkleri, `components/ThemeFx.tsx` süsleri). Yeni tema = THEMES'e kayıt + CSS bloğu; tarih mantığı `themes.test.ts` ile test edilir.
  - Botlar (0008/0009): `profiles.is_bot` olan "Robo_" hesapları; yalnızca Uno, Ludo, Tavla, Okey. `add_bot`/`remove_bot` RPC'leri koltuğa oturtur; hakemler botları "odada" sayar, sıra bottaysa süreyi ~1 sn'ye kısaltıp zaman aşımında motorun `botMove`/`autoMove` stratejisini oynar. Odadan son insan çıkınca botlar kalkar (`_leave`). Strateji testleri `supabase/functions/bots.test.ts`.
  - `functions/voice`: LiveKit jetonu (secret'lar: LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET).

## Güvenlik kuralları (bozma)
- İstemci hiçbir tabloya doğrudan yazamaz (profiles'ta yalnızca username/avatar/bio hariç). Yazma işlemleri `security definer` RPC veya Edge Function üzerinden yapılır; her yeni fonksiyonda `revoke ... from public, anon` + `grant ... to authenticated` yap.
- Oyunun gizli durumu `games` tablosunda (sadece service role). Herkese açık kısım `game_public`, eller `game_hands` (RLS: sadece kendi elin).
- Para/elmas yalnızca SQL fonksiyonlarında atomik olarak değişir.

## Komutlar
- `npm test` (kökte): oyun motoru testleri (vitest)
- `cd client && npm run build`: tip kontrolü + derleme
- Şema / fonksiyon yayını: `supabase db push`, `supabase functions deploy <ad>` (veya Supabase MCP araçları)

## Çalışma şekli
- Her değişiklikten sonra `npm test` ve `cd client && npx vite build` çalıştır.
- Sunucu tarafını değiştirdiysen migration dosyasını ve fonksiyon kodunu repoya da işle.
