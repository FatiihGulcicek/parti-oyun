import { useEffect, useMemo, useState } from 'react';
import { call, type Profile } from '../net';
import { useApp } from '../App';
import { PlayerStrip, Timer, WinOverlay, useCountdown, type BaseView } from './GameKit';

export interface OTile { id: number; c: number; n: number }
export interface OkeyView extends BaseView {
  players: { id: string; count: number; top: OTile | null; discarded: number }[];
  turn: string; phase: 'draw' | 'discard' | 'end'; indicator: OTile; okey: { c: number; n: number }; pile: number;
  lastDiscard: { by: string; tile: OTile } | null; winHand: OTile[] | null; pairs: boolean; drawGame: boolean; canTake: boolean; ends: number;
  mine: { hand: OTile[]; drawn: number | null } | null;
}

const COLOR_NAMES = ['Kırmızı', 'Sarı', 'Mavi', 'Siyah'];

export function Tile({ t, okey, sel, fresh, small, onClick }: { t: OTile; okey: { c: number; n: number }; sel?: boolean; fresh?: boolean; small?: boolean; onClick?: () => void }) {
  const wild = t.c === okey.c && t.n === okey.n;
  const fake = t.c === 4;
  const cls = `ok-tile c${fake ? 'f' : t.c} ${sel ? 'sel' : ''} ${fresh ? 'fresh' : ''} ${small ? 'sm' : ''} ${wild ? 'wild' : ''}`;
  const inner = <>{fake ? <span className="fk">★</span> : <><b>{t.n}</b><i className="dot" /></>}{wild && <em>OKEY</em>}</>;
  // tıklanmayan taş düğme değil (başka bir düğmenin içinde olabilir)
  return onClick ? <button className={cls} onClick={onClick}>{inner}</button> : <span className={cls}>{inner}</span>;
}

