// Tema kataloğu. Her tema ayrı: kendi renkleri (styles.css → html.theme-<id>), süsleri ve tanıtım yazısı.
// Tarihler: sabit günler "AA-GG", her yıl değişen bayramlar "YYYY-AA-GG" (panelden güncellenir).

export interface ThemeDef {
  id: string; name: string; emoji: string; desc: string;
  from?: string; to?: string;            // varsayılan tarih aralığı
  lunar?: boolean;                       // tarihi her yıl değişir (Hicri takvim)
  fx: string[]; fxMode: 'fall' | 'rise' | 'drift';
  banner: { title: string; text: string };
  greeting?: string;
}

export const THEMES: ThemeDef[] = [
  { id: 'default', name: 'Parti', emoji: '🎉', desc: 'Varsayılan mor-pembe parti teması', fx: [], fxMode: 'fall',
    banner: { title: 'Parti zamanı!', text: 'Bir odaya gir, koltuğa otur, oyuna başla.' } },
  { id: 'yilbasi', name: 'Yılbaşı', emoji: '🎄', desc: 'Kar taneleri, kırmızı-yeşil-altın', from: '12-20', to: '01-02',
    fx: ['❄️', '❄️', '❄️', '✨', '🎁'], fxMode: 'fall',
    banner: { title: 'Mutlu yıllar! 🎄', text: 'Yeni yıla partide gir, arkadaşlarına hediye gönder!' }, greeting: 'Mutlu yıllar' },
  { id: 'ekim29', name: '29 Ekim', emoji: '🇹🇷', desc: 'Cumhuriyet Bayramı: al-beyaz', from: '10-27', to: '10-30',
    fx: ['flag', '⭐', '🎉'], fxMode: 'drift',
    banner: { title: 'Cumhuriyet Bayramımız kutlu olsun!', text: 'Nice 100 yıllara 🇹🇷' }, greeting: 'Bayramın kutlu olsun' },
  { id: 'mayis19', name: '19 Mayıs', emoji: '🏃', desc: 'Gençlik ve Spor Bayramı: al-beyaz', from: '05-17', to: '05-20',
    fx: ['flag', '⭐', '⚽'], fxMode: 'drift',
    banner: { title: '19 Mayıs kutlu olsun!', text: "Atatürk'ü Anma, Gençlik ve Spor Bayramı'mız kutlu olsun." }, greeting: 'Bayramın kutlu olsun' },
  { id: 'nisan23', name: '23 Nisan', emoji: '🎈', desc: 'Ulusal Egemenlik ve Çocuk Bayramı: rengârenk', from: '04-21', to: '04-24',
    fx: ['🎈', '🎈', '🪁', '⭐'], fxMode: 'rise',
    banner: { title: '23 Nisan kutlu olsun!', text: 'Ulusal Egemenlik ve Çocuk Bayramı’mız kutlu olsun 🎈' }, greeting: 'Bayramın kutlu olsun' },
  { id: 'ramazan', name: 'Ramazan Bayramı', emoji: '🌙', desc: 'Hilal, yıldız ve şeker; altın-zümrüt', lunar: true, from: '2027-03-09', to: '2027-03-11',
    fx: ['🌙', '⭐', '🍬'], fxMode: 'drift',
    banner: { title: 'Bayramınız mübarek olsun!', text: 'Ramazan Bayramı’nda sevdiklerine bir hediye gönder 🍬' }, greeting: 'İyi bayramlar' },
  { id: 'kurban', name: 'Kurban Bayramı', emoji: '🕌', desc: 'Huzurlu yeşil-altın', lunar: true, from: '2027-05-16', to: '2027-05-19',
    fx: ['🌙', '⭐', '✨'], fxMode: 'drift',
    banner: { title: 'Kurban Bayramınız mübarek olsun!', text: 'Bayramda sesli odalarda buluşalım 🕌' }, greeting: 'İyi bayramlar' },
  { id: 'cadilar', name: 'Cadılar Bayramı', emoji: '🎃', desc: 'Balkabağı, yarasa ve hayaletler; turuncu-mor', from: '10-31', to: '11-02',
    fx: ['🎃', '🦇', '👻', '🦇'], fxMode: 'drift',
    banner: { title: 'Şeker mi, şaka mı? 🎃', text: 'Cadılar Bayramı’na özel ürkütücü eğlence seni bekliyor!' }, greeting: 'Bööö 👻' },
  { id: 'sevgililer', name: 'Sevgililer Günü', emoji: '💘', desc: 'Kalpler ve güller; pembe-kırmızı', from: '02-12', to: '02-15',
    fx: ['💖', '💕', '🌹', '💗'], fxMode: 'rise',
    banner: { title: 'Sevgililer Günün kutlu olsun 💘', text: 'Sevdiğine bir gül gönder, kalbini kazan 🌹' }, greeting: 'Sevgiyle' },
];

export interface ThemeSetting { mode: 'auto' | 'manual'; active: string; schedule: Record<string, { from?: string; to?: string; enabled?: boolean }> }
export const DEFAULT_THEME_SETTING: ThemeSetting = { mode: 'auto', active: 'default', schedule: {} };

export const themeById = (id?: string | null) => THEMES.find(t => t.id === id) ?? THEMES[0];

const pad = (n: number) => String(n).padStart(2, '0');

/** Bugün [from, to] aralığında mı? "AA-GG" yıl dönümünü (12-20 → 01-02) destekler. */
export function inRange(from: string | undefined, to: string | undefined, d = new Date()): boolean {
  if (!from || !to) return false;
  if (from.length === 10) {
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return day >= from && day <= to;
  }
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
}

/** Ayarlara göre şu an hangi tema açık? */
export function activeTheme(s: ThemeSetting | null | undefined, d = new Date()): ThemeDef {
  const set = s ?? DEFAULT_THEME_SETTING;
  if (set.mode === 'manual') return themeById(set.active);
  for (const t of THEMES) {
    if (t.id === 'default') continue;
    const o = set.schedule?.[t.id] ?? {};
    if (o.enabled === false) continue;
    if (inRange(o.from ?? t.from, o.to ?? t.to, d)) return t;
  }
  return THEMES[0];
}
