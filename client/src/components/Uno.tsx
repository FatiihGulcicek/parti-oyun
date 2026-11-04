import { useEffect, useMemo, useState } from 'react';
import { call, Profile } from '../net';
import { useApp } from '../App';

export type Color = 'red' | 'yellow' | 'green' | 'blue';
export interface Card { id: number; color: Color | 'wild'; value: string }
export interface UnoView {
  players: { id: string; count: number; saidUno: boolean }[];
  myHand: Card[] | null; top: Card; color: Color; turn: string; direction: 1 | -1; deckCount: number;
  drewThisTurn: boolean; unoVulnerable: string | null; winner: string | null;
  lastAction: { type: string; by: string; card?: Card; target?: string; count?: number } | null;
  deadline: number; serverNow: number;
}

const SYM: Record<string, string> = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: '★', wild4: '+4' };
const COLOR_TR: Record<Color, string> = { red: 'Kırmızı', yellow: 'Sarı', green: 'Yeşil', blue: 'Mavi' };

export function UnoCard({ card, small, playable, onClick, back }: {
  card?: Card; small?: boolean; playable?: boolean; onClick?: () => void; back?: boolean;
}) {
  if (back || !card) return <div className={`uno-card back ${small ? 'sm' : ''}`}><span>UNO</span></div>;
  const sym = SYM[card.value] ?? card.value;
  return (
    <button className={`uno-card c-${card.color} ${small ? 'sm' : ''} ${playable ? 'playable' : ''}`} onClick={onClick} disabled={!onClick}>
      <i className="corner tl">{sym}</i>
      <span className="oval"><b>{sym}</b></span>
      <i className="corner br">{sym}</i>
    </button>
  );
}

function useCountdown(v: UnoView | null) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!v || v.winner) return;
    const end = Date.now() + (v.deadline - v.serverNow);
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [v?.deadline, v?.serverNow, v?.winner]);
  return left;
}

export default function UnoTable({ view, people }: { view: UnoView; people: Map<string, Profile> }) {
  const { me, toast } = useApp();
  const [wildFor, setWildFor] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const left = useCountdown(view);
  const myTurn = view.turn === me.id && !view.winner;
  const hand = view.myHand;
  const playing = Boolean(hand);

  const canPlay = (c: Card) => {
    if (!myTurn || !hand) return false;
    if (view.drewThisTurn && c.id !== hand[hand.length - 1].id) return false;
    return c.color === 'wild' || c.color === view.color || c.value === view.top.value;
  };

  // rakipler: benden sonra gelen sırayla
  const opponents = useMemo(() => {
    const ps = view.players;
    const i = ps.findIndex(p => p.id === me.id);
    return i < 0 ? ps : [...ps.slice(i + 1), ...ps.slice(0, i)];
  }, [view.players, me.id]);

  async function act(a: any) {
    if (busy) return;
    setBusy(true);
    const r = await call('uno:action', a);
    setBusy(false);
    if (!r.ok) toast(r.error!);
  }

  function play(c: Card) {
    if (!canPlay(c)) return;
    if (c.color === 'wild') return setWildFor(c);
    act({ type: 'play', cardId: c.id });
  }

  const name = (id: string) => people.get(id)?.username ?? '?';
  const la = view.lastAction;
  const lastText = la && (
    la.type === 'play' && la.target ? `${name(la.by)} → ${name(la.target)} +${la.count} kart!`
      : la.type === 'draw' ? `${name(la.by)} kart çekti`
        : la.type === 'pass' ? `${name(la.by)} pas geçti`
          : la.type === 'uno' ? `${name(la.by)}: UNO! 📣`
            : la.type === 'catch' ? `${name(la.by)}, ${name(la.target!)} yakaladı!` : '');

  const turnSecs = Math.ceil(left / 1000);

  return (
    <div className={`uno-table ${myTurn ? 'my-turn' : ''}`}>
      <div className="uno-opponents">
        {opponents.map(p => {
          const pr = people.get(p.id);
          const isTurn = view.turn === p.id && !view.winner;
          return (
            <div key={p.id} className={`opp ${isTurn ? 'turn' : ''} ${p.id === me.id ? 'me' : ''}`}>
              <div className="opp-av" style={isTurn ? { ['--pct' as any]: `${(left / 25000) * 100}%` } : undefined}>
                <span>{pr?.avatar ?? '❔'}</span>
              </div>
              <small>{pr?.username ?? '…'}</small>
              <div className="opp-count"><span className="mini-back" />{p.count}</div>
              {p.saidUno && p.count <= 1 && <em className="uno-badge">UNO!</em>}
              {view.unoVulnerable === p.id && p.id !== me.id && (
                <button className="catch" onClick={() => act({ type: 'catch', target: p.id })}>Yakala!</button>
              )}
            </div>
          );
        })}
      </div>

      <div className="uno-center">
        <button className={`deck ${myTurn && !view.drewThisTurn ? 'glow' : ''}`} disabled={!myTurn || view.drewThisTurn}
          onClick={() => act({ type: 'draw' })}>
          <UnoCard back /><small>{view.deckCount}</small>
        </button>
        <div className={`pile ring-${view.color}`}>
          <UnoCard key={view.top.id} card={view.top} />
        </div>
        <div className="uno-status">
          <div className={`color-dot c-${view.color}`} title={COLOR_TR[view.color]} />
          <div className="dir">{view.direction === 1 ? '↻' : '↺'}</div>
          {!view.winner && <div className={`timer ${turnSecs <= 5 ? 'hot' : ''}`}>{turnSecs}s</div>}
        </div>
      </div>

      <div className="uno-msg">
        {view.winner ? `🏆 ${name(view.winner)} kazandı!`
          : myTurn ? (view.drewThisTurn ? 'Çektiğin kartı oyna ya da pas geç' : 'Sıra sende!')
            : `${name(view.turn)} oynuyor…`}
        {lastText && !view.winner && <small>{lastText}</small>}
      </div>

      {playing ? (
        <>
          <div className="hand" style={{ ['--n' as any]: hand!.length }}>
            {hand!.map(c => <UnoCard key={c.id} card={c} playable={canPlay(c)} onClick={() => play(c)} />)}
          </div>
          <div className="hand-actions">
            {myTurn && view.drewThisTurn && <button className="btn ghost" onClick={() => act({ type: 'pass' })}>Pas ⏭</button>}
            {hand!.length <= 2 && !view.players.find(p => p.id === me.id)?.saidUno && (
              <button className="btn uno-btn" onClick={() => act({ type: 'uno' })}>UNO!</button>
            )}
          </div>
        </>
      ) : <div className="spectate">👀 İzliyorsun — sonraki oyun için koltuğa otur</div>}

      {wildFor && (
        <div className="sheet-bg" onClick={() => setWildFor(null)}>
          <div className="color-pick" onClick={e => e.stopPropagation()}>
            <h3>Renk seç</h3>
            <div className="colors">
              {(['red', 'yellow', 'green', 'blue'] as Color[]).map(c => (
                <button key={c} className={`c-${c}`} onClick={() => {
                  act({ type: 'play', cardId: wildFor.id, chosenColor: c }); setWildFor(null);
                }}>{COLOR_TR[c]}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {view.winner && (
        <div className="win-overlay">
          <div className="confetti">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ ['--i' as any]: i }} />)}</div>
          <div className="win-card">
            <div className="av-xl">{people.get(view.winner)?.avatar}</div>
            <h2>{name(view.winner)}</h2>
            <p>{view.winner === me.id ? 'Tebrikler, kazandın! 🎉' : 'Uno şampiyonu! 🏆'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
