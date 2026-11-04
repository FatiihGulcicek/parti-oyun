# 🎉 Parti — Sesli oda + mini oyun platformu (MVP)

**Canlı:** https://parti-oyun.vercel.app

WePlay / TopTop tarzında bir sosyal parti uygulaması. İçinde sesli odalar, oda içinde gerçek zamanlı **Uno**, hediye ve sanal para sistemi, kullanıcı adı ve şifreyle giriş, profil ve arkadaşlık var.
Tamamı bulutta ve ücretsiz katmanlarda çalışıyor. Ayrı bir sunucu gerekmiyor.

## Mimari

```
Tarayıcı / mobil (React + Capacitor)  ── Vercel (parti-oyun)
        │  RPC + Realtime (WebSocket)
        ▼
Supabase (parti-oyun, Frankfurt)
  ├─ Postgres + RLS: profil, cüzdan, arkadaşlık, hediye, oda, koltuk, sohbet
  ├─ Realtime: koltuk, sohbet, hediye ve oyun durumu anında herkese gider
  └─ Edge Functions
       ├─ game      → Uno hakemi (tüm hamleleri doğrular, eller gizli)
       ├─ register  → kullanıcı adı + şifreyle kayıt (e-posta gerekmez)
       └─ voice     → LiveKit ses jetonu
```

| Konu | Nasıl |
|---|---|
| Hile koruması | Cüzdan, koltuk, sohbet ve oyun tabloları istemciden yazılamaz. Her şey güvenli SQL fonksiyonları veya Edge Function üzerinden geçer. |
| Gizli eller | `game_hands` tablosunda RLS var; her oyuncu sadece kendi elini görür. Tüm deste `games` tablosunda tutulur ve sadece sunucu okuyabilir. |
| Çevrimiçi durum | İstemci 20 saniyede bir sinyal gönderir. 60 saniye sinyal gelmeyen kullanıcı odadan çıkarılır, koltuğu boşalır ve oda sahipliği devredilir. |
| Tur süresi | 25 saniye. Süre dolunca odadaki herhangi bir istemci hakeme haber verir; hakem süreyi kendisi kontrol edip otomatik kart çeker. |

## Klasörler

- `client/`: React uygulaması (`src/net.ts` tüm sunucu iletişimini yapar)
- `supabase/migrations/`: veritabanı şeması (Supabase'e uygulandı)
- `supabase/functions/`: Edge Functions (yüklendi). Uno motoru: `game/uno.ts`

## Ses (LiveKit), yaklaşık 5 dakika

1. https://cloud.livekit.io adresinde ücretsiz hesap aç ve bir proje oluştur. *Settings → API Keys* altında anahtar üret.
2. Supabase panelinde *Edge Functions → Secrets* bölümüne şunları ekle: `LIVEKIT_URL` (`wss://...livekit.cloud`), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
3. Başka bir şey yapmana gerek yok; odadaki "Ses kapalı" yazısı "Ses açık" olur.

## Güncelleme yayınlama

- İstemci: `cd client && npx vercel --prod` (ya da projeyi GitHub'a bağla, her push'ta otomatik yayınlanır)
- Sunucu fonksiyonları: `supabase functions deploy game register voice`
- Şema: `supabase db push`

## Mobil uygulama (Android / iOS)

```bash
cd client && npm install && npm run build
npx cap add android && npx cap sync && npx cap open android
```
`AndroidManifest.xml` dosyasına `RECORD_AUDIO` ve `MODIFY_AUDIO_SETTINGS` izinlerini ekle. iOS için `Info.plist` dosyasına `NSMicrophoneUsageDescription` ekle.

## Test

- `npm test`: Uno motoru (11 test, 500 rastgele oyun)
- Aynı tarayıcıda iki hesapla denemek için adresi `?ayri` ekiyle aç: https://parti-oyun.vercel.app/?ayri (bu durumda oturum sekmeye özel olur)

## Sonraki adımlar

1. Elmas mağazası (Google Play / App Store ödemesi; RevenueCat ile kolay)
2. İkinci oyun: Ludo veya Çiz-Tahmin Et (`game/uno.ts` kalıbıyla)
3. Moderasyon: şikayet etme, engelleme, kötü söz filtresi
4. Push bildirim (OneSignal)
