import { describe, it, expect } from 'vitest';
import { newGame, apply, legal, legalMoves, singleMoves, autoPlay, removePlayer, viewFor, current, initialPoints, type TavlaState } from './tavla.ts';

/** Zarları sırayla veren rnd. */
const dice = (...v: number[]) => { let i = 0; return () => (v[i++ % v.length] - 1) / 6 + 0.01; };
function game(): TavlaState { const s = newGame(['W', 'B'], 0, () => 0.1); s.turn = 0; return s; }
const empty = () => ({ points: new Array(24).fill(0), bar: { w: 0, b: 0 }, off: { w: 0, b: 0 } });

describe('tavla', () => {
  it('başlangıç dizilişi 15+15', () => {
    const p = initialPoints();
    expect(p.filter(x => x > 0).reduce((a, b) => a + b, 0)).toBe(15);
    expect(p.filter(x => x < 0).reduce((a, b) => a - b, 0)).toBe(15);
    const s = game();
    expect(s.colors).toEqual({ W: 'w', B: 'b' });
    expect(() => newGame(['a'], 0)).toThrow();
  });

  it('zar, sıra ve kapalı hane', () => {
    const s = game();
    expect(() => apply(s, 'B', { type: 'roll' }, 0)).toThrow();
    apply(s, 'W', { type: 'roll' }, 0, dice(6, 5));
    expect(s.dice.sort()).toEqual([5, 6]);
    // 24 numaradan (idx 23) 5 ile idx 18'e: siyahın 5 pulu var → kapalı
    expect(legal(s).some(m => m.from === 23 && m.to === 18)).toBe(false);
    expect(() => apply(s, 'W', { type: 'move', from: 23, to: 18 }, 0)).toThrow();
    // 6-5: 23→17→12 klasik "lover's leap"
    apply(s, 'W', { type: 'move', from: 23, to: 17 }, 0);
    apply(s, 'W', { type: 'move', from: 17, to: 12 }, 0);
    expect(current(s)).toBe('B');
    expect(s.phase).toBe('roll');
  });

  it('çift zar 4 hamle', () => {
    const s = game();
    apply(s, 'W', { type: 'roll' }, 0, dice(3, 3));
    expect(s.dice).toEqual([3, 3, 3, 3]);
    for (let i = 0; i < 4; i++) { const m = legal(s)[0]; apply(s, 'W', { type: 'move', from: m.from, to: m.to }, 0); }
    expect(current(s)).toBe('B');
  });

  it('kırma ve bardan giriş zorunluluğu', () => {
    const b = empty();
    b.points[10] = 1; b.points[7] = -1; b.points[3] = 1;
    // beyaz 10→7 (3) siyahı kırar
    const s = game(); s.points = b.points; s.phase = 'move'; s.dice = [3, 1];
    s.off = { w: 13, b: 14 };
    apply(s, 'W', { type: 'move', from: 10, to: 7 }, 0);
    expect(s.bar.b).toBe(1);
    expect(s.points[7]).toBe(1);
    // siyah bardayken başka pul oynatamaz
    const moves = singleMoves({ points: s.points, bar: s.bar, off: s.off }, 'b', 4);
    expect(moves.every(m => m.from === 'bar')).toBe(true);
    expect(moves[0].to).toBe(3); // siyah 4 ile idx 3'e girer (orada tek beyaz → kırar)
  });

  it('toplama: tam zar ve büyük zar kuralı', () => {
    const b = empty();
    b.points[0] = 1; b.points[2] = 1;  // beyaz evde, 1. ve 3. hanede
    b.off.w = 13;
    const m6 = singleMoves(b, 'w', 6);
    expect(m6).toEqual([{ from: 2, to: 'off', die: 6 }]); // en uzaktaki pul büyük zarla toplanır
    const m1 = singleMoves(b, 'w', 1);
    expect(m1.some(m => m.from === 0 && m.to === 'off')).toBe(true);
    // evde olmayan pul varken toplanamaz
    b.points[8] = 1;
    expect(singleMoves(b, 'w', 6).some(m => m.to === 'off')).toBe(false);
  });

  it('yalnızca tek zar oynanabiliyorsa büyüğü oynanmalı', () => {
    const b = empty();
    // beyazın tek pulu idx 10'da; 6 ile idx 4 açık, 1 ile idx 9 kapalı; 6 sonrası 1 ile idx 3 kapalı
    b.points[10] = 1; b.points[9] = -2; b.points[3] = -2; b.points[5] = -2;
    // 5 ile idx 5 kapalı, 6 ile idx 4 açık → sadece 6 oynanabilir
    const lm = legalMoves(b, 'w', [6, 1]);
    expect(lm).toEqual([{ from: 10, to: 4, die: 6 }]);
  });

  it('oyun sonu ve mars', () => {
    const s = game();
    s.points = new Array(24).fill(0); s.points[0] = 1; s.points[20] = -15;
    s.off = { w: 14, b: 0 }; s.phase = 'move'; s.dice = [1, 2];
    apply(s, 'W', { type: 'move', from: 0, to: 'off' }, 0);
    expect(s.winner).toBe('W');
    expect(s.mars).toBe(true);
  });

  it('hamle yoksa sıra kendiliğinden geçer', () => {
    const s = game();
    s.points = new Array(24).fill(0); s.bar.w = 1; s.off = { w: 14, b: 0 };
    for (let i = 18; i < 24; i++) s.points[i] = -2; s.points[0] = -3; // beyazın giriş haneleri kapalı
    apply(s, 'W', { type: 'roll' }, 0, dice(2, 5));
    expect(current(s)).toBe('B');
  });

  it('otomatik oyun ve ayrılma', () => {
    const s = game();
    autoPlay(s, 0, dice(4, 2));
    expect(current(s)).toBe('B');
    expect(viewFor(s).phase).toBe('roll');
    removePlayer(s, 'B');
    expect(s.winner).toBe('W');
  });
});
