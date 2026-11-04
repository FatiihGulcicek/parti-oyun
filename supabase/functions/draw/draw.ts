// Sunucu-otoriter Çiz-Tahmin motoru. Saf mantık: zaman dışarıdan (`now`) verilir, ağ içermez.
//
// Akış (her çizer için): choose (3 kelimeden birini seç) → draw (çiz, diğerleri tahmin eder;
// süre içinde 2 harf ipucu açılır) → reveal (kelime gösterilir) → sıradaki çizer. Tüm turlar bitince en
// yüksek puanlı kazanır.

export const CHOOSE_MS = 15_000;
export const DRAW_MS = 75_000;
export const REVEAL_MS = 5_000;
export const HINT_AT = [0.5, 0.75]; // çizim süresinin bu oranlarında birer harf açılır
export const MAX_FEED = 14;

export type Phase = 'choose' | 'draw' | 'reveal' | 'end';
export interface FeedItem { by: string; text?: string; kind: 'guess' | 'correct' | 'close' }

export interface DrawState {
  players: string[];
  scores: Record<string, number>;
  rounds: number;
  turn: number;               // toplam kaçıncı çizim (0'dan)
  drawer: string;
  phase: Phase;
  choices: string[];          // çizerin seçenekleri (gizli)
  word: string;               // seçilen kelime (gizli; reveal/end'de açılır)
  revealed: number[];         // ipucu olarak açılan harf indeksleri
  hintsGiven: number;
  drawStart: number;
  next: number;               // bir sonraki zaman olayı (ipucu / tur sonu)
  guessed: string[];          // doğru bilenler (sırayla)
  gained: Record<string, number>; // bu turda kazanılan puanlar
  feed: FeedItem[];
  used: string[];             // bu oyunda çıkmış kelimeler
  winner: string | null;
  lastWord: string | null;
}

export type DrawAction = { type: 'choose'; index: number } | { type: 'guess'; text: string };
export class DrawError extends Error {}

