// Oyun kaydı: lobi, oda ve ağ katmanı oyunları buradan tanır.
export type GameId = 'uno' | 'ludo' | 'draw' | 'spy' | 'tavla' | 'okey' | 'chat';

export interface GameMeta {
  id: GameId; name: string; icon: string; tone: string; min: number; max: number;
  referee: string | null;       // Edge Function adı
  desc: string;                 // lobide/oda bekleme ekranında kısa açıklama
  isNew?: boolean;
}

export const GAMES: Record<GameId, GameMeta> = {
  uno: { id: 'uno', name: 'Uno', icon: '🎴', tone: 'uno', min: 2, max: 6, referee: 'game', desc: 'Rengi ya da sayıyı eşle, son kartında UNO de!' },
  ludo: { id: 'ludo', name: 'Ludo', icon: '🎲', tone: 'ludo', min: 2, max: 4, referee: 'ludo', desc: 'Kızma Birader! 6 atan taşını çıkarır, rakibin üstüne gelen taşı kırar.' },
  draw: { id: 'draw', name: 'Çiz-Tahmin', icon: '🎨', tone: 'draw', min: 2, max: 8, referee: 'draw', desc: 'Sırayla bir kelime çiz, diğerleri tahmin etsin. Erken bilen çok puan alır!', isNew: true },
  spy: { id: 'spy', name: 'Casus Kim?', icon: '🕵️', tone: 'spy', min: 3, max: 8, referee: 'spy', desc: 'Herkes aynı kelimeyi bilir, casus bilmez. İpucu ver, casusu oyla bul!', isNew: true },
  tavla: { id: 'tavla', name: 'Tavla', icon: '⚪', tone: 'tavla', min: 2, max: 2, referee: 'tavla', desc: 'Klasik tavla: zarı at, pullarını topla, ilk bitiren kazanır.', isNew: true },
  okey: { id: 'okey', name: 'Okey', icon: '🀄', tone: 'okey', min: 2, max: 4, referee: 'okey', desc: 'Taşları per ve seri yap, eli ilk bitiren kazanır. Okey taşı joker!', isNew: true },
  chat: { id: 'chat', name: 'Sesli Sohbet', icon: '🎙️', tone: 'chat', min: 0, max: 0, referee: null, desc: 'Koltuğa otur ve sohbete katıl!' },
};

export const PLAYABLE: GameId[] = ['uno', 'ludo', 'draw', 'spy', 'tavla', 'okey'];
export const meta = (g?: string | null): GameMeta => GAMES[(g as GameId)] ?? GAMES.chat;
