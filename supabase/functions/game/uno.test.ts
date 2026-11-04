import { describe, it, expect } from 'vitest';
import { buildDeck, newGame, apply, canPlay, viewFor, autoMove, removePlayer, UnoState, Card, current } from './uno.ts';

function seeded(seed = 42) {
  return () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
}
function setTop(s: UnoState, c: Card) { s.discard.push(c); s.color = c.color as any; }
const C = (id: number, color: any, value: any): Card => ({ id: 1000 + id, color, value });

describe('uno', () => {
  it('deste 108 kart', () => {
    const d = buildDeck();
    expect(d.length).toBe(108);
    expect(new Set(d.map(c => c.id)).size).toBe(108);
    expect(d.filter(c => c.value === 'wild4').length).toBe(4);
  });

  it('dağıtım ve başlangıç', () => {
    const s = newGame(['a', 'b', 'c'], seeded());
    expect(s.hands.a.length).toBe(7);
    expect(/^[0-9]$/.test(s.discard[0].value)).toBe(true);
    expect(s.deck.length + 21 + 1).toBe(108);
  });

  it('sıra dışı oynayamaz, uygunsuz kart oynanamaz', () => {
    const s = newGame(['a', 'b'], seeded());
    setTop(s, C(1, 'red', '5'));
    s.hands.a = [C(2, 'blue', '7'), C(3, 'red', '9')];
    expect(() => apply(s, 'b', { type: 'draw' })).toThrow();
    expect(() => apply(s, 'a', { type: 'play', cardId: 1002 })).toThrow();
    apply(s, 'a', { type: 'play', cardId: 1003, uno: true });
    expect(current(s)).toBe('b');
  });

  it('skip, reverse, draw2, wild4', () => {
    const s = newGame(['a', 'b', 'c'], seeded());
    setTop(s, C(1, 'red', '5'));
    s.hands.a = [C(2, 'red', 'skip'), C(9, 'red', '1'), C(10, 'red', '2')];
    apply(s, 'a', { type: 'play', cardId: 1002 });
    expect(current(s)).toBe('c');
    s.hands.c = [C(3, 'red', 'reverse'), C(11, 'red', '1'), C(12, 'red', '2')];
    apply(s, 'c', { type: 'play', cardId: 1003 });
    expect(s.direction).toBe(-1);
    expect(current(s)).toBe('b');
    const bBefore = s.hands.a.length;
    s.hands.b = [C(4, 'red', 'draw2'), C(13, 'red', '1'), C(14, 'red', '2')];
    apply(s, 'b', { type: 'play', cardId: 1004 });
    expect(s.hands.a.length).toBe(bBefore + 2);
    expect(current(s)).toBe('c'); // a atlandı
    s.hands.c.push(C(5, 'wild', 'wild4'));
    expect(() => apply(s, 'c', { type: 'play', cardId: 1005 })).toThrow(); // renk yok
    const bCount = s.hands.b.length;
    apply(s, 'c', { type: 'play', cardId: 1005, chosenColor: 'green' });
    expect(s.color).toBe('green');
    expect(s.hands.b.length).toBe(bCount + 4);
    expect(current(s)).toBe('a');
  });

  it('2 kişide reverse = skip', () => {
    const s = newGame(['a', 'b'], seeded());
    setTop(s, C(1, 'red', '5'));
    s.hands.a = [C(2, 'red', 'reverse'), C(3, 'red', '1'), C(4, 'red', '2')];
    apply(s, 'a', { type: 'play', cardId: 1002 });
    expect(current(s)).toBe('a');
  });

  it('çek → oynanamazsa otomatik pas; oynanabilirse sadece o kart', () => {
    const s = newGame(['a', 'b'], seeded());
    setTop(s, C(1, 'red', '5'));
    s.hands.a = [C(2, 'blue', '7')];
    s.deck.push(C(3, 'green', '8'));
    apply(s, 'a', { type: 'draw' });
    expect(current(s)).toBe('b');
    s.hands.b = [C(4, 'red', '1'), C(6, 'blue', '2')];
    s.deck.push(C(5, 'red', '9'));
    apply(s, 'b', { type: 'draw' });
    expect(current(s)).toBe('b');
    expect(() => apply(s, 'b', { type: 'play', cardId: 1004 })).toThrow();
    apply(s, 'b', { type: 'play', cardId: 1005 });
    expect(current(s)).toBe('a');
  });

  it('UNO yakalama', () => {
    const s = newGame(['a', 'b', 'c'], seeded());
    setTop(s, C(1, 'red', '5'));
    s.hands.a = [C(2, 'red', '6'), C(3, 'blue', '1')];
    apply(s, 'a', { type: 'play', cardId: 1002 });
    expect(s.unoVulnerable).toBe('a');
    apply(s, 'c', { type: 'catch', target: 'a' });
    expect(s.hands.a.length).toBe(3);
    // UNO diyen yakalanamaz
    s.hands.b = [C(4, 'red', '7'), C(5, 'red', '8')];
    apply(s, 'b', { type: 'play', cardId: 1004, uno: true });
    expect(s.unoVulnerable).toBe(null);
    expect(() => apply(s, 'a', { type: 'catch', target: 'b' })).toThrow();
  });

  it('kazanma', () => {
    const s = newGame(['a', 'b'], seeded());
    setTop(s, C(1, 'red', '5'));
    s.hands.a = [C(2, 'red', '6')];
    apply(s, 'a', { type: 'play', cardId: 1002 });
    expect(s.winner).toBe('a');
    expect(() => apply(s, 'b', { type: 'draw' })).toThrow();
  });

  it('görünüm rakip kartlarını gizler', () => {
    const s = newGame(['a', 'b'], seeded());
    const v = viewFor(s, 'a') as any;
    expect(v.myHand.length).toBe(7);
    expect(JSON.stringify(v)).not.toContain('"hands"');
    expect(v.players[1]).toEqual({ id: 'b', count: 7, saidUno: false });
  });

  it('otomatik hamle ve oyuncu ayrılması', () => {
    const s = newGame(['a', 'b', 'c'], seeded());
    autoMove(s);
    expect(current(s)).toBe('b');
    removePlayer(s, 'b');
    expect(current(s)).toBe('c');
    removePlayer(s, 'c');
    expect(s.winner).toBe('a');
  });

  it('rastgele 500 oyun tutarlılığı', () => {
    for (let g = 0; g < 500; g++) {
      const rnd = seeded(g + 1);
      const n = 2 + (g % 5);
      const ps = Array.from({ length: n }, (_, i) => 'p' + i);
      const s = newGame(ps, rnd);
      let steps = 0;
      while (!s.winner && steps++ < 3000) {
        const p = current(s);
        const playable = s.hands[p].filter(c => canPlay(s, c) && (!s.drewThisTurn || c.id === s.hands[p][s.hands[p].length - 1].id));
        if (playable.length) apply(s, p, { type: 'play', cardId: playable[0].id, chosenColor: 'blue', uno: true });
        else if (!s.drewThisTurn) apply(s, p, { type: 'draw' });
        else apply(s, p, { type: 'pass' });
        const total = s.deck.length + s.discard.length + ps.reduce((a, q) => a + s.hands[q].length, 0);
        expect(total).toBe(108);
      }
    }
  });
});
