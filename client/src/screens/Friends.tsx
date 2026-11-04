import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { call, Profile } from '../net';
import UserCard from '../components/UserCard';
import { IconSearch } from '../components/Icons';

type Friend = Profile & { online: boolean; room: { roomId: string; roomName: string } | null };

export default function Friends({ onSeen }: { onSeen: () => void }) {
  const { openRoom, toast } = useApp();
  const [data, setData] = useState<{ friends: Friend[]; incoming: Profile[]; outgoing: Profile[] } | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [card, setCard] = useState<string | null>(null);

  async function load() {
    const r = await call<any>('friends:list');
    if (r.ok) setData(r);
  }
  useEffect(() => { onSeen(); load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const r = await call<{ users: Profile[] }>('user:search', { q: q.trim() });
      if (r.ok) setResults(r.users);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function respond(id: string, accept: boolean) {
    const r = await call('friend:respond', { id, accept });
    if (!r.ok) toast(r.error!);
    load();
  }

  const sorted = [...(data?.friends ?? [])].sort((a, b) => Number(b.online) - Number(a.online));

  return (
    <div className="friends">
      <header className="topbar"><h2>Arkadaşlar</h2></header>
      <label className="search"><IconSearch size={20} /><input placeholder="Kullanıcı ara…" value={q} onChange={e => setQ(e.target.value)} /></label>

      {results.length > 0 && (
        <section>
          <h4>Arama sonuçları</h4>
          {results.map(u => (
            <div key={u.id} className="row" onClick={() => setCard(u.id)}>
              <span className="av">{u.avatar}</span><div className="grow"><b>{u.username}</b><small>Lv.{u.level}</small></div>
              <span className="chev">›</span>
            </div>
          ))}
        </section>
      )}

      {data && data.incoming.length > 0 && (
        <section>
          <h4>Gelen istekler</h4>
          {data.incoming.map(u => (
            <div key={u.id} className="row">
              <span className="av" onClick={() => setCard(u.id)}>{u.avatar}</span>
              <div className="grow"><b>{u.username}</b><small>Lv.{u.level}</small></div>
              <button className="btn small primary" onClick={() => respond(u.id, true)}>Kabul</button>
              <button className="btn small ghost" onClick={() => respond(u.id, false)}>Reddet</button>
            </div>
          ))}
        </section>
      )}

      <section>
        <h4>Arkadaşlarım ({sorted.length})</h4>
        {!data && <div className="spinner" />}
        {data && sorted.length === 0 && <p className="empty">Henüz arkadaşın yok. Odalarda tanıştığın kişilerin profiline dokunup ekleyebilirsin.</p>}
        {sorted.map(f => (
          <div key={f.id} className="row" onClick={() => setCard(f.id)}>
            <span className={`av ${f.online ? 'online' : ''}`}>{f.avatar}</span>
            <div className="grow">
              <b>{f.username}</b>
              <small>{f.room ? `📍 ${f.room.roomName}` : f.online ? 'Çevrimiçi' : 'Çevrimdışı'}</small>
            </div>
            {f.room && <button className="btn small gold" onClick={e => { e.stopPropagation(); openRoom(f.room!.roomId); }}>Katıl</button>}
          </div>
        ))}
      </section>

      {data && data.outgoing.length > 0 && (
        <section>
          <h4>Gönderilen istekler</h4>
          {data.outgoing.map(u => (
            <div key={u.id} className="row dim"><span className="av">{u.avatar}</span><div className="grow"><b>{u.username}</b><small>Bekliyor…</small></div></div>
          ))}
        </section>
      )}

      {card && <UserCard userId={card} onClose={() => { setCard(null); load(); }} />}
    </div>
  );
}
