// Sunucu-otoriter Uno motoru. Saf mantık: ağ / zamanlayıcı içermez.

export type Color = 'red' | 'yellow' | 'green' | 'blue';
export type Value =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface Card { id: number; color: Color | 'wild'; value: Value }

export const COLORS: Color[] = ['red', 'yellow', 'green', 'blue'];

export function buildDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  for (const color of COLORS) {
    cards.push({ id: id++, color, value: '0' });
    for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'] as Value[]) {
      cards.push({ id: id++, color, value: v });
      cards.push({ id: id++, color, value: v });
    }
  }
  for (let i = 0; i < 4; i++) cards.push({ id: id++, color: 'wild', value: 'wild' });
  for (let i = 0; i < 4; i++) cards.push({ id: id++, color: 'wild', value: 'wild4' });
  return cards; // 108
}

export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface UnoState {
  players: string[];               // oturma sırası
  hands: Record<string, Card[]>;
  deck: Card[];
  discard: Card[];
  turn: number;                     // players dizisinde index
  direction: 1 | -1;
  color: Color;                     // geçerli renk (wild sonrası seçilen)
  drewThisTurn: boolean;            // sırası gelen oyuncu bu tur kart çekti mi
  unoVulnerable: string | null;     // 1 karta düşüp UNO demeyen oyuncu
  saidUno: string[];                // UNO diyen oyuncular
  winner: string | null;
  log: string[];
  lastAction: { type: string; by: string; card?: Card; target?: string; count?: number } | null;
}

export type UnoAction =
  | { type: 'play'; cardId: number; chosenColor?: Color; uno?: boolean }
  | { type: 'draw' }
  | { type: 'pass' }
  | { type: 'uno' }
  | { type: 'catch'; target: string };

export class UnoError extends Error {}

export function top(s: UnoState): Card { return s.discard[s.discard.length - 1]; }
export function current(s: UnoState): string { return s.players[s.turn]; }

export function newGame(players: string[], rnd: () => number = Math.random): UnoState {
  if (players.length < 2 || players.length > 6) throw new UnoError('2-6 oyuncu gerekli');
  const deck = shuffle(buildDeck(), rnd);
  const hands: Record<string, Card[]> = {};
  for (const p of players) hands[p] = deck.splice(0, 7);
  // başlangıç kartı sayı kartı olsun
  let idx = deck.findIndex(c => /^[0-9]$/.test(c.value));
  const first = deck.splice(idx, 1)[0];
  return {
    players: [...players], hands, deck, discard: [first], turn: 0, direction: 1,
    color: first.color as Color, drewThisTurn: false, unoVulnerable: null, saidUno: [],
    winner: null, log: ['Oyun başladı'], lastAction: null,
  };
}

export function canPlay(s: UnoState, card: Card): boolean {
  if (card.color === 'wild') return true;
  const t = top(s);
  return card.color === s.color || card.value === t.value;
}

function draw(s: UnoState, player: string, n: number): Card[] {
  const got: Card[] = [];
  for (let i = 0; i < n; i++) {
    if (s.deck.length === 0) {
      const t = s.discard.pop()!;
      s.deck = shuffle(s.discard);
      s.discard = [t];
      if (s.deck.length === 0) break; // kart kalmadı
    }
    got.push(s.deck.pop()!);
  }
  s.hands[player].push(...got);
  if (s.hands[player].length > 1) s.saidUno = s.saidUno.filter(p => p !== player);
  return got;
}

function step(s: UnoState, n = 1) {
  const len = s.players.length;
  s.turn = ((s.turn + s.direction * n) % len + len) % len;
  s.drewThisTurn = false;
}

function nextIndex(s: UnoState): number {
  const len = s.players.length;
  return ((s.turn + s.direction) % len + len) % len;
}

