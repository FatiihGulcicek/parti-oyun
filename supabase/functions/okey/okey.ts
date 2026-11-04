// Sunucu-otoriter Okey motoru (sade, tek el). Saf mantık: zaman/rastgelelik dışarıdan.
//
// 106 taş: 4 renk × 1-13 × 2 + 2 sahte okey. Gösterge taşının bir fazlası (aynı renk, 13→1) "okey"dir
// ve joker olarak her taşın yerine geçer; sahte okey, okeyin değerini taşır. Başlayan 15, diğerleri 14 taş alır.
// Sıra: ortadan ya da soldakinin attığı taştan çek → bir taş at. Elini bitiren (14 taşı per/seri ya da
// 7 çift olan) taşını atarak kazanır. Bitiş kontrolü sunucuda: oyuncunun taşları dizmesi gerekmez.

export interface Tile { id: number; c: number; n: number } // c: 0 kırmızı, 1 sarı, 2 mavi, 3 siyah, 4 sahte okey
export type Phase = 'draw' | 'discard' | 'end';

export interface OkeyState {
  players: string[];
  hands: Record<string, Tile[]>;
  pile: Tile[];
  discards: Record<string, Tile[]>;   // her oyuncunun attığı taşlar (sıradaki oyuncu en üsttekini alabilir)
  indicator: Tile;
  okey: { c: number; n: number };
  turn: number;
  phase: Phase;
  drawn: number | null;               // bu tur çekilen taşın id'si
  winner: string | null;
  winHand: Tile[] | null;
  pairs: boolean;                     // çifte ile mi bitti
  drawGame: boolean;                  // taş bitti, kazanan yok
  lastDiscard: { by: string; tile: Tile } | null;
  next: number;
}

export type OkeyAction = { type: 'draw'; from: 'pile' | 'discard' } | { type: 'discard'; tile: number } | { type: 'finish'; tile: number };
export class OkeyError extends Error {}
export const TURN_MS = 35_000;

export function buildTiles(): Tile[] {
  const t: Tile[] = [];
  let id = 0;
  for (let k = 0; k < 2; k++) for (let c = 0; c < 4; c++) for (let n = 1; n <= 13; n++) t.push({ id: id++, c, n });
  t.push({ id: id++, c: 4, n: 0 }, { id: id++, c: 4, n: 0 });
  return t; // 106
}

function shuffle<T>(a: T[], rnd: () => number) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const isWild = (t: Tile, okey: { c: number; n: number }) => t.c === okey.c && t.n === okey.n;
/** Taşın oyundaki değeri (sahte okey → okeyin değeri). */
export const valueOf = (t: Tile, okey: { c: number; n: number }) => (t.c === 4 ? { c: okey.c, n: okey.n } : { c: t.c, n: t.n });

export function newGame(players: string[], now: number, rnd: () => number = Math.random): OkeyState {
  if (players.length < 2 || players.length > 4) throw new OkeyError('2-4 oyuncu gerekli');
  const tiles = shuffle(buildTiles(), rnd);
  const ii = tiles.findIndex(t => t.c !== 4);
  const indicator = tiles.splice(ii, 1)[0];
  const okey = { c: indicator.c, n: indicator.n % 13 + 1 };
  const start = Math.floor(rnd() * players.length);
  const hands: Record<string, Tile[]> = {};
  players.forEach((p, i) => { hands[p] = tiles.splice(0, i === start ? 15 : 14); });
  return {
    players: [...players], hands, pile: tiles, discards: Object.fromEntries(players.map(p => [p, []])),
    indicator, okey, turn: start, phase: 'discard', drawn: null, winner: null, winHand: null, pairs: false, drawGame: false,
    lastDiscard: null, next: now + TURN_MS,
  };
}

export const current = (s: OkeyState) => s.players[s.turn];
const prevOf = (s: OkeyState, i = s.turn) => s.players[(i - 1 + s.players.length) % s.players.length];

// ---------------------------------------------------------------- el kontrolü
type Counts = number[][]; // [renk][1..13]

