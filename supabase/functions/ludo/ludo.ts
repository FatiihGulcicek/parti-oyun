// Sunucu-otoriter Ludo (Kızma Birader) motoru. Saf mantık: ağ / zamanlayıcı içermez.
//
// Taş konumu ("ilerleme") oyuncunun kendi başlangıç karesine göre tutulur:
//   -1      : evde (başlangıç bölgesi)
//   0..50   : ana yol (pist karesi = (başlangıç + ilerleme) % 52)
//   51..55  : renk koridoru (sadece sahibi girebilir)
//   56      : bitiş (merkez)

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';
export const COLORS: LudoColor[] = ['red', 'green', 'yellow', 'blue'];
/** Her rengin ana yoldaki başlangıç karesi. */
export const START: Record<LudoColor, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
export const TRACK = 52;
export const LAST_TRACK = 50;   // ana yoldaki son ilerleme
export const GOAL = 56;
export const HOME = -1;
/** Güvenli kareler (pist indeksi): başlangıçlar + yıldızlar. Burada taş kırılmaz. */
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export interface LudoState {
  players: string[];                       // sıra (saat yönü)
  colors: Record<string, LudoColor>;
  tokens: Record<string, number[]>;        // her oyuncu için 4 taşın ilerlemesi
  turn: number;
  dice: number | null;                     // atılmış ama henüz oynanmamış zar
  sixes: number;                           // bu turdaki art arda 6 sayısı
  rollId: number;                          // her zar atışında artar (animasyon için)
  lastRoll: { by: string; value: number } | null;
  winner: string | null;
  lastAction: {
    type: 'roll' | 'move' | 'skip';
    by: string; dice: number; token?: number; from?: number; to?: number;
    captured?: { player: string; token: number }[]; bonus?: boolean; reason?: 'no_move' | 'three_sixes';
  } | null;
}

export type LudoAction = { type: 'roll' } | { type: 'move'; token: number };

export class LudoError extends Error {}

export function current(s: LudoState): string { return s.players[s.turn]; }

/** Oyuncu sayısına göre renkler: 2 kişide karşılıklı renkler. */
export function colorsFor(n: number): LudoColor[] {
  if (n === 2) return ['red', 'yellow'];
  if (n === 3) return ['red', 'green', 'yellow'];
  return [...COLORS];
}

export function newGame(players: string[]): LudoState {
  if (players.length < 2 || players.length > 4) throw new LudoError('2-4 oyuncu gerekli');
  const cs = colorsFor(players.length);
  const colors: Record<string, LudoColor> = {};
  const tokens: Record<string, number[]> = {};
  players.forEach((p, i) => { colors[p] = cs[i]; tokens[p] = [HOME, HOME, HOME, HOME]; });
  return {
    players: [...players], colors, tokens, turn: 0, dice: null, sixes: 0, rollId: 0,
    lastRoll: null, winner: null, lastAction: null,
  };
}

/** Ana yoldaki ilerlemeyi pist karesine çevirir (koridor/ev için null). */
export function trackIndex(color: LudoColor, progress: number): number | null {
  if (progress < 0 || progress > LAST_TRACK) return null;
  return (START[color] + progress) % TRACK;
}

/** Taşın zarla varacağı ilerleme; hamle mümkün değilse null. */
export function target(progress: number, dice: number): number | null {
  if (progress === HOME) return dice === 6 ? 0 : null;
  if (progress >= GOAL) return null;
  const to = progress + dice;
  return to > GOAL ? null : to;
}

export function legalMoves(s: LudoState, player = current(s), dice = s.dice): number[] {
  if (dice == null) return [];
  return s.tokens[player].map((p, i) => (target(p, dice) == null ? -1 : i)).filter(i => i >= 0);
}

function nextTurn(s: LudoState) {
  s.turn = (s.turn + 1) % s.players.length;
  s.dice = null;
  s.sixes = 0;
}

