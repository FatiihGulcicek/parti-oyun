import { describe, it, expect } from 'vitest';
import { newGame, apply, tick, removePlayer, viewFor, privateFor, currentCluer, CLUE_MS, VOTE_MS, type SpyState } from './spy.ts';
import { CATEGORIES } from './words.ts';

const CATS = [{ name: 'Hayvan', words: ['kedi'] }];
function game(players = ['a', 'b', 'c', 'd', 'e']): SpyState {
  const s = newGame(players, CATS, 0, () => 0.1);
  s.spy = 'c';
  s.order = [...players];
  return s;
}
function allClues(s: SpyState, t = 100) {
  while (s.phase === 'clue') apply(s, currentCluer(s)!, { type: 'clue', text: 'ipucu' }, t);
}

describe('casus kim', () => {
  it('kategoriler dolu ve tekrarsız', () => {
    for (const c of CATEGORIES) expect(new Set(c.words).size).toBe(c.words.length);
  });

  it('başlangıç ve gizli bilgiler', () => {
    const s = game();
    expect(s.rounds).toBe(1);
    expect(privateFor(s, 'c')).toEqual({ spy: true, category: 'Hayvan' });
    expect(privateFor(s, 'a')).toEqual({ spy: false, category: 'Hayvan', word: 'kedi' });
    const v = JSON.stringify(viewFor(s));
    expect(v).not.toContain('kedi');
    expect(viewFor(s).spy).toBeNull();
    expect(() => newGame(['a', 'b'], CATS, 0)).toThrow();
    expect(newGame(['a', 'b', 'c'], CATS, 0).rounds).toBe(2);
  });

  it('ipucu sırası ve kelimeyi söyleme yasağı', () => {
    const s = game();
    expect(() => apply(s, 'b', { type: 'clue', text: 'x' }, 0)).toThrow();
    expect(() => apply(s, 'a', { type: 'clue', text: 'KEDİ gibi' }, 0)).toThrow();
    apply(s, 'a', { type: 'clue', text: 'miyav' }, 0);
    expect(currentCluer(s)).toBe('b');
  });

  it('casus yakalanır ve kelimeyi bilemezse diğerleri kazanır', () => {
    const s = game();
    allClues(s);
    expect(s.phase).toBe('vote');
    expect(() => apply(s, 'a', { type: 'vote', target: 'a' }, 0)).toThrow();
    for (const p of ['a', 'b', 'd', 'e']) apply(s, p, { type: 'vote', target: 'c' }, 0);
    apply(s, 'c', { type: 'vote', target: 'a' }, 0);
    expect(s.phase).toBe('guess');
    expect(() => apply(s, 'a', { type: 'guess', text: 'kedi' }, 0)).toThrow();
    apply(s, 'c', { type: 'guess', text: 'köpek' }, 0);
    expect(s.spyWon).toBe(false);
    expect(s.winners).toEqual(['a', 'b', 'd', 'e']);
    expect(viewFor(s).spy).toBe('c');
    expect(viewFor(s).word).toBe('kedi');
  });

  it('casus yakalanır ama kelimeyi bilirse kazanır', () => {
    const s = game();
    allClues(s);
    for (const p of ['a', 'b', 'd', 'e', 'c']) apply(s, p, { type: 'vote', target: p === 'c' ? 'a' : 'c' }, 0);
    apply(s, 'c', { type: 'guess', text: 'KEDI' }, 0);
    expect(s.spyWon).toBe(true);
    expect(s.winner).toBe('c');
  });

  it('yanlış kişi ya da eşitlik → casus kazanır', () => {
    const s = game();
    allClues(s);
    for (const p of ['a', 'b', 'c', 'd', 'e']) apply(s, p, { type: 'vote', target: p === 'a' ? 'b' : 'a' }, 0);
    expect(s.spyWon).toBe(true);
    expect(s.reason).toBe('wrong');
    const t = game();
    allClues(t);
    apply(t, 'a', { type: 'vote', target: 'b' }, 0); apply(t, 'b', { type: 'vote', target: 'a' }, 0);
    tick(t, VOTE_MS + 1000);
    expect(t.reason).toBe('tie');
  });

  it('süre dolunca ipucu pas geçilir', () => {
    const s = game();
    expect(tick(s, 100)).toBe(false);
    tick(s, CLUE_MS);
    expect(s.clues[0]).toMatchObject({ by: 'a', text: '…' });
    expect(currentCluer(s)).toBe('b');
  });

  it('oyuncu ayrılması', () => {
    const s = game();
    apply(s, 'a', { type: 'clue', text: 'x' }, 0);
    removePlayer(s, 'b', 10); // sıradaki kişi gitti
    expect(currentCluer(s)).toBe('c');
    removePlayer(s, 'c', 20); // casus gitti
    expect(s.phase).toBe('end');
    expect(s.spyWon).toBe(false);
  });
});
