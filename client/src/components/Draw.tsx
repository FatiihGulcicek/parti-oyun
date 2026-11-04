import { useCallback, useEffect, useRef, useState } from 'react';
import { bus, call, type Profile } from '../net';
import { useApp } from '../App';
import { PlayerStrip, Timer, WinOverlay, useCountdown, type BaseView } from './GameKit';

export interface DrawView extends BaseView {
  players: { id: string; score: number; guessed: boolean; gained: number }[];
  drawer: string; phase: 'choose' | 'draw' | 'reveal' | 'end'; round: number; rounds: number; turn: number; totalTurns: number;
  mask: string[]; word: string | null; feed: { by: string; text?: string; kind: 'guess' | 'correct' | 'close' }[];
  drawStart: number; ends?: number; mine: { choices?: string[]; word?: string } | null;
}

const W = 1000, H = 750;
const COLORS = ['#1c1240', '#ffffff', '#ff4d6d', '#ff9a3d', '#ffcf3f', '#22c993', '#3fa9ff', '#8f4bff', '#ff4fa3', '#8b5a2b'];
const SIZES = [6, 14, 28];
const PHASE_MS = { choose: 15_000, draw: 75_000, reveal: 5_000, end: 1 };

interface Stroke { sid: string; color: string; size: number; pts: number[] }
type Msg =
  | { t: 'start'; sid: string; color: string; size: number; pts: number[]; turn: number; from?: string }
  | { t: 'pts'; sid: string; pts: number[]; turn: number; from?: string }
  | { t: 'undo'; turn: number; from?: string }
  | { t: 'clear'; turn: number; from?: string }
  | { t: 'sync'; strokes: Stroke[]; turn: number; from?: string }
  | { t: 'need'; turn: number; from?: string };

function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of strokes) {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.size;
    ctx.beginPath();
    if (s.pts.length === 2) { ctx.moveTo(s.pts[0], s.pts[1]); ctx.lineTo(s.pts[0] + .1, s.pts[1] + .1); }
    for (let i = 0; i < s.pts.length; i += 2) i === 0 ? ctx.moveTo(s.pts[0], s.pts[1]) : ctx.lineTo(s.pts[i], s.pts[i + 1]);
    ctx.stroke();
  }
}

