import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App';
import { bus, call, Profile } from '../net';
import { joinVoice, leaveVoice, onVoice, setMic, unlockAudio, VoiceStatus } from '../voice';
import UnoTable, { UnoView } from '../components/Uno';
import LudoTable, { LudoView } from '../components/Ludo';
import { GiftFx, GiftSheet } from '../components/Gifts';
import UserCard from '../components/UserCard';
import { IconBack, IconGift, IconLock, IconMic, IconMicOff, IconSeatDown, IconSend, IconSofa } from '../components/Icons';

interface SeatView { userId?: string; muted?: boolean; profile?: Profile | null; locked: boolean }
interface RoomState {
  id: string; name: string; topic: string; game: 'uno' | 'chat' | 'ludo'; online: number; ownerId: string | null; voice: boolean;
  seats: SeatView[]; members: Profile[]; unoPlayers: string[]; playing: boolean;
}
interface ChatMsg { id: number; from: Profile | null; text: string; kind: 'chat' | 'system' | 'gift'; at: number }

const QUICK = ['👋 Selam!', '😂', '👏', 'Hadi başlayalım!', 'GG 🎉', '❤️'];

export default function RoomScreen({ roomId, onExit }: { roomId: string; onExit: () => void }) {
  const { me, toast } = useApp();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [uno, setUno] = useState<UnoView | null>(null);
  const [ludo, setLudo] = useState<LudoView | null>(null);
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
    let alive = true;
    const join = async () => {
      const r = await call<{ room: RoomState; chat: ChatMsg[] }>('room:join', { roomId });
      if (!alive) return;
      if (!r.ok) { toast(r.error!); onExit(); return; }
      if (r.room) setRoom(r.room); setChat(r.chat);
      joinVoice();
    };
    const onState = (x: RoomState) => setRoom(x);
    const onMsg = (m: ChatMsg) => setChat(c => [...c.slice(-80), m]);
    const onUno = (v: UnoView | null) => setUno(v);
    const onLudo = (v: LudoView | null) => setLudo(v);
    const onKicked = (why?: string) => { toast(why || 'Odadan atıldın'); onExit(); };
    const onBlock = (b: { id: string; blocked: boolean }) => { if (b.blocked) setChat(c => c.filter(m => !(m.kind === 'chat' && m.from?.id === b.id))); };
    bus.on('room:kicked', onKicked); bus.on('block:changed', onBlock);
    bus.on('room:state', onState); bus.on('chat:msg', onMsg); bus.on('uno:state', onUno); bus.on('ludo:state', onLudo);
    join();
    const off = onVoice((sp, st) => { setSpeaking(new Set(sp)); setVstatus(st); });
    return () => {
      alive = false;
      bus.off('room:kicked', onKicked); bus.off('block:changed', onBlock);
      bus.off('room:state', onState); bus.off('chat:msg', onMsg); bus.off('uno:state', onUno); bus.off('ludo:state', onLudo);
      off(); leaveVoice(); call('room:leave');
    };
  }, [roomId]);

  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }); }, [chat.length]);

  const people = useMemo(() => new Map((room?.members ?? []).map(m => [m.id, m])), [room?.members]);
  const mySeat = room?.seats.findIndex(s => s.userId === me.id) ?? -1;
  const seated = mySeat >= 0;
  const myMuted = seated ? Boolean(room!.seats[mySeat].muted) : true;
  const isOwner = room?.ownerId === me.id;
  const gameOn = room?.game === 'ludo' ? Boolean(ludo) : Boolean(uno);

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

  async function startGame() {
    const r = await call(room?.game === 'ludo' ? 'ludo:start' : 'uno:start');
    if (!r.ok) toast(r.error!);
  }

  if (!room) return <div className="room loading"><div className="spinner" /></div>;

  const seatedCount = room.seats.filter(s => s.userId).length;
  const maxPlayers = room.game === 'ludo' ? 4 : 6;

  const Seat = ({ s, i }: { s: SeatView; i: number }) => {
    const p = s.profile;
    const talking = p && speaking.has(p.id) && !s.muted;
    const inGame = p && room.unoPlayers.includes(p.id);
    return (
      <button className={`seat ${i === 0 ? 'host' : ''} ${talking ? 'talking' : ''} ${p ? 'filled' : ''}`} onClick={() => seatTap(i)}>
        <div className="seat-av">
          {p ? <span>{p.avatar}</span> : s.locked ? <span className="lock"><IconLock size={20} /></span> : <span className="plus"><IconSofa size={24} /></span>}
          {p && s.muted && <i className="muted-ic"><IconMicOff size={11} /></i>}
          {p && room.ownerId === p.id && <i className="crown-ic">👑</i>}
          {inGame && <i className="game-ic">{room.game === 'ludo' ? '🎲' : '🎴'}</i>}
        </div>
        <small>{p ? p.username : i === 0 ? 'Ev sahibi' : `${i}`}</small>
      </button>
    );
  };

  return (
    <div className={`room tone-${room.game} ${gameOn ? 'gaming' : ''}`} onClick={unlockAudio}>
      <header className="room-head">
        <button className="icon-btn back" onClick={onExit} aria-label="Geri"><IconBack size={22} /></button>
        <div className="room-title">
          <span className="rt-cover">{room.game === 'ludo' ? '🎲' : room.game === 'uno' ? '🎴' : '🎙️'}</span>
          <div>
            <b>{room.name}</b>
            <small>ID {room.id} · {room.voice ? (vstatus === 'on' ? '🔊 Ses açık' : vstatus === 'connecting' ? '⏳ Bağlanıyor' : vstatus === 'error' ? '⚠️ Ses hatası' : '🔈') : '🔈 Ses kapalı'}</small>
          </div>
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
        {room.game === 'uno' && uno ? <UnoTable view={uno} people={people} />
          : room.game === 'ludo' && ludo ? <LudoTable view={ludo} people={people} />
          : room.game !== 'chat' ? (
          <div className="uno-lobby">
            <div className="uno-logo">{room.game === 'ludo' ? '🎲 LUDO' : '🎴 UNO'}</div>
            <p>Koltuktaki oyuncular oynar · <b>{Math.min(seatedCount, maxPlayers)}/{maxPlayers}</b> hazır</p>
            {room.game === 'ludo' && <small>Kızma Birader! 6 atan taşını çıkarır, rakibin üstüne gelen taşı kırar.</small>}
            {isOwner || !room.ownerId ? (
              <button className="btn gold big" disabled={seatedCount < 2 || !seated} onClick={startGame}>
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
            {m.from && <b onClick={() => setCard(m.from!.id)}><i className="lvc">Lv.{m.from.level}</i>{m.from.avatar} {m.from.username}{m.kind === 'chat' ? ':' : ''}</b>} {m.text}
          </div>
        ))}
      </div>

      <div className="quick">{QUICK.map(q => <button key={q} onClick={() => send(q)}>{q}</button>)}</div>

      <footer className="room-bar">
        <form onSubmit={e => { e.preventDefault(); send(); }}>
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Bir şey söyle…" maxLength={200} />
          {text.trim() && <button className="send-btn" aria-label="Gönder"><IconSend size={18} /></button>}
        </form>
        {seated && (
          <button className={`icon-btn mic ${myMuted ? 'off' : 'on'}`} aria-label={myMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
            onClick={() => call('seat:mute', { muted: !myMuted })}>
            {myMuted ? <IconMicOff size={20} /> : <IconMic size={20} />}
          </button>
        )}
        {seated && !room.unoPlayers.includes(me.id) && <button className="icon-btn" aria-label="Koltuktan in" title="Koltuktan in" onClick={() => call('seat:leave')}><IconSeatDown size={20} /></button>}
        <button className="icon-btn gift-btn" aria-label="Hediye gönder" onClick={() => setGiftTo(null)}><IconGift size={22} /></button>
      </footer>

      <GiftFx />

      {card && (
        <UserCard userId={card} onClose={() => setCard(null)}
          onGift={() => { setGiftTo(card); setCard(null); }}
          onKick={isOwner && room.seats.some(s => s.userId === card) ? async () => {
            const r = await call('seat:kick', { userId: card }); if (!r.ok) toast(r.error!); setCard(null);
          } : undefined}
          onRoomKick={isOwner && card !== me.id && room.members.some(m => m.id === card) ? async () => {
            const r = await call('room:kick', { userId: card }); toast(r.ok ? 'Kullanıcı odadan atıldı' : r.error!); setCard(null);
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
