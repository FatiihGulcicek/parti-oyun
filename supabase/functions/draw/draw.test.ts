import { describe, it, expect } from 'vitest';
import { newGame, apply, tick, removePlayer, viewFor, privateFor, norm, levenshtein, totalTurns, CHOOSE_MS, DRAW_MS, REVEAL_MS } from './draw.ts';
import { WORDS } from './words.ts';

const W = ['elma', 'kedi', 'araba', 'güneş', 'deniz feneri', 'balık'];
const rnd = (() => { let x = 7; return () => { x = (x * 1103515245 + 12345) % 2 ** 31; return x / 2 ** 31; }; })();

describe('çiz-tahmin', () => {
  it('kelime havuzu tekrarsız ve yeterli', () => {
    expect(new Set(WORDS).size).toBe(WORDS.length);
    expect(WORDS.length).toBeGreaterThan(100);
  });

  it('sadeleştirme ve yakınlık', () => {
    expect(norm('Güneş')).toBe(norm('gunes'));
    expect(norm('DENİZ Feneri')).toBe(norm('denizfeneri'));
    expect(norm('IŞIK')).toBe(norm('ışık'));
    expect(levenshtein('kedi', 'kedy')).toBe(1);
  });

  it('başlangıç: ilk oyuncu kelime seçer, seçenekler gizli', () => {
    const s = newGame(['a', 'b', 'c'], W, 0, rnd);
    expect(s.phase).toBe('choose');
    expect(s.drawer).toBe('a');
    expect(s.choices.length).toBe(3);
    expect(privateFor(s, 'a')).toEqual({ choices: s.choices });
    expect(privateFor(s, 'b')).toEqual({});
    expect(JSON.stringify(viewFor(s))).not.toContain(s.choices[0]);
    expect(totalTurns(s)).toBe(6); // 3 oyuncu × 2 tur
    expect(() => newGame(['a'], W, 0)).toThrow();
  });

  it('seçim, tahmin ve puanlama', () => {
    const s = newGame(['a', 'b', 'c'], W, 0, rnd);
    expect(() => apply(s, 'b', { type: 'choose', index: 0 }, 1000)).toThrow();
    apply(s, 'a', { type: 'choose', index: 1 }, 1000);
    const word = s.word;
    expect(s.phase).toBe('draw');
    expect(viewFor(s).mask.join('')).toMatch(/^[_ ]+$/);
    expect(privateFor(s, 'a')).toEqual({ word });
    expect(() => apply(s, 'a', { type: 'guess', text: word }, 2000)).toThrow(); // çizen tahmin edemez
    expect(apply(s, 'b', { type: 'guess', text: 'yanlış' }, 2000)).toBe('wrong');
    expect(apply(s, 'b', { type: 'guess', text: word.toLocaleUpperCase('tr-TR') }, 2000)).toBe('correct');
    expect(s.scores.b).toBeGreaterThan(100);
    expect(() => apply(s, 'b', { type: 'guess', text: word }, 2500)).toThrow(); // zaten bildi
    // doğru tahmin metni akışta görünmez
    expect(JSON.stringify(viewFor(s).feed)).not.toContain(word);
    apply(s, 'c', { type: 'guess', text: word }, 40_000);
    expect(s.scores.c).toBeLessThan(s.scores.b);
    // herkes bildi → tur biter, çizer puan alır
    expect(s.phase).toBe('reveal');
    expect(s.scores.a).toBe(50);
    expect(viewFor(s).word).toBe(word);
  });

  it('yakın tahmin', () => {
    const s = newGame(['a', 'b'], ['kaplan', 'kedi', 'elma'], 0, () => 0);
    apply(s, 'a', { type: 'choose', index: s.choices.indexOf('kaplan') }, 0);
    expect(apply(s, 'b', { type: 'guess', text: 'kaplam' }, 100)).toBe('close');
    expect(JSON.stringify(viewFor(s).feed)).not.toContain('kaplam');
  });

  it('zamanlayıcı: otomatik seçim, ipuçları, tur sonu, oyun sonu', () => {
    const s = newGame(['a', 'b'], W, 0, rnd);
    expect(tick(s, W, 1000, rnd)).toBe(false); // erken
    tick(s, W, CHOOSE_MS, rnd);
    expect(s.phase).toBe('draw');
    const t0 = s.drawStart;
    tick(s, W, t0 + DRAW_MS * 0.5, rnd);
    expect(s.revealed.length).toBe(1);
    tick(s, W, t0 + DRAW_MS * 0.75, rnd);
    expect(s.revealed.length).toBe(2);
    tick(s, W, t0 + DRAW_MS, rnd);
    expect(s.phase).toBe('reveal');
    expect(s.scores.a).toBe(0); // kimse bilemedi
    let now = t0 + DRAW_MS + REVEAL_MS;
    tick(s, W, now, rnd);
    expect(s.phase).toBe('choose');
    expect(s.drawer).toBe('b');
    // kalan turları hızla bitir
    for (let i = 0; i < 40 && !s.winner; i++) { now = s.next; tick(s, W, now, rnd); }
    expect(s.phase).toBe('end');
    expect(s.winner).not.toBeNull();
    expect(s.used.length).toBe(totalTurns(s));
  });

  it('çizer ayrılırsa tur yeniden başlar, tek kişi kalırsa biter', () => {
    const s = newGame(['a', 'b', 'c'], W, 0, rnd);
    apply(s, 'a', { type: 'choose', index: 0 }, 0);
    removePlayer(s, 'a', W, 100, rnd);
    expect(s.phase).toBe('choose');
    expect(s.players).toEqual(['b', 'c']);
    expect(s.drawer).toBe('b');
    removePlayer(s, 'c', W, 200, rnd);
    expect(s.phase).toBe('end');
    expect(s.winner).toBe('b');
  });
});
