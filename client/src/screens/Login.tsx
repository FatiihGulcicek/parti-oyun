import { useState } from 'react';
import { emailLogin, emailRegister, login, oauthLogin, register, sendPasswordReset, ServerConfig, type OAuthProvider } from '../net';
import { AvatarPicker } from '../components/AvatarPicker';
import { randomAvatar } from '../components/Avatar';
import { IconBack } from '../components/Icons';

const GoogleLogo = () => (
  <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
  </svg>
);
const AppleLogo = () => (
  <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden fill="currentColor">
    <path d="M16.4 1.4c0 1.1-.5 2.3-1.2 3.1-.7.9-2 1.6-3 1.6-.1 0-.2 0-.3-.1v-.4c0-1.1.6-2.3 1.2-3 .8-.9 2.1-1.6 3.2-1.7.1.2.1.3.1.5zm4.5 15.7c0 .1-.5 1.6-1.5 3.1-.9 1.3-1.9 2.7-3.4 2.7s-1.9-.9-3.6-.9c-1.7 0-2.3.9-3.7.9s-2.3-1.3-3.4-2.8C4 18.3 3 15.5 3 12.9c0-4.3 2.8-6.6 5.6-6.6 1.4 0 2.7 1 3.6 1 .9 0 2.2-1 3.9-1 .6 0 2.9.1 4.4 2.2-.1.1-2.4 1.4-2.4 4.2 0 3.3 2.9 4.4 2.9 4.4z" />
  </svg>
);
const MailIcon = () => (
  <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" />
  </svg>
);

type Mode = 'start' | 'email' | 'username';