export default function OkeyTable({ view, people }: { view: OkeyView; people: Map<string, Profile> }) {
  const { me, toast } = useApp();
  const [order, setOrder] = useState<number[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const left = useCountdown(view.ends || view.deadline, view.serverNow, view.phase !== 'end');
  const hand = view.mine?.hand ?? null;
  const myTurn = view.turn === me.id && view.phase !== 'end' && !view.syncing;
  const byId = useMemo(() => new Map((hand ?? []).map(t => [t.id, t])), [hand]);

  // elin sırasını koru: yeni gelen taş sona eklenir, giden taş çıkar
  useEffect(() => {
    if (!hand) return;
    setOrder(o => {
      const keep = o.filter(id => byId.has(id));
      const add = hand.map(t => t.id).filter(id => !keep.includes(id));
      return [...keep, ...add];
    });
    setSel(s => (s !== null && byId.has(s) ? s : null));
  }, [hand, byId]);

  function sortBy(mode: 'run' | 'set') {
    if (!hand) return;
    const key = (t: OTile) => {
      const wild = t.c === view.okey.c && t.n === view.okey.n;
      if (wild) return 9999;
      const v = t.c === 4 ? view.okey : t;
      return mode === 'run' ? v.c * 100 + v.n : v.n * 10 + v.c;
    };
    setOrder([...hand].sort((a, b) => key(a) - key(b)).map(t => t.id));
  }
  function nudge(d: number) {
    if (sel === null) return;
    setOrder(o => {
      const i = o.indexOf(sel), j = i + d;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; return n;
    });
  }

  async function act(m: any) {
    if (busy) return;
    setBusy(true);
    const r = await call('game:move', m);
    setBusy(false);
    if (!r.ok) toast(r.error!);
    else if (m.type !== 'draw') setSel(null);
  }

  const name = (id: string) => (id === me.id ? 'Sen' : people.get(id)?.username ?? '…');
  const ti = view.players.findIndex(p => p.id === view.turn);
  const prev = view.players[(ti - 1 + view.players.length) % view.players.length];
  const tiles = order.map(id => byId.get(id)).filter(Boolean) as OTile[];
  const rows = [tiles.slice(0, Math.ceil(tiles.length / 2)), tiles.slice(Math.ceil(tiles.length / 2))];

  return (
    <div className={`gt-table okey-table ${myTurn ? 'my-turn' : ''}`}>
      <PlayerStrip meId={me.id} people={people} items={view.players.map(p => ({
        id: p.id, active: p.id === view.turn && view.phase !== 'end', badge: `${p.count}`,
        sub: p.top ? <span className="ok-mini"><Tile t={p.top} okey={view.okey} small /></span> : '—',
      }))} />

      <div className="ok-center">
        <button className={`ok-pile ${myTurn && view.phase === 'draw' ? 'glow' : ''}`} disabled={!myTurn || view.phase !== 'draw' || busy}
          onClick={() => act({ type: 'draw', from: 'pile' })}>
          <span className="ok-back" /><small>{view.pile}</small><b>Ortadan çek</b>
        </button>
        <div className="ok-ind">
          <small>Gösterge</small>
          <Tile t={view.indicator} okey={view.okey} />
          <small>Okey: <b>{COLOR_NAMES[view.okey.c]} {view.okey.n}</b></small>
        </div>
        <button className={`ok-take ${myTurn && view.canTake ? 'glow' : ''}`} disabled={!myTurn || view.phase !== 'draw' || !view.canTake || busy}
          onClick={() => act({ type: 'draw', from: 'discard' })}>
          {prev?.top ? <Tile t={prev.top} okey={view.okey} /> : <span className="ok-empty" />}
          <b>{prev?.id === me.id ? 'Senin attığın' : `${name(prev?.id ?? '')} attı`}</b>
        </button>
      </div>

      <div className="uno-msg">
        {view.phase === 'end' ? '' : myTurn
          ? view.phase === 'draw' ? 'Sıra sende! Ortadan ya da soldakinden taş çek' : sel !== null ? 'Seçtiğin taşı at ya da elini bitir' : 'Atacağın taşı seç'
          : `${name(view.turn)} oynuyor…`}
        {view.phase !== 'end' && <Timer ms={left} total={35_000} />}
      </div>

      {hand ? (
        <>
          <div className="ok-rack">
            {rows.map((r, k) => (
              <div key={k} className="ok-row">
                {r.map(t => <Tile key={t.id} t={t} okey={view.okey} sel={sel === t.id} fresh={view.mine?.drawn === t.id} onClick={() => setSel(sel === t.id ? null : t.id)} />)}
              </div>
            ))}
          </div>
          <div className="ok-actions">
            <button className="btn ghost small" onClick={() => sortBy('run')}>Seri diz</button>
            <button className="btn ghost small" onClick={() => sortBy('set')}>Çift diz</button>
            <button className="btn ghost small" disabled={sel === null} onClick={() => nudge(-1)}>◀</button>
            <button className="btn ghost small" disabled={sel === null} onClick={() => nudge(1)}>▶</button>
            {myTurn && view.phase === 'discard' && <>
              <button className="btn primary small" disabled={sel === null || busy} onClick={() => act({ type: 'discard', tile: sel })}>At</button>
              <button className="btn gold small" disabled={sel === null || busy} onClick={() => act({ type: 'finish', tile: sel })}>Bitir 🎉</button>
            </>}
          </div>
        </>
      ) : view.phase !== 'end' && <div className="spectate">👀 İzliyorsun — sonraki oyun için koltuğa otur</div>}

      {view.phase === 'end' && (
        <WinOverlay winner={view.winner} people={people} meId={me.id}
          title={view.drawGame ? '🤝 Berabere' : undefined}
          lines={view.winHand ? <div className="ok-winhand">{view.pairs && <p>ÇİFTE ile bitirdi!</p>}<div>{view.winHand.map(t => <Tile key={t.id} t={t} okey={view.okey} small />)}</div></div> : null} />
      )}
    </div>
  );
}
