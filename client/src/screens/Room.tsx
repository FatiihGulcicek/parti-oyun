import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App';
import { call, getSocket, Profile } from '../net';
import { joinVoice, leaveVoice, onVoice, setMic, unlockAudio, VoiceStatus } from '../voice';
import UnoTable, { UnoView } from '../components/Uno';
import { GiftFx, GiftSheet } from '../components/Gifts';
import UserCard from '../components/UserCard';

interface SeatView { userId?: string; muted?: boolean; profile?: Profile | null; locked: boolean }
interface RoomState {
  id: string; name: string; topic: string; game: 'uno' | 'chat'; online: number; ownerId: string | null; voice: boolean;
  seats: SeatView[]; members: Profile[]; unoPlayers: string[]; playing: boolean;
}
interface ChatMsg { id: number; from: Profile | null; text: string; kind: 'chat' | 'system' | 'gift'; at: number }

const QUICK = ['👋 Selam!', '😂', '👏', 'Hadi başlayalım!', 'GG 🎉', '❤️'];

export default function RoomScreen({ roomId, onExit }: { roomId: string; onExit: () => void }) {
  const { me, toast } = useApp();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [uno, setUno] = useState<UnoView | null>(null);
  const [text, setText] = useState('');
  const [card, setCard] = useState<string | null>(null);
  const [giftTo, setGiftTo] = useState<string | null | undefined>(undefined);
  const [seatMenu, setSeatMenu] = useState<number | null>(null);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [vstatus, setVstatus] = useState<VoiceStatus>('off');
  const [showMembers, setShowMembers] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  // ---- bağlan / katıl
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    let alive = true;
    const join = async () => {
      const r = await call<{ room: RoomState; chat: ChatMsg[] }>('room:join', { roomId });
      if (!alive) return;
      if (!r.ok) { toast(r.error!); onExit(); return; }
      setRoom(r.room); setChat(r.chat);
      joinVoice();
    };
    const onState = (x: RoomState) => setRoom(x);
    const onMsg = (m: ChatMsg) => setChat(c => [...c.slice(-80), m]);
    const onUno = (v: UnoView | null) => setUno(v);
    s.on('room:state', onState); s.on('chat:msg', onMsg); s.on('uno:state', onUno);
    s.on('connect', join); // yeniden bağlanınca odaya tekrar gir
    join();
    const off = onVoice((sp, st) => { setSpeaking(new Set(sp)); setVstatus(st); });
    return () => {
      alive = false;
      s.off('room:state', onState); s.off('chat:msg', onMsg); s.off('uno:state', onUno); s.off('connect', join);
      off(); leaveVoice(); call('room:leave');
    };
  }, [roomId]);

  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }); }, [chat.length]);

  const people = useMemo(() => new Map((room?.members ?? []).map(m => [m.id, m])), [room?.members]);
  const mySeat = room?.seats.findIndex(s => s.userId === me.id) ?? -1;
  const seated = mySeat >= 0;
  const myMuted = seated ? Boolean(room!.seats[mySeat].muted) : true;
  const isOwner = room?.ownerId === me.id;
  const gameOn = Boolean(uno);

  // mikrofon durumu koltuk/sessiz durumunu takip eder
  useEffect(() => {
    if (vstatus !== 'on') return;
    const want = seated && !myMuted;
    let tries = 0;
    const tryMic = async () => { const ok = await setMic(want); if (!ok && want && tries++ < 4) setTimeout(tryMic, 700); };
    tryMic();
  }, [seated, myMuted, vstatus]);

  async function seatTap(i: number) {
    unlockAudio();
    const s = room!.seats[i];
    if (s.userId) return setCard(s.userId);
    if (isOwner) return setSeatMenu(i);
    if (s.locked) return toast('Bu koltuk kilitli 🔒');
    const r = await call('seat:take', { index: i });
    if (!r.ok) toast(r.error!);
  }

  async function send(t = text) {
    const v = t.trim();
    if (!v) return;
    setText('');
    const r = await call('chat:send', { text: v });
    if (!r.ok && r.error !== 'Çok hızlı') toast(r.error!);
  }

  async function startUno() {
    const r = await call('uno:start');
    if (!r.ok) toast(r.error!);
  }

  if (!room) return <div className="room loading"><div className="spinner" /></div>;

  const seatedCount = room.seats.filter(s => s.userId).length;

  const Seat = ({ s, i }: { s: SeatView; i: number }) => {
    const p = s.profile;
    const talking = p && speaking.has(p.id) && !s.muted;
    const inGame = p && room.unoPlayers.includes(p.id);
    return (
      <button className={`seat ${i === 0 ? 'host' : ''} ${talking ? 'talking' : ''} ${p ? 'filled' : ''}`} onClick={() => seatTap(i)}>
        <div className="seat-av">
          {p ? <span>{p.avatar}</span> : s.locked ? <span className="lock">🔒</span> : <span className="plus">＋</span>}
          {p && s.muted && <i className="muted-ic">🔇</i>}
          {p && room.ownerId === p.id && <i className="crown-ic">👑</i>}
          {inGame && <i className="game-ic">🎴</i>}
        </div>
        <small>{p ? p.username : i === 0 ? 'Ev sahibi' : `${i}`}</small>
      </button>
    );
  };

  return (
    <div className={`room ${gameOn ? 'gaming' : ''}`} onClick={unlockAudio}>
      <header className="room-head">
        <button className="icon-btn" onClick={onExit}>‹</button>
        <div className="room-title">
          <b>{room.name}</b>
          <small>ID {room.id} · {room.voice ? (vstatus === 'on' ? '🔊 Ses açık' : vstatus === 'connecting' ? '⏳ Ses bağlanıyor' : vstatus === 'error' ? '⚠️ Ses hatası' : '🔈') : '🔈 Ses kapalı'}</small>
        </div>
        <button className="online-btn" onClick={() => setShowMembers(true)}>
          <span className="stack">{room.members.slice(0, 3).map(m => <i key={m.id}>{m.avatar}</i>)}</span>{room.online}
        </button>
      </header>

      <div className={`seats ${gameOn ? 'compact' : ''}`}>
        <div className="seat-row host-row"><Seat s={room.seats[0]} i={0} /></div>
        <div className="seat-row">{room.seats.slice(1).map((s, j) => <Seat key={j + 1} s={s} i={j + 1} />)}</div>
      </div>

      <div className="stage">
        {room.game === 'uno' && uno ? <UnoTable view={uno} people={people} /> : room.game === 'uno' ? (
          <div className="uno-lobby">
            <div className="uno-logo">🎴 UNO</div>
            <p>Koltuktaki oyuncular oynar · <b>{Math.min(seatedCount, 6)}/6</b> hazır</p>
            {isOwner || !room.ownerId ? (
              <button className="btn gold big" disabled={seatedCount < 2 || !seated} onClick={startUno}>
                {!seated ? 'Başlatmak için koltuğa otur' : seatedCount < 2 ? 'En az 2 oyuncu gerekli' : 'Oyunu başlat ▶'}
              </button>
            ) : <p className="muted">Oda sahibinin başlatması bekleniyor…</p>}
          </div>
        ) : (
          <div className="topic-card"><h3>🎙️ {room.name}</h3><p>{room.topic || 'Koltuğa otur ve sohbete katıl!'}</p></div>
        )}
      </div>

      <div className={`chat ${gameOn ? 'mini' : ''}`} ref={chatRef}>
        <div className="chat-note">🛡️ Saygılı ol. Hakaret ve spam yasaktır.</div>
        {chat.map(m => (
          <div key={m.id} className={`msg k-${m.kind}`}>
            {m.from && <b onClick={() => setCard(m.from!.id)}>{m.from.avatar} {m.from.username}{m.kind === 'chat' ? ':' : ''}</b>} {m.text}
          </div>
        ))}
      </div>

      <div className="quick">{QUICK.map(q => <button key={q} onClick={() => send(q)}>{q}</button>)}</div>

      <footer className="room-bar">
        <form onSubmit={e => { e.preventDefault(); send(); }}>
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Bir şey söyle…" maxLength={200} />
        </form>
        {seated && (
          <button className={`icon-btn mic ${myMuted ? 'off' : 'on'}`} onClick={() => call('seat:mute', { muted: !myMuted })}>
            {myMuted ? '🔇' : '🎤'}
          </button>
        )}
        {seated && !room.unoPlayers.includes(me.id) && <button className="icon-btn" title="Koltuktan in" onClick={() => call('seat:leave')}>⬇️</button>}
        <button className="icon-btn gift-btn" onClick={() => setGiftTo(null)}>🎁</button>
      </footer>

      <GiftFx />

      {card && (
        <UserCard userId={card} onClose={() => setCard(null)}
          onGift={() => { setGiftTo(card); setCard(null); }}
          onKick={isOwner && room.seats.some(s => s.userId === card) ? async () => {
            const r = await call('seat:kick', { userId: card }); if (!r.ok) toast(r.error!); setCard(null);
          } : undefined} />
      )}
      {giftTo !== undefined && (
        <GiftSheet members={room.members} initialTo={giftTo ?? undefined} roomOwner={room.ownerId} onClose={() => setGiftTo(undefined)} />
      )}
      {seatMenu !== null && (
        <div className="sheet-bg" onClick={() => setSeatMenu(null)}>
          <div className="sheet action-sheet" onClick={e => e.stopPropagation()}>
            <button onClick={async () => { const r = await call('seat:take', { index: seatMenu }); if (!r.ok) toast(r.error!); setSeatMenu(null); }}>🪑 Buraya otur</button>
            <button onClick={async () => { await call('seat:lock', { index: seatMenu }); setSeatMenu(null); }}>
              {room.seats[seatMenu].locked ? '🔓 Kilidi aç' : '🔒 Koltuğu kilitle'}</button>
            <button className="cancel" onClick={() => setSeatMenu(null)}>Vazgeç</button>
          </div>
        </div>
      )}
      {showMembers && (
        <div className="sheet-bg" onClick={() => setShowMembers(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h3>Odadakiler ({room.members.length})</h3>
            {room.members.map(m => (
              <div key={m.id} className="row" onClick={() => { setShowMembers(false); setCard(m.id); }}>
                <span className="av">{m.avatar}</span><div className="grow"><b>{m.username}</b><small>Lv.{m.level}</small></div>
                {room.ownerId === m.id && <span>👑</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