/** Bir hamleyi uygular. Geçersizse LudoError fırlatır. State'i yerinde değiştirir. */
export function apply(s: LudoState, by: string, a: LudoAction, rnd: () => number = Math.random): void {
  if (s.winner) throw new LudoError('Oyun bitti');
  if (!s.players.includes(by)) throw new LudoError('Oyuncu değilsin');
  if (current(s) !== by) throw new LudoError('Sıra sende değil');

  if (a.type === 'roll') {
    if (s.dice != null) throw new LudoError('Önce taşını oyna');
    const value = Math.min(6, Math.floor(rnd() * 6) + 1);
    s.rollId++;
    s.lastRoll = { by, value };
    s.dice = value;
    if (value === 6) s.sixes++;
    if (s.sixes >= 3) {
      s.lastAction = { type: 'skip', by, dice: value, reason: 'three_sixes' };
      nextTurn(s);
      return;
    }
    if (legalMoves(s).length === 0) {
      s.lastAction = { type: 'skip', by, dice: value, reason: 'no_move' };
      if (value === 6) s.dice = null; // 6 attıysa tekrar atar
      else nextTurn(s);
      return;
    }
    s.lastAction = { type: 'roll', by, dice: value };
    return;
  }

  if (a.type !== 'move') throw new LudoError('Geçersiz hamle');
  if (s.dice == null) throw new LudoError('Önce zar at');
  const t = a.token;
  if (!Number.isInteger(t) || t < 0 || t > 3) throw new LudoError('Geçersiz taş');
  const from = s.tokens[by][t];
  const to = target(from, s.dice);
  if (to == null) throw new LudoError('Bu taş oynayamaz');

  const dice = s.dice;
  s.tokens[by][t] = to;
  const captured: { player: string; token: number }[] = [];
  const sq = trackIndex(s.colors[by], to);
  if (sq != null && !SAFE.has(sq)) {
    for (const p of s.players) {
      if (p === by) continue;
      s.tokens[p].forEach((pp, i) => {
        if (trackIndex(s.colors[p], pp) === sq) { s.tokens[p][i] = HOME; captured.push({ player: p, token: i }); }
      });
    }
  }
  const finished = to === GOAL;
  const bonus = dice === 6 || captured.length > 0 || finished;
  s.lastAction = { type: 'move', by, dice, token: t, from, to, captured: captured.length ? captured : undefined, bonus };

  if (s.tokens[by].every(p => p === GOAL)) {
    s.winner = by;
    s.dice = null;
    return;
  }
  if (bonus) { s.dice = null; if (dice !== 6) s.sixes = 0; }
  else nextTurn(s);
}

/** Süre dolunca hakemin seçeceği hamle: kır > bitir > çık > en öndeki taş. */
export function bestMove(s: LudoState): number | null {
  const by = current(s);
  const moves = legalMoves(s);
  if (!moves.length || s.dice == null) return null;
  const score = (i: number) => {
    const from = s.tokens[by][i];
    const to = target(from, s.dice!)!;
    const sq = trackIndex(s.colors[by], to);
    let v = to;
    if (sq != null && !SAFE.has(sq) && s.players.some(p => p !== by && s.tokens[p].some(pp => trackIndex(s.colors[p], pp) === sq))) v += 1000;
    if (to === GOAL) v += 500;
    if (from === HOME) v += 300;
    return v;
  };
  return moves.reduce((b, i) => (score(i) > score(b) ? i : b), moves[0]);
}

/** Süre dolunca otomatik hamle: zar atılmadıysa at, sonra en iyi taşı oyna. Sıra bir kez işler. */
export function autoMove(s: LudoState, rnd: () => number = Math.random) {
  const p = current(s);
  if (s.dice == null) apply(s, p, { type: 'roll' }, rnd);
  if (!s.winner && current(s) === p && s.dice != null) {
    const t = bestMove(s);
    if (t != null) apply(s, p, { type: 'move', token: t }, rnd);
  }
}

/** Oyuncu ayrılınca oyundan çıkar (taşları tahtadan kalkar). */
export function removePlayer(s: LudoState, p: string) {
  const i = s.players.indexOf(p);
  if (i < 0) return;
  const wasTurn = i === s.turn;
  s.players.splice(i, 1);
  delete s.tokens[p];
  delete s.colors[p];
  const len = s.players.length;
  if (len > 0) {
    if (wasTurn) { s.turn = i % len; s.dice = null; s.sixes = 0; }
    else if (i < s.turn) s.turn--;
  }
  if (len === 1) { s.winner = s.players[0]; s.dice = null; }
}

/** Herkese açık görünüm (Ludo'da gizli bilgi yok). */
export function viewFor(s: LudoState) {
  return {
    players: s.players.map(p => ({ id: p, color: s.colors[p], tokens: s.tokens[p] })),
    turn: current(s),
    dice: s.dice,
    legal: legalMoves(s),
    rollId: s.rollId,
    lastRoll: s.lastRoll,
    winner: s.winner,
    lastAction: s.lastAction,
  };
}
