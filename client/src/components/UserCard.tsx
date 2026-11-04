import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { call, FullProfile } from '../net';
import Avatar from './Avatar';

const REPORT_REASONS = [
  { id: 'insult', label: '🤬 Hakaret / küfür' },
  { id: 'harassment', label: '😠 Taciz / zorbalık' },
  { id: 'spam', label: '📢 Spam / reklam' },
  { id: 'inappropriate', label: '🔞 Uygunsuz içerik' },
  { id: 'scam', label: '💸 Dolandırıcılık' },
  { id: 'other', label: '❓ Diğer' },
] as const;

export default function UserCard({ userId, onClose, onGift, onKick, onRoomKick }: {
  userId: string; onClose: () => void; onGift?: () => void; onKick?: () => void; onRoomKick?: () => void;
}) {
  const { me, toast } = useApp();
  const [p, setP] = useState<FullProfile | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [mode, setMode] = useState<'card' | 'report' | 'block' | 'kick'>('card');
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    call<{ profile: FullProfile; blocked: boolean }>('profile:get', { id: userId })
      .then(r => { if (r.ok) { setP(r.profile); setBlocked(Boolean(r.blocked)); } });
  }, [userId]);
  const self = userId === me.id;

  async function add() {
    const r = await call<{ status: string }>('friend:request', { id: userId });
    toast(!r.ok ? r.error! : r.status === 'accepted' ? 'Artık arkadaşsınız 🎉' : 'Arkadaşlık isteği gönderildi');
  }

  async function sendReport() {
    if (!reason || busy) return;
    setBusy(true);
    const r = await call('user:report', { id: userId, reason, details });
    setBusy(false);
    if (!r.ok) return toast(r.error!);
    toast('Şikayetin alındı, teşekkürler 🛡️');
    setMode('card'); setReason(null); setDetails('');
  }

  async function toggleBlock() {
    if (busy) return;
    setBusy(true);
    const r = await call(blocked ? 'user:unblock' : 'user:block', { id: userId });
    setBusy(false);
    if (!r.ok) return toast(r.error!);
    toast(blocked ? 'Engel kaldırıldı' : `${p?.username ?? 'Kullanıcı'} engellendi`);
    setBlocked(!blocked);
    setMode('card');
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet user-card" onClick={e => e.stopPropagation()}>
        {!p ? <div className="spinner" /> : mode === 'report' ? (
          <>
            <h3>🚩 {p.username} kullanıcısını şikayet et</h3>
            <p className="muted small-note">Sebep seç. Şikayetin gizli tutulur.</p>
            <div className="reason-list">
              {REPORT_REASONS.map(x => (
                <button key={x.id} className={reason === x.id ? 'on' : ''} onClick={() => setReason(x.id)}>{x.label}</button>
              ))}
            </div>
            <textarea value={details} onChange={e => setDetails(e.target.value)} maxLength={300} rows={2}
              placeholder="Ayrıntı (isteğe bağlı)" />
            <div className="btn-row">
              <button className="btn ghost" onClick={() => setMode('card')}>Vazgeç</button>
              <button className="btn primary" disabled={!reason || busy} onClick={sendReport}>Gönder</button>
            </div>
          </>
        ) : mode === 'block' ? (
          <>
            <h3>{blocked ? `${p.username} kullanıcısının engelini kaldır?` : `🚫 ${p.username} engellensin mi?`}</h3>
            {!blocked && <p className="muted small-note">Sohbet mesajlarını görmezsin, birbirinize arkadaşlık isteği gönderemezsiniz ve varsa arkadaşlığınız silinir.</p>}
            <div className="btn-row">
              <button className="btn ghost" onClick={() => setMode('card')}>Vazgeç</button>
              <button className={`btn ${blocked ? 'primary' : 'danger'}`} disabled={busy} onClick={toggleBlock}>
                {blocked ? 'Engeli kaldır' : 'Engelle'}
              </button>
            </div>
          </>
        ) : mode === 'kick' ? (
          <>
            <h3>🚪 {p.username} odadan atılsın mı?</h3>
            <p className="muted small-note">10 dakika boyunca bu odaya tekrar giremez.</p>
            <div className="btn-row">
              <button className="btn ghost" onClick={() => setMode('card')}>Vazgeç</button>
              <button className="btn danger" onClick={onRoomKick}>Odadan at</button>
            </div>
          </>
        ) : (
          <>
            <div className="av-xl"><Avatar value={p.avatar} /></div>
            <h3>{p.username} <span className="lv">Lv.{p.level}</span></h3>
            {blocked && <span className="blocked-tag">🚫 Engellendi</span>}
            {p.bio && <p className="bio">{p.bio}</p>}
            <div className="stats">
              <div><b>💖 {p.charm.toLocaleString('tr-TR')}</b><small>Çekicilik</small></div>
              <div><b>👑 {p.wealth.toLocaleString('tr-TR')}</b><small>Servet</small></div>
            </div>
            {!self && (
              <div className="btn-row">
                {!blocked && <button className="btn primary" onClick={add}>➕ Arkadaş ekle</button>}
                {onGift && <button className="btn gold" onClick={onGift}>🎁 Hediye</button>}
              </div>
            )}
            {!self && (onKick || onRoomKick) && (
              <div className="btn-row">
                {onKick && <button className="btn ghost small" onClick={onKick}>⬇️ Koltuktan indir</button>}
                {onRoomKick && <button className="btn ghost small" onClick={() => setMode('kick')}>🚪 Odadan at</button>}
              </div>
            )}
            {!self && (
              <div className="mod-row">
                <button onClick={() => setMode('report')}>🚩 Şikayet et</button>
                <button onClick={() => setMode('block')}>{blocked ? '✅ Engeli kaldır' : '🚫 Engelle'}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
