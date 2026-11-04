// Sunucu-otoriter Tavla motoru. Saf mantık: zaman/rastgelelik dışarıdan verilir.
//
// Tahta: points[0..23]; pozitif = beyaz pul sayısı, negatif = siyah. Beyaz 23→0 yönünde oynar (evi 0-5),
// siyah 0→23 yönünde (evi 18-23). Bar: kırılan pullar; off: toplanan pullar.
// Kurallar: bardaki pul önce girer; 2+ rakip pulu olan hane kapalıdır; tek rakip pul kırılır; tüm pullar
// evdeyken toplanır (tam zar ya da daha büyük zar + geride pul yoksa). Oynanabilecek en fazla zar
// oynanmak zorundadır; yalnızca biri oynanabiliyorsa büyük olan oynanır.

export type Color = 'w' | 'b';
export type From = number | 'bar';
export type To = number | 'off';
export interface Move { from: From; to: To; die: number }

export interface TavlaState {
  players: string[];                 // [beyaz, siyah]
  colors: Record<string, Color>;
  points: number[];
  bar: Record<Color, number>;
  off: Record<Color, number>;
  turn: number;                      // players indeksi
  phase: 'roll' | 'move' | 'end';
  dice: number[];                    // oynanmayı bekleyen zarlar
  rolled: number[];                  // atılan zarlar (gösterim)
  rollId: number;
  lastMoves: Move[];
  winner: string | null;
  mars: boolean;
  next: number;
}

export type TavlaAction = { type: 'roll' } | { type: 'move'; from: From; to: To };
export class TavlaError extends Error {}

export const TURN_MS = 40_000;

export function initialPoints(): number[] {
  const p = new Array(24).fill(0);
  p[23] = 2; p[12] = 5; p[7] = 3; p[5] = 5;        // beyaz
  p[0] = -2; p[11] = -5; p[16] = -3; p[18] = -5;   // siyah
  return p;
}

export function newGame(players: string[], now: number, rnd: () => number = Math.random): TavlaState {
  if (players.length !== 2) throw new TavlaError('Tavla 2 kişiliktir');
  return {
    players: [...players], colors: { [players[0]]: 'w', [players[1]]: 'b' },
    points: initialPoints(), bar: { w: 0, b: 0 }, off: { w: 0, b: 0 },
    turn: rnd() < 0.5 ? 0 : 1, phase: 'roll', dice: [], rolled: [], rollId: 0, lastMoves: [],
    winner: null, mars: false, next: now + TURN_MS,
  };
}

export const current = (s: TavlaState) => s.players[s.turn];
const colorOf = (s: TavlaState) => s.colors[current(s)];
const sign = (c: Color) => (c === 'w' ? 1 : -1);
const own = (v: number, c: Color) => v * sign(c) > 0;

type Board = { points: number[]; bar: Record<Color, number>; off: Record<Color, number> };
const clone = (b: Board): Board => ({ points: [...b.points], bar: { ...b.bar }, off: { ...b.off } });

function allHome(b: Board, c: Color) {
  if (b.bar[c]) return false;
  for (let i = 0; i < 24; i++) {
    if (!own(b.points[i], c)) continue;
    if (c === 'w' ? i > 5 : i < 18) return false;
  }
  return true;
}
/** Eve uzaklık (1..6) — toplamada kullanılır. */
const dist = (i: number, c: Color) => (c === 'w' ? i + 1 : 24 - i);

/** Tek zarla yapılabilecek hamleler. */
export function singleMoves(b: Board, c: Color, die: number): Move[] {
  const out: Move[] = [];
  const open = (i: number) => !(b.points[i] * -sign(c) >= 2);
  if (b.bar[c] > 0) {
    const to = c === 'w' ? 24 - die : die - 1;
    if (open(to)) out.push({ from: 'bar', to, die });
    return out;
  }
  const home = allHome(b, c);
  for (let i = 0; i < 24; i++) {
    if (!own(b.points[i], c)) continue;
    const to = c === 'w' ? i - die : i + die;
    if (to >= 0 && to <= 23) { if (open(to)) out.push({ from: i, to, die }); continue; }
    if (!home) continue;
    const d = dist(i, c);
    if (d === die) { out.push({ from: i, to: 'off', die }); continue; }
    // daha büyük zarla toplama: geride (daha uzakta) pul yoksa
    const farther = [...Array(24).keys()].some(j => own(b.points[j], c) && dist(j, c) > d);
    if (!farther) out.push({ from: i, to: 'off', die });
  }
  return out;
}

export function applyBoard(b: Board, c: Color, m: Move) {
  const sg = sign(c);
  if (m.from === 'bar') b.bar[c]--; else b.points[m.from] -= sg;
  if (m.to === 'off') { b.off[c]++; return; }
  if (b.points[m.to] * -sg === 1) { b.points[m.to] = 0; b.bar[c === 'w' ? 'b' : 'w']++; } // kırma
  b.points[m.to] += sg;
}

