import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { call } from '../net';

interface RoomSummary {
  id: string; name: string; topic: string; game: GameId; online: number; seated: number; playing: boolean;
  owner: { username: string; avatar: string } | null;
}

type GameId = 'uno' | 'chat' | 'ludo';
const GAME_ICON: Record<GameId, string> = { uno: '🎴', chat: '🎙️', ludo: '🎲' };
const GAME_TONE: Record<GameId, string> = { uno: 'g-red', chat: 'g-blue', ludo: 'g-green' };
const GAME_NAME: Record<GameId, string> = { uno: 'Uno', chat: 'Sohbet', ludo: 'Ludo' };

const GAMES = [
  { id: 'uno', name: 'Uno', icon: '🎴', color: 'g-red', ready: true },
  { id: 'chat', name: 'Sohbet', icon: '🎙️', color: 'g-blue', ready: true },
  { id: 'ludo', name: 'Ludo', icon: '🎲', color: 'g-green', ready: true },
  { id: 'draw', name: 'Çiz-Tahmin', icon: '🎨', color: 'g-yellow', ready: false },
] as const;

export function WalletPill() {
  const { wallet } = useApp();
  return (
    <div className="wallet-pill">
      <span>💎 {wallet.diamonds.toLocaleString('tr-TR')}</span>
      <span>🪙 {wallet.coins.toLocaleString('tr-TR')}</span>
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

  const shown = rooms?.filter(r => filter === 'all' || r.game === filter) ?? [];

  return (
    <div className="home">
      <header className="topbar">
        <div className="me-mini"><span className="av">{me.avatar}</span><div><b>{me.username}</b><small>Lv.{me.level}</small></div></div>
        <WalletPill />
      </header>

      <div className="banner">
        <div><h2>Parti zamanı! 🎊</h2><p>Bir odaya gir, koltuğa otur, oyuna başla.</p></div>
        <button className="btn gold" onClick={() => quickPlay('uno')}>Hızlı Oyna</button>
      </div>

      <div className="games">
        {GAMES.map(g => (
          <button key={g.id} className={`game-tile ${g.color} ${g.ready ? '' : 'soon'}`}
            onClick={() => g.ready ? quickPlay(g.id as GameId) : toast(`${g.name} yakında geliyor!`)}>
            <span className="gi">{g.icon}</span><b>{g.name}</b>{!g.ready && <em>Yakında</em>}
          </button>
        ))}
      </div>

      <div className="section-head">
        <h3>Canlı odalar</h3>
        <div className="chips">
          {(['all', 'uno', 'ludo', 'chat'] as const).map(f => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f === 'all' ? 'Tümü' : GAME_NAME[f]}</button>
          ))}
        </div>
      </div>

      <div className="room-list">
        {rooms === null && <div className="spinner" />}
        {shown.map(r => (
          <button key={r.id} className="room-card" onClick={() => openRoom(r.id)}>
            <div className={`room-thumb ${GAME_TONE[r.game] ?? 'g-blue'}`}>{GAME_ICON[r.game] ?? '🎙️'}</div>
            <div className="room-info">
              <b>{r.name}</b>
              <small>{r.topic || (r.owner ? `${r.owner.avatar} ${r.owner.username}` : 'Herkese açık')}</small>
              <div className="room-meta">
                <span>🟢 {r.online} çevrimiçi</span><span>🪑 {r.seated}/9</span>
                {r.playing && <span className="live">OYUNDA</span>}
              </div>
            </div>
          </button>
        ))}
        {rooms && shown.length === 0 && <p className="empty">Henüz oda yok. İlkini sen aç!</p>}
      </div>

      <button className="fab" onClick={() => { setName(`${me.username} odası`); setCreating('uno'); }}>＋</button>

      {creating && (
        <div className="sheet-bg" onClick={() => setCreating(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h3>Oda oluştur</h3>
            <div className="seg">
              <button className={creating === 'uno' ? 'on' : ''} onClick={() => setCreating('uno')}>🎴 Uno</button>
              <button className={creating === 'ludo' ? 'on' : ''} onClick={() => setCreating('ludo')}>🎲 Ludo</button>
              <button className={creating === 'chat' ? 'on' : ''} onClick={() => setCreating('chat')}>🎙️ Sohbet</button>
            </div>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={30} placeholder="Oda adı" />
            <button className="btn primary big" onClick={create}>Oluştur</button>
          </div>
        </div>
      )}
    </div>
  );
}
