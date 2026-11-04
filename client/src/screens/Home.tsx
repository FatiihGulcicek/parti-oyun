import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { call } from '../net';
import { IconPlus } from '../components/Icons';
import Avatar from '../components/Avatar';

type GameId = 'uno' | 'chat' | 'ludo';
interface RoomSummary {
  id: string; name: string; topic: string; game: GameId; online: number; seated: number; playing: boolean;
  owner: { username: string; avatar: string } | null;
}

const GAME_ICON: Record<GameId, string> = { uno: '🎴', chat: '🎙️', ludo: '🎲' };
const GAME_NAME: Record<GameId, string> = { uno: 'Uno', chat: 'Sohbet', ludo: 'Ludo' };

const SLIDES: { game: GameId; title: string; text: string; cta: string; art: string; tone: string }[] = [
  { game: 'ludo', title: 'Ludo masası kuruldu!', text: 'Zarı at, rakibini kır, eve ilk sen var.', cta: 'Hemen oyna', art: '🎲', tone: 'tone-ludo' },
  { game: 'uno', title: 'UNO demeyi unutma', text: '2-6 kişilik hızlı Uno masaları seni bekliyor.', cta: 'Masaya otur', art: '🎴', tone: 'tone-uno' },
  { game: 'chat', title: 'Sesli sohbet odaları', text: 'Koltuğa otur, mikrofonu aç, yeni insanlarla tanış.', cta: 'Odaya gir', art: '🎙️', tone: 'tone-chat' },
];

export function WalletPill() {
  const { wallet } = useApp();
  return (
    <div className="wallet-pill">
      <span className="wp-dia">💎 {wallet.diamonds.toLocaleString('tr-TR')}</span>
      <span className="wp-coin">🪙 {wallet.coins.toLocaleString('tr-TR')}</span>
    </div>
  );
}

function HeroCarousel({ onPlay }: { onPlay: (g: GameId) => void }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI(x => (x + 1) % SLIDES.length), 4500); return () => clearInterval(t); }, []);
  return (
    <div className="hero">
      <div className="hero-track" style={{ transform: `translateX(-${i * 100}%)` }}>
        {SLIDES.map(s => (
          <div key={s.game} className={`hero-slide ${s.tone}`}>
            <div className="hero-copy">
              <h2>{s.title}</h2>
              <p>{s.text}</p>
              <button className="btn white small" onClick={() => onPlay(s.game)}>{s.cta} ›</button>
            </div>
            <div className="hero-art"><span>{s.art}</span></div>
            <i className="hero-blob b1" /><i className="hero-blob b2" />
          </div>
        ))}
      </div>
      <div className="hero-dots">{SLIDES.map((s, k) => <button key={s.game} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`${k + 1}. tanıtım`} />)}</div>
    </div>
  );
}

