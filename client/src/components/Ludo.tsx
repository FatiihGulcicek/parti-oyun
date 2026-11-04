import { useEffect, useMemo, useRef, useState } from 'react';
import { call, Profile } from '../net';
import { useApp } from '../App';
import Avatar from './Avatar';

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';
export interface LudoView {
  players: { id: string; color: LudoColor; tokens: number[] }[];
  turn: string; dice: number | null; legal: number[]; rollId: number;
  lastRoll: { by: string; value: number } | null; winner: string | null;
  lastAction: {
    type: 'roll' | 'move' | 'skip'; by: string; dice: number; token?: number; from?: number; to?: number;
    captured?: { player: string; token: number }[]; bonus?: boolean; reason?: 'no_move' | 'three_sixes';
  } | null;
  version: number; deadline: number; serverNow: number;
}

const TURN_MS = 20_000;
const ROLL_MS = 750;
const STEP_MS = 150;
const HOME = -1, GOAL = 56;
const START: Record<LudoColor, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
const SAFE_STARS = [8, 21, 34, 47];
const HEX: Record<LudoColor, string> = { red: '#e8304f', green: '#18a66a', yellow: '#f5b800', blue: '#2a6fe0' };
const ARROW_DEG: Record<LudoColor, number> = { red: 0, green: 90, yellow: 180, blue: 270 };
const COLOR_TR: Record<LudoColor, string> = { red: 'Kırmızı', green: 'Yeşil', yellow: 'Sarı', blue: 'Mavi' };

// ---------------------------------------------------------------- tahta geometrisi (15×15, [satır, sütun])
type RC = [number, number];
const TRACK: RC[] = (() => {
  const t: RC[] = [];
  const run = (r0: number, c0: number, dr: number, dc: number, n: number) => { for (let i = 0; i < n; i++) t.push([r0 + dr * i, c0 + dc * i]); };
  run(6, 1, 0, 1, 5);   // kırmızı başlangıçtan sağa
  run(5, 6, -1, 0, 6);  // yukarı
  t.push([0, 7]);
  run(0, 8, 1, 0, 6);   // aşağı (yeşil başlangıç 1,8)
  run(6, 9, 0, 1, 6);   // sağa
  t.push([7, 14]);
  run(8, 14, 0, -1, 6); // sola (sarı başlangıç 8,13)
  run(9, 8, 1, 0, 6);   // aşağı
  t.push([14, 7]);
  run(14, 6, -1, 0, 6); // yukarı (mavi başlangıç 13,6)
  run(8, 5, 0, -1, 6);  // sola
  t.push([7, 0]);
  t.push([6, 0]);
  return t; // 52
})();
const LANE: Record<LudoColor, RC[]> = {
  red: [1, 2, 3, 4, 5].map(c => [7, c] as RC),
  green: [1, 2, 3, 4, 5].map(r => [r, 7] as RC),
  yellow: [13, 12, 11, 10, 9].map(c => [7, c] as RC),
  blue: [13, 12, 11, 10, 9].map(r => [r, 7] as RC),
};
const BASE: Record<LudoColor, RC> = { red: [0, 0], green: [0, 9], yellow: [9, 9], blue: [9, 0] };
// bitişte taşın duracağı merkez noktası (birim koordinat, satır/sütun)
const GOAL_AT: Record<LudoColor, [number, number]> = { red: [7.5, 6.55], green: [6.55, 7.5], yellow: [7.5, 8.45], blue: [8.45, 7.5] };

/** Taşın tahtadaki merkezi (birim koordinat: [y, x]). */
function tokenPos(color: LudoColor, progress: number, idx: number): [number, number] {
  if (progress === HOME) {
    const [r0, c0] = BASE[color];
    return [r0 + (idx < 2 ? 2 : 4), c0 + (idx % 2 ? 4 : 2)];
  }
  if (progress >= GOAL) return GOAL_AT[color];
  if (progress > 50) { const [r, c] = LANE[color][progress - 51]; return [r + .5, c + .5]; }
  const [r, c] = TRACK[(START[color] + progress) % 52];
  return [r + .5, c + .5];
}

