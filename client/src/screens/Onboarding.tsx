import { useState } from 'react';
import { useApp } from '../App';
import { call } from '../net';
import { AvatarPicker } from '../components/AvatarPicker';
import { AVATAR_LIST, randomAvatar } from '../components/Avatar';

/** Google / Apple / e-posta ile ilk girişte: kullanıcı adı + karakter seçimi. */
export default function Onboarding() {
  const { me, refreshMe, toast, signOut } = useApp();
  const [username, setUsername] = useState(/_[0-9a-f]{4}$/.test(me.username) ? '' : me.username);
  const [avatar, setAvatar] = useState(AVATAR_LIST.some(a => a.id === me.avatar) ? me.avatar : randomAvatar());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const u = username.trim();
    if (!/^[\p{L}\p{N}_]{3,20}$/u.test(u)) return setErr('Kullanıcı adı 3-20 harf/rakam olmalı (boşluk yok)');
    setBusy(true); setErr('');
    const r = await call('profile:onboard', { username: u, avatar });
    setBusy(false);
    if (!r.ok) return setErr(r.error!);
    await refreshMe();
    toast(`Hoş geldin ${u}! 🎉`);
  }

  return (
    <div className="login">
      <div className="login-hero">
        <div className="brand-mark bounce">🎈</div>
        <h1 className="brand-word">Son bir adım</h1>
        <p>Partide nasıl görüneceğini seç</p>
      </div>
      <form className="card login-card" onSubmit={save}>
        <label>Karakterin</label>
        <AvatarPicker value={avatar} onChange={setAvatar} />
        <label>Kullanıcı adın</label>
        <input placeholder="ör. ParlakYıldız" value={username} onChange={e => setUsername(e.target.value)} maxLength={20} autoCapitalize="none" autoFocus />
        {err && <div className="err">{err}</div>}
        <button className="btn primary big" disabled={busy}>{busy ? '…' : 'Partiye katıl 🎉'}</button>
        <button type="button" className="link-btn" onClick={signOut}>Farklı hesapla giriş yap</button>
      </form>
    </div>
  );
}
