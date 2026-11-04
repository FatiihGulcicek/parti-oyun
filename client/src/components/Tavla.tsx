import { useEffect, useRef, useState } from 'react';
import { call, type Profile } from '../net';
import { useApp } from '../App';
import { Dice } from './Ludo';
import { PlayerStrip, Timer, WinOverlay, useCountdown, type BaseView } from './GameKit';

type From = number | 'bar';
type To = number | 'off';
export interface TavlaView extends BaseView {
  players: { id: string; color: 'w' | 'b' }[];
  points: number[]; bar: { w: number; b: number }; off: { w: number; b: number };
  turn: string; phase: 'roll' | 'move' | 'end'; dice: number[]; rolled: number[]; rollId: number;
  lastMoves: { from: From; to: To; die: number }[]; legal: { from: From; to: To }[]; mars: boolean; ends: number;
}

const BW = 1000, BH = 720;
const L = 24, R = 880, BAR_L = 430, BAR_R = 474, OFF_L = 900, OFF_R = 980;
const PW = (BAR_L - L) / 6;            // hane genişliği
const CR = PW * 0.44;                  // pul yarıçapı
const TRI_H = 290;

/** Hanenin x merkezi ve üst/alt sırada olup olmadığı (beyazın bakışıyla). */
function geom(idx: number) {
  const top = idx >= 12;
  const col = top ? idx - 12 : idx;
  let x: number;
  if (!top) x = col < 6 ? R - (col + 0.5) * PW : BAR_L - (col - 6 + 0.5) * PW;
  else x = col < 6 ? L + (col + 0.5) * PW : BAR_R + (col - 6 + 0.5) * PW;
  return { x, top };
}