export default function Login({ onToken }: { config?: ServerConfig; onToken: (t: string) => Promise<void> }) {
  const [mode, setMode] = useState<Mode>('start');
  const [kind, setKind] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState(randomAvatar);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  function go(m: Mode, k: 'login' | 'register' = 'login') { setMode(m); setKind(k); setErr(''); setInfo(''); }

  async function social(p: OAuthProvider) {
    setErr(''); setBusy(p);
    try { await oauthLogin(p); } // sayfa sağlayıcıya yönlenir
    catch (e: any) { setErr(e?.message || 'Giriş başarısız'); setBusy(null); }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setInfo('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Geçerli bir e-posta adresi yaz');
    if (password.length < 6) return setErr('Şifre en az 6 karakter olmalı');
    setBusy('email');
    try {
      if (kind === 'login') await onToken(await emailLogin(email, password));
      else {
        const token = await emailRegister(email, password, avatar);
        if (token) await onToken(token);
        else { setInfo(`📩 ${email.trim()} adresine doğrulama bağlantısı gönderdik. Bağlantıya tıklayınca giriş yapılır.`); setKind('login'); }
      }
    } catch (e: any) { setErr(e?.message || 'Giriş başarısız'); }
    finally { setBusy(null); }
  }

  async function forgot() {
    setErr(''); setInfo('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Önce e-posta adresini yaz');
    setBusy('reset');
    try { await sendPasswordReset(email); setInfo('📩 Şifre sıfırlama bağlantısı gönderildi. E-postanı kontrol et.'); }
    catch (e: any) { setErr(e?.message || 'Gönderilemedi'); }
    finally { setBusy(null); }
  }

  async function submitUsername(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const u = username.trim();
    if (!/^[\p{L}\p{N}_]{3,20}$/u.test(u)) return setErr('Kullanıcı adı 3-20 harf/rakam olmalı (boşluk yok)');
    if (password.length < 6) return setErr('Şifre en az 6 karakter olmalı');
    setBusy('username');
    try {
      const token = kind === 'register' ? await register(u, password, avatar) : await login(u, password);
      try { localStorage.setItem('parti.login', u); } catch { /* yoksay */ }
      await onToken(token);
    } catch (e: any) { setErr(e?.message || 'Giriş başarısız'); }
    finally { setBusy(null); }
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

      {mode === 'start' && (
        <div className="card login-card">
          <h3 className="lc-title">Hoş geldin! 👋</h3>
          <button className="auth-btn google" disabled={Boolean(busy)} onClick={() => social('google')}>
            <GoogleLogo /><span>{busy === 'google' ? 'Yönlendiriliyor…' : 'Google ile devam et'}</span>
          </button>
          <button className="auth-btn apple" disabled={Boolean(busy)} onClick={() => social('apple')}>
            <AppleLogo /><span>{busy === 'apple' ? 'Yönlendiriliyor…' : 'Apple ile devam et'}</span>
          </button>
          <button className="auth-btn email" disabled={Boolean(busy)} onClick={() => go('email')}>
            <MailIcon /><span>E-posta ile devam et</span>
          </button>
          {err && <div className="err">{err}</div>}
          <div className="or"><span>veya</span></div>
          <button className="link-btn" onClick={() => go('username')}>Kullanıcı adıyla giriş yap / kayıt ol</button>
          <p className="hint center">Devam ederek topluluk kurallarını kabul etmiş olursun.</p>
        </div>
      )}

      {mode === 'email' && (
        <form className="card login-card" onSubmit={submitEmail}>
          <div className="login-head">
            <button type="button" className="icon-btn light" onClick={() => go('start')} aria-label="Geri"><IconBack size={20} /></button>
            <h3 className="lc-title">E-posta ile {kind === 'login' ? 'giriş' : 'kayıt'}</h3>
          </div>
          <div className="seg">
            <button type="button" className={kind === 'login' ? 'on' : ''} onClick={() => { setKind('login'); setErr(''); }}>Giriş yap</button>
            <button type="button" className={kind === 'register' ? 'on' : ''} onClick={() => { setKind('register'); setErr(''); }}>Yeni hesap</button>
          </div>
          {kind === 'register' && <><label>Karakterini seç</label><AvatarPicker value={avatar} onChange={setAvatar} /></>}
          <input type="email" inputMode="email" placeholder="E-posta adresin" value={email} onChange={e => setEmail(e.target.value)}
            autoComplete="email" autoCapitalize="none" />
          <input type="password" placeholder="Şifre (en az 6 karakter)" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete={kind === 'login' ? 'current-password' : 'new-password'} />
          {kind === 'login' && <button type="button" className="link-btn right" onClick={forgot} disabled={busy === 'reset'}>Şifremi unuttum</button>}
          {err && <div className="err">{err}</div>}
          {info && <div className="info">{info}</div>}
          <button className="btn primary big" disabled={Boolean(busy)}>{busy === 'email' ? '…' : kind === 'login' ? 'Giriş yap' : 'Hesap oluştur 🎈'}</button>
          {kind === 'register' && <p className="hint">Kayıttan sonra kullanıcı adını seçeceksin.</p>}
        </form>
      )}

      {mode === 'username' && (
        <form className="card login-card" onSubmit={submitUsername}>
          <div className="login-head">
            <button type="button" className="icon-btn light" onClick={() => go('start')} aria-label="Geri"><IconBack size={20} /></button>
            <h3 className="lc-title">Kullanıcı adıyla</h3>
          </div>
          <div className="seg">
            <button type="button" className={kind === 'login' ? 'on' : ''} onClick={() => setKind('login')}>Giriş yap</button>
            <button type="button" className={kind === 'register' ? 'on' : ''} onClick={() => setKind('register')}>Yeni hesap</button>
          </div>
          {kind === 'register' && <><label>Karakterini seç</label><AvatarPicker value={avatar} onChange={setAvatar} /></>}
          <input placeholder="Kullanıcı adı" value={username} onChange={e => setUsername(e.target.value)} maxLength={20}
            autoComplete="username" autoCapitalize="none" />
          <input type="password" placeholder="Şifre (en az 6 karakter)" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete={kind === 'login' ? 'current-password' : 'new-password'} />
          {err && <div className="err">{err}</div>}
          <button className="btn primary big" disabled={Boolean(busy)}>{busy ? '…' : kind === 'register' ? 'Partiye katıl 🎈' : 'Giriş yap'}</button>
          <p className="hint">E-posta gerekmez, ama şifreni unutursan sıfırlanamaz. Kullanıcı adını ve şifreni unutma 🙂</p>
        </form>
      )}
    </div>
  );
}
