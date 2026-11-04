import { useState } from 'react';
import { demoToken, emailAuth, ServerConfig } from '../net';

export const AVATARS = ['😀', '😎', '🥳', '🤠', '🐱', '🐶', '🦊', '🐼', '🐸', '🦁', '🐯', '🐵', '🦄', '🐙', '👽', '🤖', '👻', '🎃', '🌸', '⭐'];

export default function Login({ config, onToken }: { config: ServerConfig; onToken: (t: string) => Promise<void> }) {
  const demo = config.mode === 'demo';
  const [kind, setKind] = useState<'login' | 'register'>(demo ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const u = username.trim();
    if ((demo || kind === 'register') && !/^[\p{L}\p{N}_]{3,20}$/u.test(u)) return setErr('Kullanıcı adı 3-20 harf/rakam olmalı');
    setBusy(true);
    try {
      const token = demo ? demoToken(u, avatar) : await emailAuth(kind, email.trim(), password, u, avatar);
      await onToken(token);
    } catch (e: any) { setErr(e?.message || 'Giriş başarısız'); }
    finally { setBusy(false); }
  }

  return (
    <div className="login">
      <div className="login-hero">
        <div className="logo-big bounce">🎉</div>
        <h1>Parti</h1>
        <p>Sesli odalar · Mini oyunlar · Yeni arkadaşlar</p>
      </div>
      <form className="card login-card" onSubmit={submit}>
        {!demo && (
          <div className="seg">
            <button type="button" className={kind === 'login' ? 'on' : ''} onClick={() => setKind('login')}>Giriş</button>
            <button type="button" className={kind === 'register' ? 'on' : ''} onClick={() => setKind('register')}>Kayıt ol</button>
          </div>
        )}
        {(demo || kind === 'register') && (
          <>
            <label>Avatarını seç</label>
            <div className="avatar-grid">
              {AVATARS.map(a => <button type="button" key={a} className={a === avatar ? 'on' : ''} onClick={() => setAvatar(a)}>{a}</button>)}
            </div>
            <input placeholder="Kullanıcı adı" value={username} onChange={e => setUsername(e.target.value)} maxLength={20} autoComplete="nickname" />
          </>
        )}
        {!demo && (
          <>
            <input type="email" placeholder="E-posta" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            <input type="password" placeholder="Şifre" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
              autoComplete={kind === 'login' ? 'current-password' : 'new-password'} />
          </>
        )}
        {err && <div className="err">{err}</div>}
        <button className="btn primary big" disabled={busy}>{busy ? '…' : demo ? 'Partiye katıl 🎈' : kind === 'login' ? 'Giriş yap' : 'Hesap oluştur'}</button>
        {demo && <p className="hint">Demo modu: hesaplar sunucu belleğinde tutulur. Aynı kullanıcı adıyla tekrar girebilirsin.</p>}
      </form>
    </div>
  );
}