/** Bir hamleyi uygular. Geçersizse UnoError fırlatır. State'i yerinde değiştirir. */
export function apply(s: UnoState, by: string, a: UnoAction): void {
  if (s.winner) throw new UnoError('Oyun bitti');
  if (!s.players.includes(by)) throw new UnoError('Oyuncu değilsin');

  // Sıra gerektirmeyen hamleler
  if (a.type === 'uno') {
    if (s.hands[by].length > 2) throw new UnoError('UNO için çok kartın var');
    if (!s.saidUno.includes(by)) s.saidUno.push(by);
    if (s.unoVulnerable === by) s.unoVulnerable = null;
    s.lastAction = { type: 'uno', by };
    return;
  }
  if (a.type === 'catch') {
    if (s.unoVulnerable !== a.target || a.target === by) throw new UnoError('Yakalanacak kimse yok');
    draw(s, a.target, 2);
    s.unoVulnerable = null;
    s.log.push(`${by}, ${a.target} oyuncusunu UNO demeden yakaladı (+2)`);
    s.lastAction = { type: 'catch', by, target: a.target, count: 2 };
    return;
  }

  if (current(s) !== by) throw new UnoError('Sıra sende değil');
  // sıradaki oyuncu bir hamle yapınca önceki oyuncu artık yakalanamaz
  if (s.unoVulnerable && s.unoVulnerable !== by) s.unoVulnerable = null;

  if (a.type === 'draw') {
    if (s.drewThisTurn) throw new UnoError('Bu tur zaten kart çektin');
    const got = draw(s, by, 1);
    s.drewThisTurn = true;
    s.lastAction = { type: 'draw', by, count: got.length };
    // çekilen kart oynanamıyorsa otomatik pas
    if (!got[0] || !canPlay(s, got[0])) step(s);
    return;
  }

  if (a.type === 'pass') {
    if (!s.drewThisTurn) throw new UnoError('Önce kart çekmelisin');
    s.lastAction = { type: 'pass', by };
    step(s);
    return;
  }

  // play
  const hand = s.hands[by];
  const i = hand.findIndex(c => c.id === a.cardId);
  if (i < 0) throw new UnoError('Bu kart elinde yok');
  const card = hand[i];
  if (s.drewThisTurn && card.id !== hand[hand.length - 1].id) throw new UnoError('Sadece çektiğin kartı oynayabilirsin');
  if (!canPlay(s, card)) throw new UnoError('Bu kart oynanamaz');
  if (card.color === 'wild' && (!a.chosenColor || !COLORS.includes(a.chosenColor))) throw new UnoError('Renk seçmelisin');

  hand.splice(i, 1);
  s.discard.push(card);
  s.color = card.color === 'wild' ? a.chosenColor! : card.color;
  s.lastAction = { type: 'play', by, card };

  if (hand.length === 0) {
    s.winner = by;
    s.log.push(`${by} kazandı!`);
    return;
  }
  if (hand.length === 1) {
    if (a.uno || s.saidUno.includes(by)) { if (!s.saidUno.includes(by)) s.saidUno.push(by); }
    else s.unoVulnerable = by;
  }

  const two = s.players.length === 2;
  switch (card.value) {
    case 'skip': step(s, 2); break;
    case 'reverse':
      if (two) step(s, 2);
      else { s.direction = (s.direction * -1) as 1 | -1; step(s); }
      break;
    case 'draw2': {
      const victim = s.players[nextIndex(s)];
      draw(s, victim, 2);
      s.lastAction = { type: 'play', by, card, target: victim, count: 2 };
      step(s, 2);
      break;
    }
    case 'wild4': {
      const victim = s.players[nextIndex(s)];
      draw(s, victim, 4);
      s.lastAction = { type: 'play', by, card, target: victim, count: 4 };
      step(s, 2);
      break;
    }
    default: step(s);
  }
}

/** Oyuncuya özel görünüm: rakiplerin kartları gizli. */
export function viewFor(s: UnoState, viewer: string | null) {
  return {
    players: s.players.map(p => ({ id: p, count: s.hands[p].length, saidUno: s.saidUno.includes(p) })),
    myHand: viewer && s.hands[viewer] ? s.hands[viewer] : null,
    top: top(s),
    color: s.color,
    turn: current(s),
    direction: s.direction,
    deckCount: s.deck.length,
    drewThisTurn: s.drewThisTurn,
    unoVulnerable: s.unoVulnerable,
    winner: s.winner,
    lastAction: s.lastAction,
  };
}

/** Süre dolunca otomatik hamle: kart çek, oynanabiliyorsa da pas geç. */
export function autoMove(s: UnoState) {
  const p = current(s);
  if (!s.drewThisTurn) apply(s, p, { type: 'draw' });
  if (!s.winner && current(s) === p && s.drewThisTurn) apply(s, p, { type: 'pass' });
}

/** Oyuncu ayrılınca oyundan çıkar. */
export function removePlayer(s: UnoState, p: string) {
  const i = s.players.indexOf(p);
  if (i < 0) return;
  s.deck.unshift(...s.hands[p]);
  delete s.hands[p];
  const wasTurn = i === s.turn;
  s.players.splice(i, 1);
  const len = s.players.length;
  if (len > 0) {
    if (wasTurn) s.turn = s.direction === 1 ? i % len : ((i - 1) % len + len) % len;
    else if (i < s.turn) s.turn--;
  }
  if (wasTurn) s.drewThisTurn = false;
  if (s.unoVulnerable === p) s.unoVulnerable = null;
  if (s.players.length === 1) s.winner = s.players[0];
}

// ---------------------------------------------------------------- bot
/** Bot hamlesi: oynanabilir kartlardan önce renkli/sayılı olanları, sonra özel kartları, en son joker oynar.
 *  Joker rengi elde en çok bulunan renk seçilir; son karta düşerken UNO der. Oynayamazsa kart çeker. */
export function botMove(s: UnoState) {
  const p = current(s);
  const hand = s.hands[p];
  const playable = s.drewThisTurn ? hand.slice(-1).filter(c => canPlay(s, c)) : hand.filter(c => canPlay(s, c));
  if (!playable.length) {
    if (!s.drewThisTurn) apply(s, p, { type: 'draw' });
    if (!s.winner && current(s) === p && s.drewThisTurn) {
      const last = s.hands[p][s.hands[p].length - 1];
      if (last && canPlay(s, last)) return botMove(s);
      apply(s, p, { type: 'pass' });
    }
    return;
  }
  const rank = (c: Card) => (c.value === 'wild4' ? 4 : c.value === 'wild' ? 3 : /^[0-9]$/.test(c.value) ? 0 : 1);
  const card = [...playable].sort((a, b) => rank(a) - rank(b))[0];
  const counts: Record<string, number> = {};
  for (const c of hand) if (c.color !== 'wild' && c.id !== card.id) counts[c.color] = (counts[c.color] ?? 0) + 1;
  const chosenColor = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? COLORS[0]) as Color;
  apply(s, p, { type: 'play', cardId: card.id, chosenColor: card.color === 'wild' ? chosenColor : undefined, uno: hand.length === 2 });
}
