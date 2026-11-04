import { describe, it, expect } from 'vitest';
import {
  newGame, apply, legalMoves, autoMove, removePlayer, viewFor, current, trackIndex, colorsFor,
  LudoState, HOME, GOAL, START,
} from './ludo.ts';

/** Belirli zar değerlerini sırayla döndüren rnd. */
function dice(...vals: number[]) {
  let i = 0;
  return () => (vals[i++ % vals.length] - 1) / 6 + 0.01;
}
const roll = (s: LudoState, by: string, v: number) => apply(s, by, { type: 'roll' }, dice(v));
const move = (s: LudoState, by: string, token: number) => apply(s, by, { type: 'move', token });

describe('ludo', () => {
  it('başlangıç ve renkler', () => {
    const s = newGame(['a', 'b']);
    expect(s.colors).toEqual({ a: 'red', b: 'yellow' });
    expect(s.tokens.a).toEqual([HOME, HOME, HOME, HOME]);
    expect(colorsFor(3)).toEqual(['red', 'green', 'yellow']);
    expect(colorsFor(4).length).toBe(4);
    expect(() => newGame(['a'])).toThrow();
    expect(() => newGame(['a', 'b', 'c', 'd', 'e'])).toThrow();
  });

  it('pist karesi hesabı', () => {
    expect(trackIndex('red', 0)).toBe(0);
    expect(trackIndex('green', 0)).toBe(START.green);
    expect(trackIndex('blue', 20)).toBe((39 + 20) % 52);
    expect(trackIndex('red', 51)).toBeNull();
    expect(trackIndex('red', HOME)).toBeNull();
  });

  it('6 atmadan evden çıkılmaz, hamlesi yoksa sıra geçer', () => {
    const s = newGame(['a', 'b']);
    expect(() => roll(s, 'b', 3)).toThrow(); // sıra a'da
    roll(s, 'a', 3);
    expect(s.lastAction?.type).toBe('skip');
    expect(current(s)).toBe('b');
    expect(s.dice).toBeNull();
  });

  it('6 ile çıkış ve tekrar atma hakkı', () => {
    const s = newGame(['a', 'b']);
    roll(s, 'a', 6);
    expect(legalMoves(s)).toEqual([0, 1, 2, 3]);
    expect(() => roll(s, 'a', 2)).toThrow(); // önce oynamalı
    move(s, 'a', 0);
    expect(s.tokens.a[0]).toBe(0);
    expect(current(s)).toBe('a'); // bonus
    roll(s, 'a', 4);
    expect(legalMoves(s)).toEqual([0]);
    move(s, 'a', 0);
    expect(s.tokens.a[0]).toBe(4);
    expect(current(s)).toBe('b');
  });

  it('geçersiz taş oynanamaz', () => {
    const s = newGame(['a', 'b']);
    s.tokens.a = [5, HOME, HOME, HOME];
    roll(s, 'a', 3);
    expect(() => move(s, 'a', 1)).toThrow();
    expect(() => move(s, 'a', 7)).toThrow();
    expect(() => move(s, 'b', 0)).toThrow();
  });

  it('rakip taşı kırılır ve bonus verir', () => {
    const s = newGame(['a', 'b']); // red, yellow
    // yellow taşı pist 30'da (ilerleme 4), red ilerleme 28 → pist 28; 2 atınca 30
    s.tokens.b = [4, HOME, HOME, HOME];
    s.tokens.a = [28, HOME, HOME, HOME];
    roll(s, 'a', 2);
    move(s, 'a', 0);
    expect(s.tokens.b[0]).toBe(HOME);
    expect(s.lastAction?.captured).toEqual([{ player: 'b', token: 0 }]);
    expect(current(s)).toBe('a');
  });

  it('güvenli karede kırma olmaz', () => {
    const s = newGame(['a', 'b']);
    s.tokens.b = [0, HOME, HOME, HOME]; // yellow başlangıcı = pist 26 (güvenli)
    s.tokens.a = [24, HOME, HOME, HOME];
    roll(s, 'a', 2);
    move(s, 'a', 0);
    expect(s.tokens.b[0]).toBe(0);
    expect(current(s)).toBe('b');
  });

  it('koridorda kırma olmaz, bitişe tam zar gerekir', () => {
    const s = newGame(['a', 'b']);
    s.tokens.a = [53, HOME, HOME, HOME];
    roll(s, 'a', 5); // 58 > 56
    expect(s.lastAction?.type).toBe('skip');
    expect(s.tokens.a[0]).toBe(53);
    s.turn = 0;
    roll(s, 'a', 3);
    move(s, 'a', 0);
    expect(s.tokens.a[0]).toBe(GOAL);
    expect(current(s)).toBe('a'); // bitirince bonus
  });

  it('art arda üç 6 sırayı yakar', () => {
    const s = newGame(['a', 'b']);
    s.tokens.a = [10, HOME, HOME, HOME];
    roll(s, 'a', 6); move(s, 'a', 0);
    roll(s, 'a', 6); move(s, 'a', 0);
    roll(s, 'a', 6);
    expect(s.lastAction?.reason).toBe('three_sixes');
    expect(current(s)).toBe('b');
    expect(s.tokens.a[0]).toBe(22);
  });

  it('dört taşı bitiren kazanır', () => {
    const s = newGame(['a', 'b', 'c']);
    s.tokens.a = [GOAL, GOAL, GOAL, 52];
    roll(s, 'a', 4);
    move(s, 'a', 3);
    expect(s.winner).toBe('a');
    expect(() => roll(s, 'a', 1)).toThrow();
  });

  it('otomatik hamle kırmayı tercih eder', () => {
    const s = newGame(['a', 'b']);
    s.tokens.a = [28, 40, HOME, HOME];
    s.tokens.b = [4, HOME, HOME, HOME]; // pist 30
    autoMove(s, dice(2));
    expect(s.tokens.a).toEqual([30, 40, HOME, HOME]);
    expect(s.tokens.b[0]).toBe(HOME);
  });

  it('otomatik hamle: oynanacak taş yoksa sıra geçer', () => {
    const s = newGame(['a', 'b']);
    autoMove(s, dice(2));
    expect(current(s)).toBe('b');
  });

  it('oyuncu ayrılınca sıra düzelir, tek kalan kazanır', () => {
    const s = newGame(['a', 'b', 'c']);
    s.turn = 1;
    removePlayer(s, 'b');
    expect(current(s)).toBe('c');
    expect(s.tokens.b).toBeUndefined();
    removePlayer(s, 'a');
    expect(s.winner).toBe('c');
  });

  it('görünüm', () => {
    const s = newGame(['a', 'b']);
    roll(s, 'a', 6);
    const v = viewFor(s);
    expect(v.dice).toBe(6);
    expect(v.legal).toEqual([0, 1, 2, 3]);
    expect(v.rollId).toBe(1);
    expect(v.players[1]).toEqual({ id: 'b', color: 'yellow', tokens: [HOME, HOME, HOME, HOME] });
  });
});