export default function DrawTable({ view, people }: { view: DrawView; people: Map<string, Profile> }) {
  const { me, toast } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const cur = useRef<Stroke | null>(null);
  const pending = useRef<number[]>([]);
  const raf = useRef(0);
  const turnRef = useRef(view.turn);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [eraser, setEraser] = useState(false);
  const [guess, setGuess] = useState('');
  const [busy, setBusy] = useState(false);

  const amDrawer = view.drawer === me.id;
  const inGame = view.players.some(p => p.id === me.id);
  const iGuessed = view.players.find(p => p.id === me.id)?.guessed ?? false;
  const canDraw = amDrawer && view.phase === 'draw';
  // view.ends: turun (ipuçlarından bağımsız) bitiş anı, sunucu saatiyle
  const left = useCountdown(view.ends ?? view.deadline, view.serverNow, view.phase !== 'end');

  const redraw = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const c = canvasRef.current; if (!c) return;
      const ctx = c.getContext('2d'); if (!ctx) return;
      paint(ctx, strokes.current, c.width / W);
    });
  }, []);

  // tuvali kap boyutuna göre ölçekle
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.width * dpr * H / W);
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(c);
    return () => ro.disconnect();
  }, [redraw]);

  const send = (m: Msg) => call('draw:send', m);

  // yeni çizer / yeni tur → tuval temizlenir
  useEffect(() => {
    turnRef.current = view.turn;
    strokes.current = []; cur.current = null; redraw();
    if (view.phase === 'draw' && !amDrawer) send({ t: 'need', turn: view.turn });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.turn]);

  // gelen çizgiler
  useEffect(() => {
    const on = (m: Msg) => {
      if (!m || m.turn !== turnRef.current) return;
      if (m.t === 'need') { if (amDrawer) send({ t: 'sync', strokes: strokes.current, turn: turnRef.current }); return; }
      if (m.from !== view.drawer || amDrawer) return; // yalnızca çizenin çizgileri
      if (m.t === 'start') strokes.current.push({ sid: m.sid, color: m.color, size: m.size, pts: [...m.pts] });
      else if (m.t === 'pts') strokes.current.find(s => s.sid === m.sid)?.pts.push(...m.pts);
      else if (m.t === 'undo') strokes.current.pop();
      else if (m.t === 'clear') strokes.current = [];
      else if (m.t === 'sync') strokes.current = m.strokes;
      redraw();
    };
    bus.on('draw:stroke', on);
    return () => bus.off('draw:stroke', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amDrawer, view.drawer]);

  // çizerken nokta paketlerini ~45 ms'de bir gönder
  useEffect(() => {
    if (!canDraw) return;
    const t = setInterval(() => {
      if (cur.current && pending.current.length) {
        send({ t: 'pts', sid: cur.current.sid, pts: pending.current, turn: turnRef.current });
        pending.current = [];
      }
    }, 45);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDraw]);

  function point(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H)];
  }
  function down(e: React.PointerEvent) {
    if (!canDraw) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const [x, y] = point(e);
    const s: Stroke = { sid: `${me.id.slice(0, 4)}${Date.now().toString(36)}`, color: eraser ? '#ffffff' : color, size: eraser ? 36 : size, pts: [x, y] };
    cur.current = s; strokes.current.push(s); pending.current = [];
    send({ t: 'start', sid: s.sid, color: s.color, size: s.size, pts: [x, y], turn: turnRef.current });
    redraw();
  }
  function move(e: React.PointerEvent) {
    if (!cur.current) return;
    const [x, y] = point(e);
    const p = cur.current.pts;
    if (Math.abs(p[p.length - 2] - x) + Math.abs(p[p.length - 1] - y) < 4) return;
    p.push(x, y); pending.current.push(x, y);
    redraw();
  }
  function up() {
    if (cur.current && pending.current.length) send({ t: 'pts', sid: cur.current.sid, pts: pending.current, turn: turnRef.current });
    pending.current = []; cur.current = null;
  }
  function undo() { strokes.current.pop(); redraw(); send({ t: 'undo', turn: turnRef.current }); }
  function clear() { strokes.current = []; redraw(); send({ t: 'clear', turn: turnRef.current }); }

  async function act(m: any) {
    if (busy) return null;
    setBusy(true);
    const r = await call<{ result?: string }>('game:move', m);
    setBusy(false);
    if (!r.ok) { toast(r.error!); return null; }
    return r;
  }
  async function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    const t = guess.trim();
    if (!t) return;
    setGuess('');
    const r = await act({ type: 'guess', text: t });
    if (r?.result === 'close') toast('Çok yaklaştın! 🔥');
  }

  const name = (id: string) => (id === me.id ? 'Sen' : people.get(id)?.username ?? '…');
  const ranked = [...view.players].sort((a, b) => b.score - a.score);
  const drawerName = name(view.drawer);

  return (
    <div className="gt-table draw-table">
      <PlayerStrip meId={me.id} people={people} items={view.players.map(p => ({
        id: p.id, active: p.id === view.drawer, badge: p.id === view.drawer ? '✏️' : p.guessed ? '✅' : undefined,
        sub: <>{p.score}{p.gained ? <em className="gain">+{p.gained}</em> : null}</>,
      }))} />

      <div className="dt-bar">
        <span className="dt-round">Tur {view.turn}/{view.totalTurns}</span>
        <div className="dt-word">
          {amDrawer && view.mine?.word ? <b className="secret">{view.mine.word}</b>
            : view.mask.length ? view.mask.map((c, i) => <i key={i} className={c === ' ' ? 'sp' : c === '_' ? 'blank' : ''}>{c === '_' ? '' : c}</i>)
              : <small>{view.phase === 'choose' ? `${drawerName} kelime seçiyor…` : ''}</small>}
          {view.mask.length > 0 && !(amDrawer && view.mine?.word) && <small className="cnt">{view.mask.filter(c => c !== ' ').length} harf</small>}
        </div>
        {view.phase !== 'end' && <Timer ms={left} total={PHASE_MS[view.phase]} />}
      </div>

      <div className={`dt-canvas ${canDraw ? 'is-drawing' : ''}`}>
        <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
        {view.phase === 'choose' && (
          <div className="dt-over">
            {amDrawer && view.mine?.choices ? (
              <>
                <h3>Çizeceğin kelimeyi seç</h3>
                <div className="dt-choices">
                  {view.mine.choices.map((w, i) => <button key={w} className="btn primary" disabled={busy} onClick={() => act({ type: 'choose', index: i })}>{w}</button>)}
                </div>
              </>
            ) : <h3 className="pulse-text">✏️ {drawerName} kelime seçiyor…</h3>}
          </div>
        )}
        {view.phase === 'reveal' && (
          <div className="dt-over">
            <small>Kelime</small>
            <h2 className="dt-reveal">{view.word}</h2>
            <div className="dt-gains">
              {view.players.filter(p => p.gained).sort((a, b) => b.gained - a.gained).map(p => <span key={p.id}>{name(p.id)} <b>+{p.gained}</b></span>)}
              {!view.players.some(p => p.gained) && <span>Kimse bilemedi 😅</span>}
            </div>
          </div>
        )}
      </div>

      {canDraw && view.feed.length > 0 && (
        <div className="dt-feed compact">
          {view.feed.slice(-2).map((f, i) => (
            <div key={i} className={`df-${f.kind}`}>
              {f.kind === 'correct' ? <>✅ <b>{name(f.by)}</b> bildi!</> : f.kind === 'close' ? <>🔥 <b>{name(f.by)}</b> çok yaklaştı!</> : <><b>{name(f.by)}:</b> {f.text}</>}
            </div>
          ))}
        </div>
      )}
      {canDraw ? (
        <div className="dt-tools">
          <div className="dt-colors">
            {COLORS.map(c => <button key={c} className={!eraser && color === c ? 'on' : ''} style={{ background: c }} onClick={() => { setColor(c); setEraser(false); }} aria-label="Renk" />)}
          </div>
          <div className="dt-actions">
            {SIZES.map(s => <button key={s} className={`dt-size ${!eraser && size === s ? 'on' : ''}`} onClick={() => { setSize(s); setEraser(false); }} aria-label="Kalınlık"><i style={{ width: s / 1.6 + 4, height: s / 1.6 + 4 }} /></button>)}
            <button className={`dt-tool ${eraser ? 'on' : ''}`} onClick={() => setEraser(e => !e)}>🧽</button>
            <button className="dt-tool" onClick={undo}>↶</button>
            <button className="dt-tool" onClick={clear}>🗑️</button>
          </div>
        </div>
      ) : (
        <div className="dt-guess">
          <div className="dt-feed">
            {view.feed.slice(-4).map((f, i) => (
              <div key={i} className={`df-${f.kind}`}>
                {f.kind === 'correct' ? <>✅ <b>{name(f.by)}</b> bildi!</> : f.kind === 'close' ? <>🔥 <b>{name(f.by)}</b> çok yaklaştı!</> : <><b>{name(f.by)}:</b> {f.text}</>}
              </div>
            ))}
          </div>
          {inGame && view.phase === 'draw' && !amDrawer && (iGuessed
            ? <div className="dt-done">✅ Bildin! Diğerlerini bekle…</div>
            : <form onSubmit={submitGuess}><input value={guess} onChange={e => setGuess(e.target.value)} placeholder="Tahminini yaz…" maxLength={40} autoComplete="off" /><button className="btn primary small" disabled={busy || !guess.trim()}>Tahmin</button></form>)}
          {!inGame && <div className="spectate">👀 İzliyorsun — sonraki oyun için koltuğa otur</div>}
        </div>
      )}

      {view.phase === 'end' && (
        <WinOverlay winner={view.winner} people={people} meId={me.id}
          lines={<div className="rank-list">{ranked.map((p, i) => <div key={p.id}><span>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} {name(p.id)}</span><b>{p.score}</b></div>)}</div>} />
      )}
    </div>
  );
}