export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Karşılaştırma için sadeleştirme: Türkçe küçük harf, aksan/boşluk farkı yok. */
export function norm(t: string): string {
  return t.toLocaleLowerCase('tr-TR')
    .replace(/[çc]/g, 'c').replace(/[ğg]/g, 'g').replace(/[ıi̇i]/g, 'i').replace(/[öo]/g, 'o').replace(/[şs]/g, 's').replace(/[üu]/g, 'u')
    .replace(/[^a-z0-9]/g, '');
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function totalTurns(s: DrawState) { return s.players.length * s.rounds; }

function pickChoices(s: DrawState, words: string[], rnd: () => number) {
  const pool = words.filter(w => !s.used.includes(w));
  return shuffle(pool.length >= 3 ? pool : [...words], rnd).slice(0, 3);
}

function startTurn(s: DrawState, words: string[], now: number, rnd: () => number) {
  s.drawer = s.players[s.turn % s.players.length];
  s.phase = 'choose';
  s.choices = pickChoices(s, words, rnd);
  s.word = '';
  s.revealed = [];
  s.hintsGiven = 0;
  s.guessed = [];
  s.gained = {};
  s.feed = [];
  s.next = now + CHOOSE_MS;
}

export function newGame(players: string[], words: string[], now: number, rnd: () => number = Math.random): DrawState {
  if (players.length < 2 || players.length > 8) throw new DrawError('2-8 oyuncu gerekli');
  const s: DrawState = {
    players: [...players], scores: Object.fromEntries(players.map(p => [p, 0])), rounds: players.length <= 4 ? 2 : 1,
    turn: 0, drawer: players[0], phase: 'choose', choices: [], word: '', revealed: [], hintsGiven: 0, drawStart: 0, next: 0,
    guessed: [], gained: {}, feed: [], used: [], winner: null, lastWord: null,
  };
  startTurn(s, words, now, rnd);
  return s;
}

function beginDraw(s: DrawState, index: number, now: number) {
  s.word = s.choices[index] ?? s.choices[0];
  s.used.push(s.word);
  s.phase = 'draw';
  s.drawStart = now;
  s.next = now + DRAW_MS * HINT_AT[0];
}

function endTurn(s: DrawState, now: number) {
  // çizer: her doğru tahmin için puan
  if (s.guessed.length) {
    const bonus = 25 * s.guessed.length;
    s.scores[s.drawer] = (s.scores[s.drawer] ?? 0) + bonus;
    s.gained[s.drawer] = bonus;
  }
  s.lastWord = s.word;
  s.phase = 'reveal';
  s.next = now + REVEAL_MS;
}

function finish(s: DrawState) {
  s.phase = 'end';
  s.next = 0;
  s.winner = [...s.players].sort((a, b) => (s.scores[b] ?? 0) - (s.scores[a] ?? 0))[0] ?? null;
}

/** Sıradaki harf ipucu: boşluk olmayan, henüz açılmamış rastgele bir harf. */
function revealLetter(s: DrawState, rnd: () => number) {
  const hidden = [...s.word].map((c, i) => (c !== ' ' && !s.revealed.includes(i) ? i : -1)).filter(i => i >= 0);
  if (hidden.length > 1) s.revealed.push(hidden[Math.floor(rnd() * hidden.length)]);
  s.hintsGiven++;
}

/** Zamanlayıcı olayı: ipucu aç / turu bitir / sonraki tura geç. Erken çağrılırsa hiçbir şey yapmaz. */
export function tick(s: DrawState, words: string[], now: number, rnd: () => number = Math.random): boolean {
  if (s.winner || s.phase === 'end' || now < s.next - 500) return false;
  if (s.phase === 'choose') { beginDraw(s, 0, now); return true; }
  if (s.phase === 'draw') {
    if (s.hintsGiven < HINT_AT.length) {
      revealLetter(s, rnd);
      s.next = s.hintsGiven < HINT_AT.length ? s.drawStart + DRAW_MS * HINT_AT[s.hintsGiven] : s.drawStart + DRAW_MS;
      return true;
    }
    endTurn(s, now);
    return true;
  }
  // reveal → sıradaki çizer
  s.turn++;
  if (s.turn >= totalTurns(s)) finish(s);
  else startTurn(s, words, now, rnd);
  return true;
}

/** Bir oyuncu hamlesi. Geçersizse DrawError fırlatır. Dönüş: tahmin sonucu (doğru/yakın/yanlış). */
export function apply(s: DrawState, by: string, a: DrawAction, now: number): 'correct' | 'close' | 'wrong' | 'ok' {
  if (s.winner || s.phase === 'end') throw new DrawError('Oyun bitti');
  if (!s.players.includes(by)) throw new DrawError('Oyuncu değilsin');

  if (a.type === 'choose') {
    if (s.phase !== 'choose') throw new DrawError('Kelime seçme zamanı değil');
    if (by !== s.drawer) throw new DrawError('Sıra sende değil');
    if (!Number.isInteger(a.index) || a.index < 0 || a.index >= s.choices.length) throw new DrawError('Geçersiz seçim');
    beginDraw(s, a.index, now);
    return 'ok';
  }

  if (a.type !== 'guess') throw new DrawError('Geçersiz hamle');
  if (s.phase !== 'draw') throw new DrawError('Şu an tahmin yapılamaz');
  if (by === s.drawer) throw new DrawError('Çizen tahmin edemez');
  if (s.guessed.includes(by)) throw new DrawError('Zaten bildin');
  const text = String(a.text ?? '').trim().slice(0, 40);
  if (!text) throw new DrawError('Boş tahmin');

  const g = norm(text), w = norm(s.word);
  if (g === w) {
    const f = Math.min(1, Math.max(0, (now - s.drawStart) / DRAW_MS));
    const pts = Math.max(20, Math.round(50 + 100 * (1 - f)) - 10 * s.guessed.length);
    s.scores[by] = (s.scores[by] ?? 0) + pts;
    s.gained[by] = pts;
    s.guessed.push(by);
    push(s, { by, kind: 'correct' });
    if (s.guessed.length >= s.players.length - 1) endTurn(s, now);
    return 'correct';
  }
  if (w.length >= 4 && levenshtein(g, w) === 1) { push(s, { by, kind: 'close' }); return 'close'; }
  push(s, { by, text, kind: 'guess' });
  return 'wrong';
}

function push(s: DrawState, f: FeedItem) {
  s.feed.push(f);
  if (s.feed.length > MAX_FEED) s.feed.splice(0, s.feed.length - MAX_FEED);
}

/** Oyuncu ayrılınca oyundan çıkar. */
export function removePlayer(s: DrawState, p: string, words: string[], now: number, rnd: () => number = Math.random) {
  const i = s.players.indexOf(p);
  if (i < 0) return;
  const wasDrawer = s.drawer === p && (s.phase === 'choose' || s.phase === 'draw');
  // turn sayacını, sıradaki çizer kaymasın diye ayarla
  const curIdx = s.turn % s.players.length;
  s.players.splice(i, 1);
  delete s.scores[p];
  s.guessed = s.guessed.filter(x => x !== p);
  if (s.players.length < 2) { finish(s); return; }
  if (i < curIdx) s.turn = Math.max(0, s.turn - 1);
  if (wasDrawer) {
    // çizer gitti: turu bu oyuncunun yerine geçen kişiyle yeniden başlat
    if (s.turn >= totalTurns(s)) { finish(s); return; }
    startTurn(s, words, now, rnd);
  } else if (s.phase === 'draw' && s.guessed.length >= s.players.length - 1) endTurn(s, now);
}

/** Herkese açık görünüm: kelime gizli, sadece maske ve açılan harfler. */
export function viewFor(s: DrawState) {
  const showWord = s.phase === 'reveal' || s.phase === 'end';
  const word = s.phase === 'draw' ? s.word : showWord ? (s.lastWord ?? '') : '';
  return {
    players: s.players.map(p => ({ id: p, score: s.scores[p] ?? 0, guessed: s.guessed.includes(p), gained: s.gained[p] ?? 0 })),
    drawer: s.drawer, phase: s.phase, round: Math.floor(s.turn / Math.max(1, s.players.length)) + 1, rounds: s.rounds,
    turn: s.turn + 1, totalTurns: totalTurns(s),
    mask: [...word].map((c, i) => (c === ' ' ? ' ' : showWord || s.revealed.includes(i) ? c : '_')),
    word: showWord ? s.lastWord : null,
    feed: s.feed, winner: s.winner, drawStart: s.drawStart,
    ends: s.phase === 'draw' ? s.drawStart + DRAW_MS : s.next,
  };
}

/** Oyuncuya özel (gizli) bilgi: çizer kelimeyi/seçenekleri görür. */
export function privateFor(s: DrawState, p: string) {
  if (p !== s.drawer || s.phase === 'reveal' || s.phase === 'end') return {};
  return s.phase === 'choose' ? { choices: s.choices } : { word: s.word };
}
