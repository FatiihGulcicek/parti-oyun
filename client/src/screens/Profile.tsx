import { useState } from 'react';
import { useApp } from '../App';
import { call } from '../net';
import { AVATARS } from './Login';
import { WalletPill } from './Home';

export default function ProfileScreen() {
  const { me, wallet, refreshMe, setWallet, toast, signOut, config } = useApp();
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState(me.bio);
  const [avatar, setAvatar] = useState(me.avatar);

  async function claim() {
    const r = await call<{ diamonds: number; coins: number }>('daily:claim');
    if (!r.ok) return toast(r.error!);
    setWallet({ diamonds: r.diamonds, coins: r.coins, canClaimDaily: false });
    toast('🎁 +50 💎  +200 🪙');
  }

  async function save() {
    const r = await call('profile:update', { username: username.trim(), bio, avatar });
    if (!r.ok) return toast(r.error!);
    await refreshMe();
    setEditing(false);
    toast('Profil kaydedildi');
  }

  const nextLv = Math.pow(me.level, 2) * 100;
  const pct = Math.min(100, Math.round((me.wealth / Math.max(1, nextLv)) * 100));

  return (
    <div className="profile">
      <header className="topbar"><h2>Profilim</h2><WalletPill /></header>
      <div className="profile-hero">
        <div className="av-xl">{me.avatar}</div>
        <h2>{me.username} <span className="lv">Lv.{me.level}</span></h2>
        <p className="bio">{me.bio || 'Henüz bir şey yazmadın.'}</p>
        <div className="lvbar"><i style={{ width: `${pct}%` }} /></div>
        <small className="muted">Sonraki seviye: {me.wealth.toLocaleString('tr-TR')} / {nextLv.toLocaleString('tr-TR')} servet</small>
        <div className="stats">
          <div><b>💖 {me.charm.toLocaleString('tr-TR')}</b><small>Çekicilik</small></div>
          <div><b>👑 {me.wealth.toLocaleString('tr-TR')}</b><small>Servet</small></div>
        </div>
      </div>

      <div className="card daily">
        <div><b>Günlük ödül</b><small>Her gün 50 💎 + 200 🪙</small></div>
        <button className="btn gold" disabled={!wallet.canClaimDaily} onClick={claim}>{wallet.canClaimDaily ? 'Topla' : 'Alındı ✓'}</button>
      </div>

      {editing ? (
        <div className="card edit">
          <label>Avatar</label>
          <div className="avatar-grid">{AVATARS.map(a => <button key={a} className={a === avatar ? 'on' : ''} onClick={() => setAvatar(a)}>{a}</button>)}</div>
          <label>Kullanıcı adı</label>
          <input value={username} onChange={e => setUsername(e.target.value)} maxLength={20} />
          <label>Hakkımda</label>
          <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={120} rows={2} />
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setEditing(false)}>Vazgeç</button>
            <button className="btn primary" onClick={save}>Kaydet</button>
          </div>
        </div>
      ) : (
        <div className="menu">
          <button onClick={() => setEditing(true)}>✏️ Profili düzenle<span>›</span></button>
          <button onClick={() => toast('Mağaza yakında: elmas paketleri (Google Play / App Store ödemesi)')}>🛍️ Elmas mağazası<span>›</span></button>
          <button onClick={signOut}>🚪 Çıkış yap<span>›</span></button>
        </div>
      )}
      <p className="hint center">{config.mode === 'demo' ? 'Demo modu · veriler sunucu yeniden başlayınca sıfırlanır' : 'Hesabın Supabase üzerinde güvende'}</p>
    </div>
  );
}
