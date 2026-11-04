import { useState } from 'react';
import { call, type Profile } from '../net';
import { useApp } from '../App';
import Avatar from './Avatar';
import { PlayerStrip, Timer, WinOverlay, useCountdown, type BaseView } from './GameKit';

export interface SpyView extends BaseView {
  players: { id: string; voted: boolean; votes?: number }[];
  order: string[]; phase: 'clue' | 'vote' | 'guess' | 'end'; category: string; rounds: number; clueRound: number;
  cluer: string | null; clues: { by: string; text: string; round: number }[]; accused: string | null;
  votes?: Record<string, string>; spy: string | null; word: string | null; spyGuess: string | null; spyWon: boolean | null;
  winners: string[]; reason: string | null; ends: number;
  mine: { spy: boolean; category: string; word?: string } | null;
}

const PHASE_MS = { clue: 30_000, vote: 40_000, guess: 25_000, end: 1 };

export default function SpyTable({ view, people }: { view: SpyView; people: Map<string, Profile> }) {
  const { me, toast } = useApp();
  const [text, setText] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const [peek, setPeek] = useState(false);
  const [busy, setBusy] = useState(false);
  const left = useCountdown(view.ends || view.deadline, view.serverNow, view.phase !== 'end');
  const inGame = view.players.some(p => p.id === me.id);
  const amSpy = Boolean(view.mine?.spy);
  const myTurn = view.phase === 'clue' && view.cluer === me.id;
  const iVoted = view.players.find(p => p.id === me.id)?.voted ?? false;
  const name = (id: string | null) => (!id ? '?' : id === me.id ? 'Sen' : people.get(id)?.username ?? '…');

  async function act(m: any) {
    if (busy) return false;
    setBusy(true);
    const r = await call('game:move', m);
    setBusy(false);
    if (!r.ok) { toast(r.error!); return false; }
    return true;
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (await act({ type: view.phase === 'guess' ? 'guess' : 'clue', text: t })) setText('');
  }

  return (
    <div className="gt-table spy-table">
      <PlayerStrip meId={me.id} people={people} items={view.order.filter(id => view.players.some(p => p.id === id)).map(id => {
        const p = view.players.find(x => x.id === id)!;
        return {
          id, active: view.cluer === id || (view.phase === 'guess' && view.accused === id),
          badge: view.cluer === id ? '✍️' : view.phase === 'vote' && p.voted ? '✔️' : view.phase === 'end' && view.spy === id ? '🕵️' : undefined,
          sub: view.phase === 'end' ? `${p.votes ?? 0} oy` : undefined,
        };
      })} />

      <div className="dt-bar">
        <span className="dt-round">{view.phase === 'clue' ? `İpucu ${view.clueRound}/${view.rounds}` : view.phase === 'vote' ? 'Oylama' : view.phase === 'guess' ? 'Son şans' : 'Sonuç'}</span>
        <span className="spy-cat">Kategori: <b>{view.category}</b></span>
        {view.phase !== 'end' && <Timer ms={left} total={PHASE_MS[view.phase]} />}
      </div>

      {inGame && view.mine && (
        <button className={`spy-card ${peek ? 'open' : ''} ${amSpy ? 'is-spy' : ''}`} onClick={() => setPeek(p => !p)}>
          {peek ? (amSpy
            ? <><span className="sc-ic">🕵️</span><div><b>Sen CASUSSUN!</b><small>Kelimeyi bilmiyorsun. İpuçlarından tahmin et, belli etme.</small></div></>
            : <><span className="sc-ic">🔑</span><div><small>Gizli kelime</small><b className="sc-word">{view.mine.word}</b></div></>)
            : <><span className="sc-ic">🃏</span><div><b>Kartına bakmak için dokun</b><small>Kimse görmesin 🤫</small></div></>}
        </button>
      )}

      <div className="spy-clues">
        {view.clues.length === 0 && <p className="muted center">İlk ipucu bekleniyor…</p>}
        {view.clues.map((c, i) => (
          <div key={i} className="spy-clue">
            <span className="av"><Avatar value={people.get(c.by)?.avatar} /></span>
            <div><small>{name(c.by)}</small><b>{c.text}</b></div>
          </div>
        ))}
      </div>

      {view.phase === 'clue' && (myTurn
        ? <form className="spy-input" onSubmit={submit}><input value={text} onChange={e => setText(e.target.value)} placeholder={amSpy ? 'Belli etmeden bir ipucu yaz…' : 'Tek kelimelik ipucu (kelimeyi söyleme!)'} maxLength={30} autoFocus /><button className="btn primary small" disabled={busy || !text.trim()}>Gönder</button></form>
        : <div className="spy-wait">✍️ {name(view.cluer)} ipucu yazıyor… <small>Sesli de anlatabilirsiniz 🎙️</small></div>)}

      {view.phase === 'vote' && (inGame ? (
        <div className="spy-vote">
          <h3>{iVoted ? 'Oyunu verdin, diğerleri bekleniyor…' : 'Sence casus kim?'}</h3>
          <div className="spy-grid">
            {view.players.filter(p => p.id !== me.id).map(p => (
              <button key={p.id} className={pick === p.id ? 'on' : ''} disabled={iVoted} onClick={() => setPick(p.id)}>
                <span className="av"><Avatar value={people.get(p.id)?.avatar} /></span><small>{name(p.id)}</small>
              </button>
            ))}
          </div>
          {!iVoted && <button className="btn danger" disabled={!pick || busy} onClick={() => pick && act({ type: 'vote', target: pick })}>🗳️ Oy ver</button>}
        </div>
      ) : <div className="spy-wait">🗳️ Oylama sürüyor…</div>)}

      {view.phase === 'guess' && (amSpy
        ? <form className="spy-input" onSubmit={submit}><input value={text} onChange={e => setText(e.target.value)} placeholder="Yakalandın! Kelime neydi?" maxLength={40} autoFocus /><button className="btn gold small" disabled={busy || !text.trim()}>Tahmin et</button></form>
        : <div className="spy-wait">🎯 {name(view.accused)} yakalandı! Kelimeyi tahmin ediyor…</div>)}

      {!inGame && view.phase !== 'end' && <div className="spectate">👀 İzliyorsun — sonraki oyun için koltuğa otur</div>}

      {view.phase === 'end' && (
        <WinOverlay winner={view.spyWon ? view.spy : null} people={people} meId={me.id}
          title={view.spyWon ? `🕵️ Casus ${name(view.spy)} kazandı!` : '🎉 Casus yakalandı!'}
          lines={<div className="spy-end">
            {!view.spyWon && view.spy && <div className="spy-reveal"><span className="av"><Avatar value={people.get(view.spy)?.avatar} /></span><span>Casus: <b>{name(view.spy)}</b></span></div>}
            <p>Kelime: <b>{view.word}</b>{view.spyGuess && <> · Casusun tahmini: <b>{view.spyGuess}</b></>}</p>
            <p className="muted">{view.winners.includes(me.id) ? 'Kazananlar arasındasın! 🏆' : inGame ? 'Bu sefer olmadı 😅' : ''}</p>
          </div>} />
      )}
    </div>
  );
}
