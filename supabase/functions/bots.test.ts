import { describe, it, expect } from 'vitest';
import * as Uno from './game/uno.ts';
import * as Ludo from './ludo/ludo.ts';
import * as Tavla from './tavla/tavla.ts';
import * as Okey from './okey/okey.ts';

const seeded = (seed: number) => () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };

describe('botlar: yalnızca botlardan oluşan masalar oyunu bitirir', () => {
  it('Uno', () => {
    for (let k = 1; k <= 20; k++) {
      const s = Uno.newGame(['a', 'b', 'c'], seeded(k));
      let n = 0;
      while (!s.winner && n++ < 3000) Uno.botMove(s);
      expect(s.winner, `tohum ${k}`).not.toBeNull();
    }
  });

  it('Uno botu son kartta UNO der ve joker rengini elindeki çok renkten seçer', () => {
    const s = Uno.newGame(['a', 'b'], seeded(3));
    s.discard.push({ id: 900, color: 'red', value: '5' }); s.color = 'red';
    s.hands.a = [{ id: 901, color: 'wild', value: 'wild' }, { id: 902, color: 'blue', value: '7' }, { id: 903, color: 'blue', value: '8' }];
    Uno.botMove(s);
    expect(s.color).toBe('blue');
    s.turn = 0; s.discard.push({ id: 904, color: 'blue', value: '1' }); s.color = 'blue';
    Uno.botMove(s);
    expect(s.saidUno).toContain('a');
  });

  it('Ludo', () => {
    for (let k = 1; k <= 10; k++) {
      const s = Ludo.newGame(['a', 'b', 'c', 'd']);
      const r = seeded(k);
      let n = 0;
      while (!s.winner && n++ < 20000) Ludo.autoMove(s, r);
      expect(s.winner, `tohum ${k}`).not.toBeNull();
    }
  });

  it('Tavla', () => {
    for (let k = 1; k <= 10; k++) {
      const r = seeded(k);
      const s = Tavla.newGame(['a', 'b'], 0, r);
      let n = 0;
      while (!s.winner && n++ < 3000) Tavla.botMove(s, 0, r);
      expect(s.winner, `tohum ${k}`).not.toBeNull();
    }
  });

  it('Okey: bot takılmaz; elini bitiren olursa doğru biter', () => {
    let finished = 0;
    for (let k = 1; k <= 15; k++) {
      const r = seeded(k);
      const s = Okey.newGame(['a', 'b', 'c', 'd'], 0, r);
      let n = 0;
      while (s.phase !== 'end' && n++ < 600) Okey.botMove(s, 0, r);
      if (s.winner) { finished++; expect(Okey.checkHand(s.winHand!, s.okey).ok).toBe(true); }
      // her durumda kurallar bozulmamış olmalı: taş sayısı korunur
      const total = s.pile.length + 1 + Object.values(s.hands).reduce((a, h) => a + h.length, 0) + Object.values(s.discards).reduce((a, d) => a + d.length, 0);
      expect(total).toBe(106);
    }
    expect(finished).toBeGreaterThan(0);
  });
});