export default function TavlaTable({ view, people }: { view: TavlaView; people: Map<string, Profile> }) {
  const { me, toast } = useApp();
  const [sel, setSel] = useState<From | null>(null);
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const lastRoll = useRef(view.rollId);
  const left = useCountdown(view.ends || view.deadline, view.serverNow, view.phase !== 'end');

  const myColor = view.players.find(p => p.id === me.id)?.color ?? null;
  const flip = myColor === 'b';                       // siyah oyuncu tahtayı kendi tarafından görür
  const myTurn = view.turn === me.id && view.phase !== 'end';
  const canMove = myTurn && view.phase === 'move' && !busy && !rolling && !view.syncing;
  const turnColor = view.players.find(p => p.id === view.turn)?.color ?? 'w';

  useEffect(() => {
    if (view.rollId === lastRoll.current) return;
    lastRoll.current = view.rollId;
    setRolling(true);
    const t = setTimeout(() => setRolling(false), 650);
    return () => clearTimeout(t);
  }, [view.rollId]);
  useEffect(() => { setSel(null); }, [view.version]);

  const sources = new Set(view.legal.map(m => String(m.from)));
  const targets = new Set(sel === null ? [] : view.legal.filter(m => m.from === sel).map(m => String(m.to)));

  async function act(m: any) {
    if (busy) return;
    setBusy(true);
    const r = await call('game:move', m);
    setBusy(false);
    if (!r.ok) toast(r.error!);
  }
  function tapSource(f: From) {
    if (!canMove) return;
    if (targets.has(String(f)) && sel !== null) return act({ type: 'move', from: sel, to: f });
    if (!sources.has(String(f))) return setSel(null);
    const outs = view.legal.filter(m => m.from === f);
    if (outs.length === 1 && new Set(outs.map(o => String(o.to))).size === 1) return act({ type: 'move', from: f, to: outs[0].to });
    setSel(sel === f ? null : f);
  }
  function tapTarget(t: To) {
    if (!canMove || sel === null || !targets.has(String(t))) return;
    act({ type: 'move', from: sel, to: t });
  }

  const yOf = (top: boolean) => (top !== flip ? 'top' : 'bottom');
  const name = (id: string) => (id === me.id ? 'Sen' : people.get(id)?.username ?? '…');
  const lastTo = new Set(view.lastMoves.map(m => String(m.to)));

  const checkers = (idx: number) => {
    const v = view.points[idx];
    if (!v) return null;
    const n = Math.abs(v), c = v > 0 ? 'w' : 'b';
    const { x, top } = geom(idx);
    const row = yOf(top);
    const shown = Math.min(n, 5);
    return Array.from({ length: shown }, (_, k) => {
      const cy = row === 'top' ? 20 + CR + k * CR * 1.9 : BH - 20 - CR - k * CR * 1.9;
      return (
        <g key={k} className={`tv-ch ${c}`}>
          <circle cx={x} cy={cy} r={CR} />
          <circle cx={x} cy={cy} r={CR * 0.62} className="ring" />
          {k === shown - 1 && n > 5 && <text x={x} y={cy + 9} textAnchor="middle" className="cnt">{n}</text>}
        </g>
      );
    });
  };

  return (
    <div className={`gt-table tavla-table ${myTurn ? 'my-turn' : ''}`}>
      <PlayerStrip meId={me.id} people={people} items={view.players.map(p => ({
        id: p.id, active: view.turn === p.id && view.phase !== 'end', badge: p.color === 'w' ? '⚪' : '⚫',
        sub: `${view.off[p.color]}/15`,
      }))} />

      <div className="tv-board-wrap">
        <svg viewBox={`0 0 ${BW} ${BH}`} className="tv-board">
          <rect x="0" y="0" width={BW} height={BH} rx="26" className="tv-frame" />
          <rect x={L} y="14" width={BAR_L - L} height={BH - 28} rx="10" className="tv-felt" />
          <rect x={BAR_R} y="14" width={R - BAR_R} height={BH - 28} rx="10" className="tv-felt" />
          <rect x={BAR_L} y="14" width={BAR_R - BAR_L} height={BH - 28} className="tv-bar" />
          <rect x={OFF_L} y="14" width={OFF_R - OFF_L} height={BH - 28} rx="10" className={`tv-off ${targets.has('off') ? 'target' : ''}`}
            onClick={() => tapTarget('off')} />

          {Array.from({ length: 24 }, (_, idx) => {
            const { x, top } = geom(idx);
            const row = yOf(top);
            const y0 = row === 'top' ? 14 : BH - 14, y1 = row === 'top' ? 14 + TRI_H : BH - 14 - TRI_H;
            const isSrc = canMove && sources.has(String(idx)), isTgt = targets.has(String(idx));
            return (
              <g key={idx} onClick={() => (isTgt ? tapTarget(idx) : tapSource(idx))} className="tv-pt">
                <path d={`M${x - PW / 2 + 3} ${y0} L${x + PW / 2 - 3} ${y0} L${x} ${y1} Z`} className={`tri ${idx % 2 ? 'a' : 'b'} ${isTgt ? 'target' : ''} ${sel === idx ? 'sel' : ''} ${lastTo.has(String(idx)) ? 'last' : ''}`} />
                {isSrc && sel !== idx && <circle cx={x} cy={row === 'top' ? 14 + TRI_H + 18 : BH - 14 - TRI_H - 18} r="6" className="src-dot" />}
                {checkers(idx)}
                <rect x={x - PW / 2} y={row === 'top' ? 14 : BH / 2} width={PW} height={BH / 2 - 14} fill="transparent" />
              </g>
            );
          })}

          {/* bar */}
          {(['w', 'b'] as const).map(c => view.bar[c] > 0 && (
            <g key={c} className={`tv-ch ${c} ${canMove && sources.has('bar') && turnColor === c ? 'pick' : ''}`} onClick={() => tapSource('bar')}>
              <circle cx={(BAR_L + BAR_R) / 2} cy={(c === 'w') !== flip ? BH / 2 + 60 : BH / 2 - 60} r={CR * 0.9} />
              <text x={(BAR_L + BAR_R) / 2} y={((c === 'w') !== flip ? BH / 2 + 60 : BH / 2 - 60) + 8} textAnchor="middle" className="cnt">{view.bar[c]}</text>
            </g>
          ))}
          {/* toplananlar */}
          {(['w', 'b'] as const).map(c => {
            const mineSide = (c === 'w') !== flip;
            return Array.from({ length: view.off[c] }, (_, k) => (
              <rect key={c + k} x={OFF_L + 8} width={OFF_R - OFF_L - 16} height="13" rx="4"
                y={mineSide ? BH - 24 - k * 15 - 13 : 24 + k * 15} className={`tv-offch ${c}`} />
            ));
          })}
        </svg>
      </div>

      <div className="tv-controls">
        <div className="tv-dice">
          {(view.rolled.length ? view.rolled : [6, 6]).map((d, i) => (
            <Dice key={i} value={d} rolling={rolling} active={false} color={turnColor === 'w' ? 'yellow' : 'blue'} />
          ))}
        </div>
        <div className="uno-msg">
          {view.phase === 'end' ? '' : myTurn
            ? view.phase === 'roll' ? 'Sıra sende! Zarı at 🎲' : sel !== null ? 'Gideceği haneye dokun' : `Oynayacağın pula dokun · kalan: ${view.dice.join(' ')}`
            : `${name(view.turn)} oynuyor…`}
        </div>
        {myTurn && view.phase === 'roll'
          ? <button className="btn gold" disabled={busy} onClick={() => act({ type: 'roll' })}>Zar at</button>
          : view.phase !== 'end' && <Timer ms={left} total={40_000} />}
      </div>
      {!myColor && view.phase !== 'end' && <div className="spectate">👀 İzliyorsun</div>}

      {view.phase === 'end' && (
        <WinOverlay winner={view.winner} people={people} meId={me.id}
          lines={<p>{view.mars ? '🔥 MARS! Rakip hiç pul toplayamadı.' : 'Tüm pullar toplandı.'}</p>} />
      )}
    </div>
  );
}