function solve(cnt: Counts, wild: number): boolean {
  let fc = -1, fn = -1;
  outer: for (let c = 0; c < 4; c++) for (let n = 1; n <= 13; n++) if (cnt[c][n] > 0) { fc = c; fn = n; break outer; }
  if (fc < 0) return wild === 0;
  cnt[fc][fn]--;
  // per: aynı sayı, farklı renkler (3-4 taş)
  const others = [0, 1, 2, 3].filter(c => c !== fc && cnt[c][fn] > 0);
  for (let mask = 0; mask < 1 << others.length; mask++) {
    const S = others.filter((_, i) => mask & (1 << i));
    for (const size of [3, 4]) {
      const k = size - 1 - S.length;
      if (k < 0 || k > wild) continue;
      S.forEach(c => cnt[c][fn]--);
      const ok = solve(cnt, wild - k);
      S.forEach(c => cnt[c][fn]++);
      if (ok) { cnt[fc][fn]++; return true; }
    }
  }
  // seri: aynı renk, ardışık (12-13-1 geçerli; 1 en üstte 14 sayılır)
  const has = (v: number) => (v <= 13 ? cnt[fc][v] > 0 : cnt[fc][1] > 0);
  const take = (v: number, d: number) => { if (v <= 13) cnt[fc][v] += d; else cnt[fc][1] += d; };
  const ext = (v: number, len: number, w: number): boolean => {
    if (len >= 3 && solve(cnt, w)) return true;
    if (v > 14) return false;
    if (has(v)) { take(v, -1); const ok = ext(v + 1, len + 1, w); take(v, 1); if (ok) return true; }
    if (w > 0 && ext(v + 1, len + 1, w - 1)) return true;
    return false;
  };
  for (let lw = 0; lw <= Math.min(wild, fn - 1); lw++) {
    if (ext(fn + 1, 1 + lw, wild - lw)) { cnt[fc][fn]++; return true; }
  }
  // 1'i seri sonunda (14) kullanmak: s..13 + 1
  if (fn === 1) {
    const down = (v: number, len: number, w: number): boolean => {
      if (len >= 3 && solve(cnt, w)) return true;
      if (v < 2) return false;
      if (cnt[fc][v] > 0) { cnt[fc][v]--; const ok = down(v - 1, len + 1, w); cnt[fc][v]++; if (ok) return true; }
      if (w > 0 && down(v - 1, len + 1, w - 1)) return true;
      return false;
    };
    if (down(13, 1, wild)) { cnt[fc][fn]++; return true; }
  }
  cnt[fc][fn]++;
  return false;
}

/** 14 taş per/seri ile ya da 7 çift olarak bitiyor mu? */
export function checkHand(tiles: Tile[], okey: { c: number; n: number }): { ok: boolean; pairs: boolean } {
  if (tiles.length !== 14) return { ok: false, pairs: false };
  const cnt: Counts = Array.from({ length: 4 }, () => new Array(15).fill(0));
  let wild = 0;
  for (const t of tiles) {
    if (isWild(t, okey)) { wild++; continue; }
    const v = valueOf(t, okey);
    cnt[v.c][v.n]++;
  }
  // çifte: aynı iki taş (renk+sayı) × 7; okey her taşla çift olur
  let singles = 0;
  for (let c = 0; c < 4; c++) for (let n = 1; n <= 13; n++) singles += cnt[c][n] % 2;
  if (singles <= wild && (wild - singles) % 2 === 0) return { ok: true, pairs: true };
  return { ok: solve(cnt.map(r => [...r]), wild), pairs: false };
}

// ---------------------------------------------------------------- hamleler
function refillPile(s: OkeyState, rnd: () => number) {
  // orta bitti: atılan taşlar (her yığının en üstü hariç) karıştırılıp ortaya konur
  for (const p of s.players) {
    const d = s.discards[p];
    if (d.length > 1) s.pile.push(...d.splice(0, d.length - 1));
  }
  shuffle(s.pile, rnd);
}

function endTurn(s: OkeyState, now: number) {
  s.turn = (s.turn + 1) % s.players.length;
  s.phase = 'draw';
  s.drawn = null;
  s.next = now + TURN_MS;
}

