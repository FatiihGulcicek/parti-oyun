# 🎉 Parti — Sesli oda + mini oyun platformu (MVP)

WePlay / TopTop tarzı bir sosyal parti uygulamasının çalışan ilk sürümü:
sesli odalar, oda içinde gerçek zamanlı **Uno**, hediye ve sanal para sistemi, giriş, profil ve arkadaşlık.

## Mimari

| Katman | Teknoloji | Neden |
|---|---|---|
| Uygulama kabuğu | React + TypeScript (Vite) → **Capacitor** ile Android/iOS | Tek kod tabanı; web'de de çalışır |
| Gerçek zamanlı sunucu | Node.js + **Socket.IO** (`server/`) | Oda, koltuk, sohbet ve Uno kuralları sunucuda (hile yapılamaz) |
| Oyun motoru | `server/src/uno.ts` (saf TypeScript, 11 test) | Yeni oyunlar aynı kalıpla eklenir |
| Hesap + veritabanı | **Supabase** (Postgres + Auth + RLS) | Cüzdan sadece güvenli SQL fonksiyonlarıyla değişir |
| Ses | **LiveKit** (WebRTC, yankı engelleme, gürültü bastırma) | Ücretsiz katman; sadece koltuktakiler konuşabilir |

```
client (React/Capacitor) ──WebSocket──▶ server (Socket.IO) ──▶ Supabase (profil, cüzdan, hediye, arkadaş)
        └──────────── WebRTC ses ────────────▶ LiveKit Cloud ◀── token ── server
```

İstemci tek API olarak sunucuyu kullanır, Supabase'i sadece giriş için kullanır.
Sunucunun iki veri modu var:
- **supabase**: `SUPABASE_URL` + `SUPABASE_ANON_KEY` verilirse. Gerçek hesaplar.
- **demo**: anahtar yoksa ya da `DEMO_MODE=1` ise. Veriler bellekte, sadece kullanıcı adıyla giriş. Hızlı deneme için.

## Hızlı başlangıç (bilgisayarında)

```bash
npm run setup          # bağımlılıklar
npm run build          # istemciyi derle
npm run demo           # demo modunda başlat → http://localhost:3001
```
İki farklı tarayıcı penceresi (biri gizli sekme) açıp iki kullanıcıyla aynı odaya gir, koltuğa otur, Uno'yu başlat.

Geliştirme (canlı yenileme): bir terminalde `npm run dev:server`, diğerinde `npm run dev:client` → http://localhost:5173

Gerçek mod: `server/.env.example` dosyasını `server/.env` olarak kopyala (Supabase bilgileri dolu) ve `npm start`.

## Supabase (kuruldu ✅)

- Proje: **parti-oyun** (`qtusjbviruqfwolbsvgx`, Frankfurt)
- Şema: `supabase/migrations/0001_init.sql` uygulandı
  - `profiles`, `wallets` (başlangıç 500 💎 / 1000 🪙), `friendships`, `gifts` (7 hediye), `gift_transactions`
  - RPC: `claim_daily`, `send_gift` (atomik), `send_friend_request`, `respond_friend_request`
  - RLS: cüzdan sadece sahibine görünür; cüzdan, çekicilik ve hediye kaydı istemciden değiştirilemez
- **Yapman gereken:** Supabase panelinde *Authentication → Sign In / Providers → Email* altında
  - Test aşamasında "Confirm email" seçeneğini kapatabilirsin (kayıt olur olmaz giriş yapılır), ya da
  - açık bırakıp *Authentication → URL Configuration* bölümüne sitenin adresini ekle.

## Ses (LiveKit) — 5 dakikalık kurulum

1. https://cloud.livekit.io adresinde ücretsiz hesap aç ve bir proje oluştur.
2. *Settings → API Keys* altında anahtar oluştur.
3. Sunucu ortam değişkenlerine şunları ekle:
   ```
   LIVEKIT_URL=wss://<proje>.livekit.cloud
   LIVEKIT_API_KEY=...
   LIVEKIT_API_SECRET=...
   ```