export default function Home() {
  const { me, openRoom, toast } = useApp();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [filter, setFilter] = useState<'all' | GameId>('all');
  const [creating, setCreating] = useState<null | GameId>(null);
  const [name, setName] = useState('');

  async function load() {
    const r = await call<{ rooms: RoomSummary[] }>('lobby:list');
    if (r.ok) setRooms(r.rooms);
  }
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  async function quickPlay(game: GameId) {
    const pick = rooms?.filter(r => r.game === game && !r.playing && r.seated < 9).sort((a, b) => b.online - a.online)[0];
    if (pick) openRoom(pick.id); else { setName(`${me.username} odası`); setCreating(game); }
  }

  async function create() {
    const r = await call<{ roomId: string }>('room:create', { name, game: creating });
    if (!r.ok) return toast(r.error!);
    setCreating(null);
    openRoom(r.roomId);
  }

  const online = (g: GameId) => (rooms ?? []).filter(r => r.game === g).reduce((n, r) => n + Number(r.online), 0);
  const shown = rooms?.filter(r => filter === 'all' || r.game === filter) ?? [];

  return (
    <div className="home">
      <header className="home-top">
        <div className="me-chip">
          <span className="av"><Avatar value={me.avatar} /></span>
          <div><b>{me.username}</b><span className="lv">Lv.{me.level}</span></div>
        </div>
        <WalletPill />
      </header>

      <HeroCarousel onPlay={quickPlay} />

      <div className="section-head"><h3>Oyunlar</h3><small>{online('uno') + online('ludo') + online('chat')} kişi çevrimiçi</small></div>
      <div className="game-grid">
        <button className="game-card gc-uno" onClick={() => quickPlay('uno')}>
          <div className="gc-art uno-art"><i /><i /><i /></div>
          <div className="gc-copy"><b>Uno</b><small>2-6 oyuncu</small></div>
          <span className="gc-live"><i />{online('uno')}</span>
          <span className="gc-play">Oyna</span>
        </button>
        <button className="game-card gc-ludo" onClick={() => quickPlay('ludo')}>
          <div className="gc-art ludo-art"><span className="d1">🎲</span><span className="d2">🎲</span></div>
          <div className="gc-copy"><b>Ludo</b><small>2-4 oyuncu</small></div>
          <span className="gc-live"><i />{online('ludo')}</span>
          <em className="gc-new">YENİ</em>
          <span className="gc-play">Oyna</span>
        </button>
        <button className="game-card small gc-chat" onClick={() => quickPlay('chat')}>
          <span className="gc-emoji">🎙️</span>
          <div className="gc-copy"><b>Sesli Sohbet</b><small><i className="dot" />{online('chat')} kişi</small></div>
        </button>
        <button className="game-card small gc-draw soon" onClick={() => toast('Çiz-Tahmin yakında geliyor!')}>
          <span className="gc-emoji">🎨</span>
          <div className="gc-copy"><b>Çiz-Tahmin</b><small>Yakında</small></div>
        </button>
      </div>

      <div className="section-head">
        <h3>Canlı odalar</h3>
      </div>
      <div className="chips">
        {(['all', 'uno', 'ludo', 'chat'] as const).map(f => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? '🔥 Tümü' : `${GAME_ICON[f]} ${GAME_NAME[f]}`}
          </button>
        ))}
      </div>

      <div className="room-grid">
        {rooms === null && <div className="spinner" />}
        {shown.map(r => (
          <button key={r.id} className="room-card" onClick={() => openRoom(r.id)}>
            <div className={`rc-cover tone-${r.game}`}>
              {r.game === 'uno' ? <div className="uno-art"><i /><i /><i /></div> : <span className="rc-emoji">{GAME_ICON[r.game] ?? '🎙️'}</span>}
              {r.playing ? <em className="rc-badge live">OYUNDA</em> : <em className="rc-badge">{GAME_NAME[r.game] ?? 'Oda'}</em>}
              <span className="rc-online"><i className="eq"><b /><b /><b /></i>{r.online}</span>
            </div>
            <div className="rc-body">
              <b>{r.name}</b>
              <small>{r.owner ? <><Avatar value={r.owner.avatar} className="inline" /> {r.owner.username}</> : r.topic || 'Herkese açık'}</small>
              <span className="rc-seats">🪑 {r.seated}/9</span>
            </div>
          </button>
        ))}
        {rooms && shown.length === 0 && <p className="empty">Henüz oda yok. İlkini sen aç! 🎈</p>}
      </div>

      <button className="fab" aria-label="Oda aç" onClick={() => { setName(`${me.username} odası`); setCreating(filter === 'all' ? 'uno' : filter); }}>
        <IconPlus size={28} />
      </button>

      {creating && (
        <div className="sheet-bg" onClick={() => setCreating(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h3>Oda oluştur</h3>
            <div className="create-pick">
              {(['uno', 'ludo', 'chat'] as const).map(g => (
                <button key={g} className={`tone-${g} ${creating === g ? 'on' : ''}`} onClick={() => setCreating(g)}>
                  <span>{GAME_ICON[g]}</span>{GAME_NAME[g]}
                </button>
              ))}
            </div>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={30} placeholder="Oda adı" />
            <button className="btn primary big" onClick={create}>Oluştur</button>
          </div>
        </div>
      )}
    </div>
  );
}