export function apply(s: OkeyState, by: string, a: OkeyAction, now: number, rnd: () => number = Math.random) {
  if (s.phase === 'end') throw new OkeyError('Oyun bitti');
  if (!s.players.includes(by)) throw new OkeyError('Oyuncu değilsin');
  if (current(s) !== by) throw new OkeyError('Sıra sende değil');
  const hand = s.hands[by];

  if (a.type === 'draw') {
    if (s.phase !== 'draw') throw new OkeyError('Önce bir taş at');
    let t: Tile | undefined;
    if (a.from === 'discard') {
      t = s.discards[prevOf(s)].pop();
      if (!t) throw new OkeyError('Alınacak taş yok');
    } else {
      if (!s.pile.length) refillPile(s, rnd);
      t = s.pile.pop();
      if (!t) { s.phase = 'end'; s.drawGame = true; s.next = 0; return; }
    }
    hand.push(t);
    s.drawn = t.id;
    s.phase = 'discard';
    s.next = now + TURN_MS;
    return;
  }

  if (a.type !== 'discard' && a.type !== 'finish') throw new OkeyError('Geçersiz hamle');
  if (s.phase !== 'discard') throw new OkeyError('Önce taş çek');
  const i = hand.findIndex(t => t.id === a.tile);
  if (i < 0) throw new OkeyError('Bu taş elinde yok');
  if (a.type === 'finish') {
    const rest = hand.filter(t => t.id !== a.tile);
    const r = checkHand(rest, s.okey);
    if (!r.ok) throw new OkeyError('Elin henüz bitmedi');
    const [tile] = hand.splice(i, 1);
    s.discards[by].push(tile);
    s.lastDiscard = { by, tile };
    s.phase = 'end'; s.winner = by; s.winHand = rest; s.pairs = r.pairs; s.next = 0;
    return;
  }
  const [tile] = hand.splice(i, 1);
  s.discards[by].push(tile);
  s.lastDiscard = { by, tile };
  endTurn(s, now);
}

/** Süre dolunca: ortadan çek, çekilen (yoksa son) taşı at. */
export function autoPlay(s: OkeyState, now: number, rnd: () => number = Math.random) {
  const p = current(s);
  if (s.phase === 'draw') apply(s, p, { type: 'draw', from: 'pile' }, now, rnd);
  if (s.phase === 'discard' && current(s) === p) {
    const hand = s.hands[p];
    const t = hand.find(x => x.id === s.drawn) ?? hand[hand.length - 1];
    apply(s, p, { type: 'discard', tile: t.id }, now, rnd);
  }
}

export function removePlayer(s: OkeyState, p: string, now: number) {
  const i = s.players.indexOf(p);
  if (i < 0 || s.phase === 'end') return;
  const wasTurn = i === s.turn;
  s.pile.unshift(...s.hands[p], ...s.discards[p]);
  delete s.hands[p]; delete s.discards[p];
  s.players.splice(i, 1);
  if (s.players.length < 2) { s.phase = 'end'; s.winner = s.players[0] ?? null; s.next = 0; return; }
  if (i < s.turn) s.turn--;
  if (wasTurn) {
    s.turn = s.turn % s.players.length;
    // yeni sıradaki oyuncunun elinde 15 taş varsa (çekmişse) atmalı, yoksa çekmeli
    s.phase = s.hands[current(s)].length > 14 ? 'discard' : 'draw';
    s.drawn = null;
    s.next = now + TURN_MS;
  }
}

export function viewFor(s: OkeyState) {
  const ended = s.phase === 'end';
  return {
    players: s.players.map(p => ({ id: p, count: s.hands[p].length, top: s.discards[p][s.discards[p].length - 1] ?? null, discarded: s.discards[p].length })),
    turn: current(s), phase: s.phase, indicator: s.indicator, okey: s.okey, pile: s.pile.length,
    lastDiscard: s.lastDiscard, winner: s.winner, winHand: ended ? s.winHand : null, pairs: s.pairs, drawGame: s.drawGame,
    canTake: s.phase === 'draw' ? Boolean(s.discards[prevOf(s)]?.length) : false, ends: s.next,
  };
}

export function privateFor(s: OkeyState, p: string) {
  return { hand: s.hands[p] ?? [], drawn: current(s) === p ? s.drawn : null };
}