// ---------------------------------------------------------------- zar
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function Dice({ value, rolling, active, color, onClick }: {
  value: number; rolling: boolean; active: boolean; color: LudoColor; onClick?: () => void;
}) {
  const [face, setFace] = useState(value);
  useEffect(() => {
    if (!rolling) { setFace(value); return; }
    const t = setInterval(() => setFace(f => (f + 1 + Math.floor(Math.random() * 5)) % 6 + 1), 80);
    return () => clearInterval(t);
  }, [rolling, value]);
  const f = Math.min(6, Math.max(1, face));
  return (
    <button className={`dice ${rolling ? 'rolling' : ''} ${active ? 'active' : ''}`} style={{ ['--dc' as any]: HEX[color] }}
      onClick={onClick} disabled={!onClick} aria-label={rolling ? 'Zar dönüyor' : `Zar: ${f}`}>
      <span className="dice-face">
        {Array.from({ length: 9 }, (_, i) => <i key={i} className={PIPS[f].includes(i) ? 'on' : ''} />)}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- yardımcı kancalar
type TokenMap = Record<string, number[]>;
const toMap = (v: LudoView): TokenMap => Object.fromEntries(v.players.map(p => [p.id, p.tokens]));

/** Taşları adım adım yürütür; kırılan taş, vuran taş vardıktan sonra eve döner. */
function useAnimatedTokens(view: LudoView, delay: number) {
  const [shown, setShown] = useState<TokenMap>(() => toMap(view));
  const ref = useRef(shown);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const target = toMap(view);
    let timer = 0;
    const tick = () => {
      const curr = ref.current;
      let forward = false;
      const next: TokenMap = {};
      for (const id of Object.keys(target)) {
        const from = curr[id] ?? target[id];
        next[id] = target[id].map((t, i) => {
          const c = from[i];
          if (c >= 0 && t > c && t - c <= 6) { forward = true; return c + 1; }
          return c === HOME && t === 0 ? (forward = true, 0) : c;
        });
      }
      if (!forward) for (const id of Object.keys(target)) next[id] = [...target[id]];
      ref.current = next;
      setShown(next);
      setMoving(forward);
      if (forward) timer = window.setTimeout(tick, STEP_MS);
    };
    timer = window.setTimeout(tick, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.version]);
  return { shown, moving };
}

function useCountdown(v: LudoView) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (v.winner) return;
    const end = Date.now() + (v.deadline - v.serverNow);
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [v.deadline, v.serverNow, v.winner]);
  return left;
}

