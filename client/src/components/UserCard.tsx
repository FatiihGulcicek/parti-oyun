import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { call, FullProfile } from '../net';

export default function UserCard({ userId, onClose, onGift, onKick }: {
  userId: string; onClose: () => void; onGift?: () => void; onKick?: () => void;
}) {
  const { me, toast } = useApp();
  const [p, setP] = useState<FullProfile | null>(null);
  useEffect(() => { call<{ profile: FullProfile }>('profile:get', { id: userId }).then(r => r.ok && setP(r.profile)); }, [userId]);
  const self = userId === me.id;

  async function add() {
    const r = await call<{ status: string }>('friend:request', { id: userId });
    toast(!r.ok ? r.error! : r.status === 'accepted' ? 'Artık arkadaşsınız 🎉' : 'Arkadaşlık isteği gönderildi');
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet user-card" onClick={e => e.stopPropagation()}>
        {!p ? <div className="spinner" /> : (
          <>
            <div className="av-xl">{p.avatar}</div>
            <h3>{p.username} <span className="lv">Lv.{p.level}</span></h3>
            {p.bio && <p className="bio">{p.bio}</p>}
            <div className="stats">
              <div><b>💖 {p.charm.toLocaleString('tr-TR')}</b><small>Çekicilik</small></div>
              <div><b>👑 {p.wealth.toLocaleString('tr-TR')}</b><small>Servet</small></div>
            </div>
            {!self && (
              <div className="btn-row">
                <button className="btn primary" onClick={add}>➕ Arkadaş ekle</button>
                {onGift && <button className="btn gold" onClick={onGift}>🎁 Hediye</button>}
              </div>
            )}
            {onKick && !self && <button className="btn ghost small" onClick={onKick}>⬇️ Koltuktan indir</button>}
          </>
        )}
      </div>
    </div>
  );
}
