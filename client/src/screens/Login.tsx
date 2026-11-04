import { useState } from 'react';
import { login, register, ServerConfig } from '../net';

import { AvatarPicker } from '../components/AvatarPicker';
import { randomAvatar } from '../components/Avatar';

export default function Login({ onToken }: { config?: ServerConfig; onToken: (t: string) => Promise<void> }) {
  const [kind, setKind] = useState<'login' | 'register'>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState(randomAvatar);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const u = username.trim();
    if (!/^[\p{L}\p{N}_]{3,20}$/u.test(u)) return setErr('Kullanıcı adı 3-20 harf/rakam olmalı (boşluk yok)');
    if (password.length < 6) return setErr('Şifre en az 6 karakter olmalı');
    setBusy(true);
    try {
      const token = kind === 'register' ? await register(u, password, avatar) : await login(u, password);
      try { localStorage.setItem('parti.login', u); } catch { /* yoksay */ }
      await onToken(token);
    } catch (e: any) { setErr(e?.message || 'Giriş başarısız'); }
    finally { setBusy(false); }
  }

  return (
    <div className="login">
      <div className="login-floaters" aria-hidden>
        {['🎴', '🎲', '🎙️', '🎁', '💎', '🎈'].map((e, i) => <span key={i} style={{ ['--i' as any]: i }}>{e}</span>)}
      </div>
      <div className="login-hero">
        <div className="brand-mark bounce">🎉</div>
        <h1 className="brand-word">Parti</h1>
        <p>Sesli odalar · Mini oyunlar · Yeni arkadaşlar</p>
      </div>
      <form className="card login-card" onSubmit={submit}>
        <div className="seg">
          <button type="button" className={kind === 'register' ? 'on' : ''} onClick={() => setKind('register')}>Yeni hesap</button>
          <button type="button" className={kind === 'login' ? 'on' : ''} onClick={() => setKind('login')}>Giriş yap</button>
        </div>
        {kind === 'register' && (
          <>
            <label>Karakterini seç</label>
            <AvatarPicker value={avatar} onChange={setAvatar} />
          </>
        )}
        <input placeholder="Kullanıcı adı" value={username} onChange={e => setUsername(e.target.value)} maxLength={20}
          autoComplete="username" autoCapitalize="none" />
        <input type="password" placeholder="Şifre (en az 6 karakter)" value={password} onChange={e => setPassword(e.target.value)}
          autoComplete={kind === 'login' ? 'current-password' : 'new-password'} />
        {err && <div className="err">{err}</div>}
        <button className="btn primary big" disabled={busy}>{busy ? '…' : kind === 'register' ? 'Partiye katıl 🎈' : 'Giriş yap'}</button>
        <p className="hint">E-posta gerekmez. Kullanıcı adını ve şifreni unutma 🙂</p>
      </form>
    </div>
  );
}