// ---------------------------------------------------------------- masa
export default function LudoTable({ view, people }: { view: LudoView; people: Map<string, Profile> }) {
  const { me, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [rollingLocal, setRollingLocal] = useState(false);
  const [rollingFx, setRollingFx] = useState(false);
  const lastRollId = useRef(view.rollId);
  const rollChanged = view.rollId !== lastRollId.current;

  // yeni zar atışı geldiyse herkes için animasyon oynat
  useEffect(() => {
    if (view.rollId === lastRollId.current) return;
    lastRollId.current = view.rollId;
    setRollingFx(true);
    const t = setTimeout(() => setRollingFx(false), ROLL_MS);
    return () => clearTimeout(t);
  }, [view.rollId]);

  const { shown, moving } = useAnimatedTokens(view, rollChanged ? ROLL_MS : 0);
  const left = useCountdown(view);
  const rolling = rollingLocal || rollingFx;

  const meP = view.players.find(p => p.id === me.id);
  const turnP = view.players.find(p => p.id === view.turn);
  const myTurn = view.turn === me.id && !view.winner;
  const canRoll = myTurn && view.dice == null && !rolling && !busy && !moving;
  const canMove = myTurn && view.dice != null && !rolling && !busy && !moving;
  const legal = new Set(canMove ? view.legal : []);

  const name = (id: string) => people.get(id)?.username ?? '?';

  async function roll() {
    if (!canRoll) return;
    setBusy(true); setRollingLocal(true);
    const started = Date.now();
    const r = await call('ludo:roll');
    // sonuç gelse bile animasyon en az bir süre dönsün
    setTimeout(() => setRollingLocal(false), Math.max(0, 350 - (Date.now() - started)));
    setBusy(false);
    if (!r.ok) toast(r.error!);
  }

  async function move(token: number) {
    if (!legal.has(token)) return;
    setBusy(true);
    const r = await call('ludo:move', { token });
    setBusy(false);
    if (!r.ok) toast(r.error!);
  }

  // tek bir hamle varsa kısa süre sonra kendiliğinden oyna
  useEffect(() => {
    if (!canMove || view.legal.length !== 1) return;
    const t = setTimeout(() => move(view.legal[0]), 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canMove, view.version]);

  // taşları hücrelere grupla (aynı karedeki taşlar yan yana küçülür)
  const tokens = useMemo(() => {
    const list: { pid: string; color: LudoColor; idx: number; y: number; x: number; key: string }[] = [];
    for (const p of view.players) {
      (shown[p.id] ?? p.tokens).forEach((prog, idx) => {
        const [y, x] = tokenPos(p.color, prog, idx);
        list.push({ pid: p.id, color: p.color, idx, y, x, key: `${y.toFixed(2)}:${x.toFixed(2)}` });
      });
    }
    const groups = new Map<string, number>();
    return list.map(t => {
      const n = list.filter(o => o.key === t.key).length;
      const k = groups.get(t.key) ?? 0;
      groups.set(t.key, k + 1);
      const off = n > 1 ? [[-.18, -.18], [.18, .18], [-.18, .18], [.18, -.18]][k % 4] : [0, 0];
      return { ...t, y: t.y + off[0], x: t.x + off[1], small: n > 1 };
    });
  }, [shown, view.players]);

  const la = view.lastAction;
  const lastText = la && !rolling && (
    la.type === 'skip' ? (la.reason === 'three_sixes' ? `${name(la.by)} üç kez 6 attı, sıra yandı!` : `${name(la.by)} ${la.dice} attı, oynayacak taş yok`)
      : la.type === 'move' && la.captured?.length ? `💥 ${name(la.by)}, ${la.captured.map(c => name(c.player)).join(', ')} taşını kırdı!`
        : la.type === 'move' && la.to === GOAL ? `🏁 ${name(la.by)} bir taşını eve soktu!`
          : la.type === 'roll' ? `${name(la.by)} ${la.dice} attı` : '');

  const turnSecs = Math.ceil(left / 1000);
  const seat = (c: LudoColor) => view.players.find(p => p.color === c);
  const Badge = ({ c }: { c: LudoColor }) => {
    const p = seat(c);
    if (!p) return <div className="ludo-badge empty" />;
    const isTurn = view.turn === p.id && !view.winner;
    return (
      <div className={`ludo-badge ${isTurn ? 'turn' : ''}`} style={{ ['--pc' as any]: HEX[c] }}>
        <div className="opp-av" style={isTurn ? { ['--pct' as any]: `${(left / TURN_MS) * 100}%` } : undefined}>
          <span><Avatar value={people.get(p.id)?.avatar} /></span>
        </div>
        <div className="lb-txt">
          <b>{p.id === me.id ? 'Sen' : name(p.id)}</b>
          <small>{COLOR_TR[c]} · {p.tokens.filter(t => t === GOAL).length}/4 🏁</small>
        </div>
      </div>
    );
  };

  return (
    <div className={`ludo-table ${myTurn ? 'my-turn' : ''}`}>
      <div className="ludo-row"><Badge c="red" /><Badge c="green" /></div>

      <div className="ludo-board">
        <svg viewBox="0 0 15 15" className="ludo-svg" aria-hidden>
          <rect x="0" y="0" width="15" height="15" fill="#fdf6e3" rx=".3" />
          {(Object.keys(BASE) as LudoColor[]).map(c => {
            const [r, col] = BASE[c];
            const used = Boolean(seat(c));
            return (
              <g key={c} opacity={used ? 1 : .35}>
                <rect x={col} y={r} width="6" height="6" fill={HEX[c]} rx=".3" />
                <rect x={col + .9} y={r + .9} width="4.2" height="4.2" fill="#fff" rx=".5" />
                {[[2, 2], [2, 4], [4, 2], [4, 4]].map(([dy, dx]) => (
                  <circle key={`${dy}${dx}`} cx={col + dx} cy={r + dy} r=".62" fill={HEX[c]} opacity=".35" />
                ))}
              </g>
            );
          })}
          {TRACK.map(([r, c], i) => {
            const startOf = (Object.keys(START) as LudoColor[]).find(k => START[k] === i);
            return (
              <g key={i}>
                <rect x={c} y={r} width="1" height="1" fill={startOf ? HEX[startOf] : '#fff'} stroke="#c9bfa7" strokeWidth=".04" />
                {SAFE_STARS.includes(i) && <text x={c + .5} y={r + .72} fontSize=".7" textAnchor="middle" fill="#b9a77a">★</text>}
                {startOf && <text x={c + .5} y={r + .72} fontSize=".6" textAnchor="middle" fill="#fff"
                  transform={`rotate(${ARROW_DEG[startOf]} ${c + .5} ${r + .5})`}>➤</text>}
              </g>
            );
          })}
          {(Object.keys(LANE) as LudoColor[]).map(c => LANE[c].map(([r, col], i) => (
            <rect key={c + i} x={col} y={r} width="1" height="1" fill={HEX[c]} stroke="#c9bfa7" strokeWidth=".04" />
          )))}
          <polygon points="6,6 7.5,7.5 6,9" fill={HEX.red} />
          <polygon points="6,6 7.5,7.5 9,6" fill={HEX.green} />
          <polygon points="9,6 7.5,7.5 9,9" fill={HEX.yellow} />
          <polygon points="6,9 7.5,7.5 9,9" fill={HEX.blue} />
        </svg>

        {tokens.map(t => {
          const mine = t.pid === me.id;
          const can = mine && legal.has(t.idx);
          return (
            <button key={`${t.pid}-${t.idx}`} className={`ludo-token ${can ? 'can' : ''} ${t.small ? 'small' : ''}`}
              style={{ left: `${(t.x / 15) * 100}%`, top: `${(t.y / 15) * 100}%`, ['--tc' as any]: HEX[t.color] }}
              disabled={!can} onClick={() => move(t.idx)} aria-label={`${COLOR_TR[t.color]} taş ${t.idx + 1}`} />
          );
        })}
      </div>

      <div className="ludo-row"><Badge c="blue" /><Badge c="yellow" /></div>

      <div className="ludo-controls">
        <Dice value={view.lastRoll?.value ?? 6} rolling={rolling} active={canRoll}
          color={turnP?.color ?? meP?.color ?? 'red'} onClick={canRoll ? roll : undefined} />
        <div className="uno-msg ludo-msg">
          {view.winner ? `🏆 ${name(view.winner)} kazandı!`
            : rolling ? 'Zar dönüyor…'
              : myTurn ? (view.dice == null ? 'Sıra sende! Zarı at 🎲' : view.legal.length > 1 ? 'Oynatmak istediğin taşa dokun' : 'Taşın ilerliyor…')
                : `${name(view.turn)} oynuyor…`}
          {lastText && !view.winner && <small>{lastText}</small>}
        </div>
        {!view.winner && <div className={`timer ${turnSecs <= 5 ? 'hot' : ''}`}>{turnSecs}s</div>}
      </div>
      {!meP && <div className="spectate">👀 İzliyorsun — sonraki oyun için koltuğa otur</div>}

      {view.winner && (
        <div className="win-overlay">
          <div className="confetti">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ ['--i' as any]: i }} />)}</div>
          <div className="win-card">
            <div className="av-xl"><Avatar value={people.get(view.winner)?.avatar} /></div>
            <h2>{name(view.winner)}</h2>
            <p>{view.winner === me.id ? 'Tebrikler, kazandın! 🎉' : 'Ludo şampiyonu! 🏆'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