/** Kurallara uygun ilk hamleler (en fazla zarı kullanan dizilerin ilk adımları). */
export function legalMoves(b: Board, c: Color, dice: number[]): Move[] {
  let best = 0;
  const firsts: { m: Move; len: number; maxDie: number }[] = [];
  const dfs = (bd: Board, rem: number[], depth: number, first: Move | null, used: number[]) => {
    let moved = false;
    for (const d of [...new Set(rem)]) {
      for (const m of singleMoves(bd, c, d)) {
        moved = true;
        const nb = clone(bd); applyBoard(nb, c, m);
        const r = [...rem]; r.splice(r.indexOf(d), 1);
        dfs(nb, r, depth + 1, first ?? m, [...used, d]);
      }
    }
    if (!moved && first) {
      best = Math.max(best, depth);
      firsts.push({ m: first, len: depth, maxDie: Math.max(...used) });
    }
  };
  dfs(b, dice, 0, null, []);
  let ok = firsts.filter(f => f.len === best);
  // yalnızca tek zar oynanabiliyorsa (ve zarlar farklıysa) büyük zar oynanmalı
  if (best === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const big = Math.max(...dice);
    if (ok.some(f => f.m.die === big)) ok = ok.filter(f => f.m.die === big);
  }
  const seen = new Set<string>();
  return ok.map(f => f.m).filter(m => { const k = `${m.from}>${m.to}>${m.die}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

const boardOf = (s: TavlaState): Board => ({ points: s.points, bar: s.bar, off: s.off });
export const legal = (s: TavlaState) => (s.phase === 'move' ? legalMoves(boardOf(s), colorOf(s), s.dice) : []);

function endTurn(s: TavlaState, now: number) {
  s.turn = 1 - s.turn;
  s.phase = 'roll';
  s.dice = [];
  s.next = now + TURN_MS;
}

export function apply(s: TavlaState, by: string, a: TavlaAction, now: number, rnd: () => number = Math.random) {
  if (s.phase === 'end') throw new TavlaError('Oyun bitti');
  if (!s.players.includes(by)) throw new TavlaError('Oyuncu değilsin');
  if (current(s) !== by) throw new TavlaError('Sıra sende değil');
  if (a.type === 'roll') {
    if (s.phase !== 'roll') throw new TavlaError('Önce pullarını oyna');
    const d1 = Math.min(6, Math.floor(rnd() * 6) + 1), d2 = Math.min(6, Math.floor(rnd() * 6) + 1);
    s.rolled = [d1, d2];
    s.dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    s.rollId++;
    s.lastMoves = [];
    s.phase = 'move';
    s.next = now + TURN_MS;
    if (!legal(s).length) endTurn(s, now); // oynanacak hamle yok → sıra geçer
    return;
  }
  if (a.type !== 'move') throw new TavlaError('Geçersiz hamle');
  if (s.phase !== 'move') throw new TavlaError('Önce zar at');
  const opts = legal(s).filter(m => m.from === a.from && m.to === a.to);
  if (!opts.length) throw new TavlaError('Bu hamle yapılamaz');
  // aynı hamleyi farklı zarlarla yapmak mümkünse küçük zarı harca (büyüğü saklamak lehe)
  const m = opts.sort((x, y) => x.die - y.die)[0];
  const c = colorOf(s);
  applyBoard(boardOf(s), c, m);
  s.dice.splice(s.dice.indexOf(m.die), 1);
  s.lastMoves.push(m);
  if (s.off[c] >= 15) {
    s.phase = 'end';
    s.winner = by;
    s.mars = s.off[c === 'w' ? 'b' : 'w'] === 0;
    s.dice = [];
    s.next = 0;
    return;
  }
  if (!s.dice.length || !legal(s).length) endTurn(s, now);
}

/** Süre dolunca: zar atılır ve kurallara uygun hamleler sırayla oynanır. */
export function autoPlay(s: TavlaState, now: number, rnd: () => number = Math.random) {
  const p = current(s);
  if (s.phase === 'roll') apply(s, p, { type: 'roll' }, now, rnd);
  let guard = 0;
  while (s.phase === 'move' && current(s) === p && guard++ < 8) {
    const m = legal(s)[0];
    if (!m) { endTurn(s, now); break; }
    apply(s, p, { type: 'move', from: m.from, to: m.to }, now, rnd);
  }
}

/** Oyuncu ayrılınca diğeri kazanır. */
export function removePlayer(s: TavlaState, p: string) {
  if (!s.players.includes(p) || s.phase === 'end') return;
  s.phase = 'end';
  s.winner = s.players.find(x => x !== p) ?? null;
  s.next = 0;
}

export function viewFor(s: TavlaState) {
  return {
    players: s.players.map(p => ({ id: p, color: s.colors[p] })),
    points: s.points, bar: s.bar, off: s.off, turn: current(s), phase: s.phase,
    dice: s.dice, rolled: s.rolled, rollId: s.rollId, lastMoves: s.lastMoves,
    legal: legal(s).map(m => ({ from: m.from, to: m.to })), winner: s.winner, mars: s.mars, ends: s.next,
  };
}

// ---------------------------------------------------------------- bot
/** Bot: zarı atar, her adımda en iyi görünen kurallı hamleyi seçer (topla > kır > kendi pulunun yanına > ilerle). */
export function botMove(s: TavlaState, now: number, rnd: () => number = Math.random) {
  const p = current(s);
  if (s.phase === 'roll') apply(s, p, { type: 'roll' }, now, rnd);
  const c = colorOf(s);
  let guard = 0;
  while (s.phase === 'move' && current(s) === p && guard++ < 8) {
    const moves = legal(s);
    if (!moves.length) break;
    const score = (m: Move) => {
      if (m.to === 'off') return 100;
      let v = 0;
      const dest = s.points[m.to] * sign(c);
      if (dest === -1) v += 40;                 // rakip tek pulunu kır
      if (dest >= 1) v += 15;                   // kendi pulunun yanına (kapı)
      if (dest === 0) v -= 8;                   // açıkta tek pul bırakma
      if (m.from !== 'bar' && Math.abs(s.points[m.from]) === 2) v -= 6; // kapıyı bozma
      if (m.from === 'bar') v += 50;
      v += m.die;                               // ilerlemek iyi
      return v;
    };
    const best = moves.reduce((a, b) => (score(b) > score(a) ? b : a));
    apply(s, p, { type: 'move', from: best.from, to: best.to }, now, rnd);
  }
}
