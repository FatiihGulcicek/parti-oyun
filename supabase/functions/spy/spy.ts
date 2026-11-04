// Sunucu-otoriter "Casus Kim?" motoru. Saf mantık: zaman dışarıdan (`now`) verilir.
//
// Akış: clue (herkes sırayla kısa bir ipucu yazar; 4 ve daha az kişide 2 tur) → vote (herkes bir şüpheliye
// oy verir) → [casus yakalandıysa] guess (casus kelimeyi tahmin eder) → end.
// Kazanan: casus yakalanmazsa ya da kelimeyi bilirse casus, aksi halde diğer herkes.

export const CLUE_MS = 30_000;
export const VOTE_MS = 40_000;
export const GUESS_MS = 25_000;

export type Phase = 'clue' | 'vote' | 'guess' | 'end';
export interface Clue { by: string; text: string; round: number }

export interface SpyState {
  players: string[];
  order: string[];            // ipucu sırası
  spy: string;
  category: string;
  word: string;
  phase: Phase;
  rounds: number;
  clueRound: number;          // 1'den
  cluer: number;              // order içindeki sıra
  clues: Clue[];
  votes: Record<string, string>;
  accused: string | null;
  tally: Record<string, number>;
  spyGuess: string | null;
  spyWon: boolean | null;
  winners: string[];
  winner: string | null;      // game_public için temsilci (kazananlardan ilki)
  next: number;
  reason: string | null;
}

export type SpyAction = { type: 'clue'; text: string } | { type: 'vote'; target: string } | { type: 'guess'; text: string };
export class SpyError extends Error {}

export function norm(t: string): string {
  return t.toLocaleLowerCase('tr-TR')
    .replace(/[çc]/g, 'c').replace(/[ğg]/g, 'g').replace(/[ıi]/g, 'i').replace(/[öo]/g, 'o').replace(/[şs]/g, 's').replace(/[üu]/g, 'u')
    .replace(/[^a-z0-9]/g, '');
}

export function newGame(players: string[], cats: { name: string; words: string[] }[], now: number, rnd: () => number = Math.random): SpyState {
  if (players.length < 3 || players.length > 8) throw new SpyError('3-8 oyuncu gerekli');
  const cat = cats[Math.floor(rnd() * cats.length)];
  const word = cat.words[Math.floor(rnd() * cat.words.length)];
  const order = [...players];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return {
    players: [...players], order, spy: players[Math.floor(rnd() * players.length)], category: cat.name, word,
    phase: 'clue', rounds: players.length <= 4 ? 2 : 1, clueRound: 1, cluer: 0, clues: [], votes: {}, accused: null, tally: {},
    spyGuess: null, spyWon: null, winners: [], winner: null, next: now + CLUE_MS, reason: null,
  };
}

export const currentCluer = (s: SpyState) => (s.phase === 'clue' ? s.order[s.cluer] : null);

function finish(s: SpyState, spyWon: boolean, reason: string) {
  s.phase = 'end';
  s.spyWon = spyWon;
  s.reason = reason;
  s.winners = spyWon ? [s.spy] : s.players.filter(p => p !== s.spy);
  s.winner = s.winners[0] ?? null;
  s.next = 0;
}

function advanceClue(s: SpyState, now: number) {
  s.cluer++;
  if (s.cluer >= s.order.length) {
    if (s.clueRound < s.rounds) { s.clueRound++; s.cluer = 0; }
    else { s.phase = 'vote'; s.next = now + VOTE_MS; return; }
  }
  s.next = now + CLUE_MS;
}

function tallyVotes(s: SpyState, now: number) {
  const t: Record<string, number> = {};
  for (const v of Object.values(s.votes)) if (s.players.includes(v)) t[v] = (t[v] ?? 0) + 1;
  s.tally = t;
  const max = Math.max(0, ...Object.values(t));
  const top = Object.keys(t).filter(k => t[k] === max);
  if (max === 0 || top.length > 1) { finish(s, true, 'tie'); return; }
  s.accused = top[0];
  if (s.accused !== s.spy) { finish(s, true, 'wrong'); return; }
  s.phase = 'guess';
  s.next = now + GUESS_MS;
}

