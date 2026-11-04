import { describe, it, expect } from 'vitest';
import { buildTiles, newGame, apply, autoPlay, removePlayer, checkHand, viewFor, privateFor, current, type Tile } from './okey.ts';

let nid = 1000;
const T = (c: number, n: number): Tile => ({ id: nid++, c, n });
const OKEY = { c: 3, n: 13 }; // siyah 13 okey
const W = () => T(3, 13);     // okey (joker)
const FAKE = () => T(4, 0);   // sahte okey = siyah 13

describe('okey', () => {
  it('106 taş', () => {
    const t = buildTiles();
    expect(t.length).toBe(106);
    expect(t.filter(x => x.c === 4).length).toBe(2);
  });

  it('dağıtım: başlayan 15, diğerleri 14', () => {
    const s = newGame(['a', 'b', 'c', 'd'], 0, () => 0.3);
    const counts = s.players.map(p => s.hands[p].length).sort();
    expect(counts).toEqual([14, 14, 14, 15]);
    expect(s.hands[current(s)].length).toBe(15);
    expect(s.phase).toBe('discard');
    expect(s.okey.n).toBe(s.indicator.n % 13 + 1);
    expect(s.pile.length).toBe(106 - 1 - 57);
    expect(JSON.stringify(viewFor(s))).not.toContain('"hands"');
  });

  it('per ve seri ile biten el', () => {
    const hand = [T(0, 1), T(0, 2), T(0, 3), T(0, 4), T(1, 7), T(2, 7), T(3, 7), T(0, 11), T(0, 12), T(0, 13), T(0, 1), T(1, 5), T(2, 5), T(0, 5)];
    expect(checkHand(hand, OKEY).ok).toBe(true); // 1234 + 777 + 12-13-1 + 555
  });

  it('okey joker yerine geçer, sahte okey okeyin değeridir', () => {
    const hand = [T(0, 1), W(), T(0, 3), T(1, 7), T(2, 7), T(3, 7), T(1, 9), T(1, 10), T(1, 11), T(1, 12), FAKE(), T(3, 12), T(3, 11), T(2, 4)];
    // 1-[2]-3, 777, 9-10-11-12, 11-12-13(sahte) ama 2'4 tek kaldı → bitmez
    expect(checkHand(hand, OKEY).ok).toBe(false);
    hand[13] = T(3, 10); // siyah 10-11-12-13(sahte)
    expect(checkHand(hand, OKEY).ok).toBe(true);
  });

  it('çifte', () => {
    const hand = [T(0, 1), T(0, 1), T(1, 2), T(1, 2), T(2, 3), T(2, 3), T(3, 4), T(3, 4), T(0, 9), T(0, 9), T(1, 11), T(1, 11), T(2, 6), W()];
    const r = checkHand(hand, OKEY);
    expect(r).toEqual({ ok: true, pairs: true });
    hand[13] = T(0, 8);
    expect(checkHand(hand, OKEY).ok).toBe(false);
  });

  it('bitmeyen el', () => {
    const hand = [T(0, 1), T(1, 2), T(2, 3), T(3, 4), T(0, 6), T(1, 8), T(2, 10), T(3, 12), T(0, 13), T(1, 13), T(2, 9), T(3, 1), T(0, 7), T(1, 4)];
    expect(checkHand(hand, OKEY).ok).toBe(false);
  });

  it('çek / at sırası ve soldakinin taşını alma', () => {
    const s = newGame(['a', 'b', 'c'], 0, () => 0.1);
    s.turn = 0;
    s.hands.a.push(s.pile.pop()!); s.phase = 'discard';
    expect(() => apply(s, 'b', { type: 'draw', from: 'pile' }, 0)).toThrow();
    expect(() => apply(s, 'a', { type: 'draw', from: 'pile' }, 0)).toThrow(); // önce atmalı
    const t = s.hands.a[0];
    apply(s, 'a', { type: 'discard', tile: t.id }, 0);
    expect(current(s)).toBe('b');
    expect(viewFor(s).canTake).toBe(true);
    apply(s, 'b', { type: 'draw', from: 'discard' }, 0);
    expect(s.hands.b.some(x => x.id === t.id)).toBe(true);
    expect(privateFor(s, 'b').drawn).toBe(t.id);
    expect(() => apply(s, 'b', { type: 'finish', tile: t.id }, 0)).toThrow('Elin henüz bitmedi');
  });

  it('elini bitiren kazanır', () => {
    const s = newGame(['a', 'b'], 0, () => 0.1);
    s.okey = OKEY; s.turn = 0; s.phase = 'discard';
    s.hands.a = [T(0, 1), T(0, 2), T(0, 3), T(0, 4), T(1, 7), T(2, 7), T(3, 7), T(0, 11), T(0, 12), T(0, 13), T(0, 1), T(1, 5), T(2, 5), T(0, 5), T(2, 2)];
    const extra = s.hands.a[14];
    apply(s, 'a', { type: 'finish', tile: extra.id }, 0);
    expect(s.winner).toBe('a');
    expect(viewFor(s).winHand?.length).toBe(14);
  });

  it('otomatik oyun ve ayrılma', () => {
    const s = newGame(['a', 'b', 'c'], 0, () => 0.1);
    const p = current(s);
    autoPlay(s, 0);
    expect(current(s)).not.toBe(p);
    autoPlay(s, 0); // çek + at
    expect(s.phase).toBe('draw');
    const before = s.pile.length;
    removePlayer(s, s.players[0], 0);
    expect(s.players.length).toBe(2);
    expect(s.pile.length).toBeGreaterThan(before);
  });
});