Anahtar yoksa uygulama sessiz çalışır; diğer her şey çalışmaya devam eder.

## İnternete yayınlama (ücretsiz)

**Render.com** (önerilen, `render.yaml` hazır):
1. Projeyi GitHub'a yükle.
2. Render → *New → Blueprint* → repoyu seç.
3. `SUPABASE_URL`, `SUPABASE_ANON_KEY` ve LiveKit değişkenlerini gir.
4. Sunucu hem API'yi hem web uygulamasını aynı adresten sunar (`https://parti-xxxx.onrender.com`).

> Render ücretsiz planında sunucu 15 dakika boşta kalınca uyur; ilk açılış yaklaşık 30 sn sürer.
> Gerçek kullanıcılar gelince aylık ~7 $'lık plana ya da Fly.io / Railway'e geç.
> Oda durumu sunucu belleğinde tutulur. Tek sunucu, MVP için binlerce eşzamanlı kullanıcıya yeter.
> Ölçeklemek için Redis adapter gerekir.

## Mobil uygulama (Android / iOS)

```bash
cd client
echo "VITE_SERVER_URL=https://parti-xxxx.onrender.com" > .env
npm run build
npx cap add android            # ilk sefer
npx cap sync
npx cap open android           # Android Studio açılır → Run
```
`android/app/src/main/AndroidManifest.xml` dosyasına mikrofon izinlerini ekle:
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```
iOS için `npx cap add ios`, ardından `Info.plist` dosyasına `NSMicrophoneUsageDescription` ekle (Mac + Xcode gerekir).

## Testler

```bash
npm test                                   # Uno motoru (11 test, 500 rastgele oyun)
cd server && DEMO_MODE=1 npm start &       # sonra:
npx tsx scripts/e2e.ts                     # 29 adımlı çok oyunculu senaryo
python3 tests/ui_test.py                   # 2 tarayıcılı arayüz testi (Playwright)
```

## Özellikler

- **Lobi:** canlı oda listesi, filtre, hızlı oyna, oda oluşturma, "yakında" oyunlar
- **Oda:** 9 koltuk (ev sahibi + 8), koltuk kilitleme ve indirme (oda sahibi), sessize alma, konuşan kişide dalga efekti, sohbet + hızlı mesajlar, üye listesi, oda sahibi ayrılınca sahiplik devri, bağlantı koparsa otomatik yeniden katılma
- **Uno:** 2-6 oyuncu, tam kurallar (atla, yön değiştir, +2, renk seç, +4), UNO deme ve yakalama (+2 ceza), 25 sn tur süresi (dolunca otomatik çekme), izleyici modu, kazanan ekranı
- **Hediye:** 7 hediye (küçük, orta, büyük), ×1/×10/×99, küçükler için kayan şerit, büyükler için tam ekran animasyon, çekicilik/servet puanı, servete göre seviye
- **Profil:** avatar, kullanıcı adı, hakkımda, günlük ödül (50 💎 + 200 🪙)
- **Arkadaşlar:** arama, istek gönderme/kabul/ret, çevrimiçi durumu, "arkadaşının odasına katıl"

## Sonraki adımlar (öneri sırası)

1. Elmas mağazası: Google Play Billing / App Store IAP (RevenueCat ile kolay). Satın alma doğrulaması sunucuda yapılmalı.
2. İkinci oyun: Ludo veya Çiz-Tahmin Et (`uno.ts` kalıbında yeni bir motor + bileşen)
3. Moderasyon: şikayet etme, engelleme, kötü söz filtresi (mağaza onayı için gerekli)
4. Push bildirim (OneSignal) ve özel mesajlaşma
5. Animasyonları Lottie/SVGA dosyalarına taşıma (tasarımcı ile)