export function apply(s: SpyState, by: string, a: SpyAction, now: number): void {
  if (s.phase === 'end') throw new SpyError('Oyun bitti');
  if (!s.players.includes(by)) throw new SpyError('Oyuncu değilsin');
  if (a.type === 'clue') {
    if (s.phase !== 'clue') throw new SpyError('İpucu zamanı değil');
    if (currentCluer(s) !== by) throw new SpyError('Sıra sende değil');
    const text = String(a.text ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!text) throw new SpyError('Boş ipucu');
    if (by !== s.spy && norm(text).includes(norm(s.word))) throw new SpyError('Kelimeyi doğrudan söyleyemezsin!');
    s.clues.push({ by, text, round: s.clueRound });
    advanceClue(s, now);
    return;
  }
  if (a.type === 'vote') {
    if (s.phase !== 'vote') throw new SpyError('Oylama zamanı değil');
    if (a.target === by) throw new SpyError('Kendine oy veremezsin');
    if (!s.players.includes(a.target)) throw new SpyError('Geçersiz oy');
    s.votes[by] = a.target;
    if (s.players.every(p => s.votes[p])) tallyVotes(s, now);
    return;
  }
  if (a.type === 'guess') {
    if (s.phase !== 'guess') throw new SpyError('Tahmin zamanı değil');
    if (by !== s.spy) throw new SpyError('Sadece casus tahmin eder');
    const g = String(a.text ?? '').trim().slice(0, 40);
    if (!g) throw new SpyError('Boş tahmin');
    s.spyGuess = g;
    finish(s, norm(g) === norm(s.word), norm(g) === norm(s.word) ? 'guessed' : 'caught');
    return;
  }
  throw new SpyError('Geçersiz hamle');
}

/** Süre dolunca: ipucu pas geçilir / oylar sayılır / casus tahminsiz kalır. */
export function tick(s: SpyState, now: number): boolean {
  if (s.phase === 'end' || now < s.next - 500) return false;
  if (s.phase === 'clue') { s.clues.push({ by: s.order[s.cluer], text: '…', round: s.clueRound }); advanceClue(s, now); }
  else if (s.phase === 'vote') tallyVotes(s, now);
  else if (s.phase === 'guess') finish(s, false, 'caught');
  return true;
}

export function removePlayer(s: SpyState, p: string, now: number) {
  if (!s.players.includes(p) || s.phase === 'end') return;
  if (p === s.spy) { s.players = s.players.filter(x => x !== p); finish(s, false, 'spy_left'); return; }
  const oi = s.order.indexOf(p);
  s.players = s.players.filter(x => x !== p);
  s.order = s.order.filter(x => x !== p);
  delete s.votes[p];
  for (const k of Object.keys(s.votes)) if (s.votes[k] === p) delete s.votes[k];
  if (s.players.length < 3) { finish(s, true, 'few'); return; }
  if (s.phase === 'clue') {
    if (oi < s.cluer) s.cluer--;
    else if (oi === s.cluer) {
      // sıradaki kişi gitti: aynı indeks artık bir sonrakini gösterir
      if (s.cluer >= s.order.length) { s.cluer = s.order.length - 1; advanceClue(s, now); }
      else s.next = now + CLUE_MS;
    }
  } else if (s.phase === 'vote' && s.players.every(x => s.votes[x])) tallyVotes(s, now);
}

/** Herkese açık görünüm: casus ve kelime oyun bitene kadar gizli. */
export function viewFor(s: SpyState) {
  const ended = s.phase === 'end';
  return {
    players: s.players.map(p => ({ id: p, voted: Boolean(s.votes[p]), votes: s.phase === 'vote' ? undefined : s.tally[p] ?? 0 })),
    order: s.order, phase: s.phase, category: s.category, rounds: s.rounds, clueRound: s.clueRound,
    cluer: currentCluer(s), clues: s.clues, accused: s.accused,
    votes: ended ? s.votes : undefined,
    spy: ended ? s.spy : null, word: ended ? s.word : null, spyGuess: s.spyGuess, spyWon: s.spyWon,
    winners: s.winners, winner: s.winner, reason: s.reason, ends: s.next,
  };
}

export function privateFor(s: SpyState, p: string) {
  return p === s.spy ? { spy: true, category: s.category } : { spy: false, category: s.category, word: s.word };
}
