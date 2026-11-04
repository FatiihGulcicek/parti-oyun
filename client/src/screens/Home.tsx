import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { call } from '../net';
import { IconPlus } from '../components/Icons';
import Avatar from '../components/Avatar';
import { ChatArt, DrawArt, LudoArt, OkeyArt, SpyArt, TavlaArt, UnoArt } from '../components/HeroArt';
import { GAMES, PLAYABLE, meta, type GameId } from '../games';
import { CoinIcon, GemIcon, LevelBadge, greeting } from '../components/Currency';

interface RoomSummary {
  id: string; name: string; topic: string; game: GameId; online: number; seated: number; playing: boolean;
  owner: { username: string; avatar: string } | null;
}

const GAME_ICON = (g: string) => meta(g).icon;
const GAME_NAME = (g: string) => (g === 'chat' ? 'Sohbet' : meta(g).name);

/** Oyun kartı / oda kapağı çizimi. */
function GameArt({ g }: { g: string }) {
  switch (g) {
    case 'uno': return <div className="uno-art"><i /><i /><i /></div>;
    case 'ludo': return <LudoArt />;
    case 'draw': return <DrawArt />;
    case 'spy': return <SpyArt />;
    case 'tavla': return <TavlaArt />;
    case 'okey': return <OkeyArt />;
    default: return <ChatArt />;
  }
}

const SLIDES: { game: GameId; title: string; text: string; cta: string; tone: string }[] = [
  { game: 'ludo', title: 'Ludo masası kuruldu!', text: 'Zarı at, rakibini kır, eve ilk sen var.', cta: 'Hemen oyna', tone: 'tone-ludo' },
  { game: 'uno', title: 'UNO demeyi unutma', text: '2-6 kişilik hızlı Uno masaları seni bekliyor.', cta: 'Masaya otur', tone: 'tone-uno' },
  { game: 'chat', title: 'Sesli sohbet odaları', text: 'Koltuğa otur, mikrofonu aç, yeni insanlarla tanış.', cta: 'Odaya gir', tone: 'tone-chat' },
];

const compact = (n: number) => n >= 10_000 ? `${(n / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}B` : n.toLocaleString('tr-TR');

/** Cüzdan kapsülü: elmas + altın, yanında mağaza düğmesi. */
export function WalletPill() {
  const { wallet, toast } = useApp();
  return (
    <div className="wallet-pill">
      <span className="wp-item" title="Elmas"><GemIcon size={19} />{compact(wallet.diamonds)}</span>
      <span className="wp-sep" />
      <span className="wp-item" title="Altın"><CoinIcon size={19} />{compact(wallet.coins)}</span>
      <button className="wp-add" aria-label="Elmas al" onClick={() => toast('Elmas mağazası yakında 💎')}>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" /></svg>
      </button>
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
            <div className="hero-art">{s.game === 'ludo' ? <LudoArt /> : s.game === 'uno' ? <UnoArt /> : <ChatArt />}</div>
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
      <header className="app-header">
        <div className="me-chip">
          <span className="me-av"><span className="av"><Avatar value={me.avatar} /></span><LevelBadge level={me.level} /></span>
          <div>
            <small className="hello">{greeting()} <span className="wave">👋</span></small>
            <b>{me.username}</b>
          </div>
        </div>
        <WalletPill />
      </header>

      <HeroCarousel onPlay={quickPlay} />

      <div className="section-head"><h3>Oyunlar</h3><small>{(rooms ?? []).reduce((n, r) => n + Number(r.online), 0)} kişi çevrimiçi</small></div>
      <div className="game-grid">
        {PLAYABLE.map(g => {
          const m = GAMES[g];
          return (
            <button key={g} className={`game-card gc-${g}`} onClick={() => quickPlay(g)}>
              <div className={`gc-art ${g === 'uno' ? 'uno-art-wrap' : ''}`}><GameArt g={g} /></div>
              <div className="gc-copy"><b>{m.name}</b><small>{m.min === m.max ? `${m.max} oyuncu` : `${m.min}-${m.max} oyuncu`}</small></div>
              <span className="gc-live"><i />{online(g)}</span>
              {m.isNew && <em className="gc-new">YENİ</em>}
              <span className="gc-play">Oyna</span>
            </button>
          );
        })}
        <button className="game-card small gc-chat wide" onClick={() => quickPlay('chat')}>
          <span className="gc-emoji">🎙️</span>
          <div className="gc-copy"><b>Sesli Sohbet</b><small><i className="dot" />{online('chat')} kişi sohbette</small></div>
          <span className="gc-play">Gir</span>
        </button>
      </div>

      <div className="section-head">
        <h3>Canlı odalar</h3>
      </div>
      <div className="chips">
        {(['all', ...PLAYABLE, 'chat'] as const).map(f => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? '🔥 Tümü' : `${GAME_ICON(f)} ${GAME_NAME(f)}`}
          </button>
        ))}
      </div>

      <div className="room-grid">
        {rooms === null && <div className="spinner" />}
        {shown.map(r => (
          <button key={r.id} className="room-card" onClick={() => openRoom(r.id)}>
            <div className={`rc-cover tone-${r.game}`}>
              <div className="rc-art"><GameArt g={r.game} /></div>
              {r.playing ? <em className="rc-badge live">OYUNDA</em> : <em className="rc-badge">{GAME_NAME(r.game)}</em>}
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
              {([...PLAYABLE, 'chat'] as const).map(g => (
                <button key={g} className={`tone-${g} ${creating === g ? 'on' : ''}`} onClick={() => setCreating(g)}>
                  <span>{GAME_ICON(g)}</span>{GAME_NAME(g)}
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
