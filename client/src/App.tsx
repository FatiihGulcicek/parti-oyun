import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { bus, call, clearPasswordRecovery, connect, isPasswordRecovery, loadConfig, loadSettings, logout, restoreSession, updatePassword, FullProfile, ServerConfig, Wallet } from './net';
import Admin from './screens/Admin';
import ThemeFx from './components/ThemeFx';
import { activeTheme, type ThemeDef } from './themes';
import Login from './screens/Login';
import Home from './screens/Home';
import Friends from './screens/Friends';
import ProfileScreen from './screens/Profile';
import RoomScreen from './screens/Room';
import Onboarding from './screens/Onboarding';
import { IconHome, IconUser, IconUsers } from './components/Icons';
import './styles.css';
import { avatarText } from './components/Avatar';

interface Ctx {
  config: ServerConfig;
  me: FullProfile;
  wallet: Wallet;
  refreshMe: () => Promise<void>;
  setWallet: (w: Partial<Wallet>) => void;
  openRoom: (id: string) => void;
  toast: (m: string) => void;
  signOut: () => void;
  settings: Record<string, any>;
  theme: ThemeDef;
  isAdmin: boolean;
  openAdmin: () => void;
}
const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

type Tab = 'home' | 'friends' | 'profile';

export default function App() {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [phase, setPhase] = useState<'boot' | 'login' | 'ready' | 'offline'>('boot');
  const [me, setMe] = useState<FullProfile | null>(null);
  const [wallet, setWalletState] = useState<Wallet>({ diamonds: 0, coins: 0, canClaimDaily: false });
  const [tab, setTab] = useState<Tab>('home');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; m: string }[]>([]);
  const [friendBadge, setFriendBadge] = useState(0);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [status, setStatus] = useState<{ admin: boolean; bannedUntil: string | null; banReason: string | null }>({ admin: false, bannedUntil: null, banReason: null });
  const [adminOpen, setAdminOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const theme = activeTheme(settings.theme, now);

  // ayarlar giriş öncesi de okunur (tema giriş ekranına da uygulanır) ve canlı güncellenir
  useEffect(() => {
    loadSettings().then(setSettings).catch(() => {});
    const on = (s: Record<string, any>) => setSettings(s);
    bus.on('settings:changed', on);
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => { bus.off('settings:changed', on); clearInterval(t); };
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.className = root.className.split(' ').filter(c => !c.startsWith('theme-')).concat(`theme-${theme.id}`).join(' ').trim();
  }, [theme.id]);
  const [recovery, setRecovery] = useState(isPasswordRecovery());
  useEffect(() => { const on = () => setRecovery(true); bus.on('auth:recovery', on); return () => bus.off('auth:recovery', on); }, []);

  const toast = useCallback((m: string) => {
    const id = Math.random();
    setToasts(t => [...t, { id, m }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600);
  }, []);

  const refreshMe = useCallback(async () => {
    const r = await call<{ profile: FullProfile; wallet: Wallet }>('me:get');
    if (r.ok) { setMe(r.profile); setWalletState(r.wallet); }
  }, []);

  /** Yönetici / yasak durumu: girişte, "Ben" sekmesine geçişte ve uygulamaya dönüldüğünde yenilenir. */
  const refreshStatus = useCallback(async () => {
    const st = await call<{ admin: boolean; bannedUntil: string | null; banReason: string | null }>('status:get');
    if (st.ok) setStatus({ admin: st.admin, bannedUntil: st.bannedUntil, banReason: st.banReason });
  }, []);

  const start = useCallback(async (token: string) => {
    try {
      await connect(token);
      bus.on('friends:changed', (p: any) => {
        if (!p?.from) return;
        if (p.status === 'pending') { setFriendBadge(n => n + 1); toast(`${avatarText(p.from.avatar)} ${p.from.username} arkadaşlık isteği gönderdi`); }
        if (p.status === 'accepted') toast(`${avatarText(p.from.avatar)} ${p.from.username} artık arkadaşın!`);
      });
      await refreshMe();
      await refreshStatus();
      setPhase('ready');
    } catch {
      await logout();
      setPhase('login');
    }
  }, [refreshMe, refreshStatus, toast]);

  useEffect(() => {
    (async () => {
      try {
        setConfig(await loadConfig());
        const t = await restoreSession();
        if (t) await start(t); else setPhase('login');
      } catch { setPhase('offline'); }
    })();
  }, [start]);

  useEffect(() => {
    if (phase !== 'ready') return;
    if (tab === 'profile') refreshStatus();
    const onVis = () => { if (document.visibilityState === 'visible') refreshStatus(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [phase, tab, refreshStatus]);

  // Android geri tuşu / tarayıcı geri: odadan çık
  useEffect(() => {
    const onPop = () => setRoomId(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openRoom = useCallback((id: string) => { history.pushState({ room: id }, ''); setRoomId(id); }, []);
  const signOut = useCallback(async () => { await logout(); setMe(null); setRoomId(null); setPhase('login'); }, []);
  const setWallet = useCallback((w: Partial<Wallet>) => setWalletState(p => ({ ...p, ...w })), []);

  if (phase === 'boot') return <div className="splash"><div className="brand-mark bounce">🎉</div><b className="brand-word">Parti</b><div className="spinner" /></div>;
  if (phase === 'offline') return (
    <div className="splash"><div className="brand-mark">📡</div><p>Sunucuya ulaşılamadı.</p>
      <button className="btn primary" onClick={() => location.reload()}>Tekrar dene</button></div>
  );
  if (phase === 'login' || !me || !config) return <Login config={config!} onToken={start} />;

  const ctx: Ctx = { config, me, wallet, refreshMe, setWallet, openRoom, toast, signOut, settings, theme, isAdmin: status.admin, openAdmin: () => setAdminOpen(true) };
  const banned = status.bannedUntil && Date.parse(status.bannedUntil) > Date.now();
  const maintenance = Boolean(settings.maintenance?.active) && !status.admin;
  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        {banned ? <Banned until={status.bannedUntil!} reason={status.banReason} onOut={signOut} />
          : maintenance ? <Maintenance text={settings.maintenance?.text} onOut={signOut} />
          : adminOpen && status.admin ? <Admin onClose={() => setAdminOpen(false)} />
          : me.onboarded === false ? <Onboarding /> : roomId ? (
          <RoomScreen key={roomId} roomId={roomId} onExit={() => { setRoomId(null); if (history.state?.room) history.back(); }} />
        ) : (
          <>
            <main className="tab-body">
              {tab === 'home' && <Home />}
              {tab === 'friends' && <Friends onSeen={() => setFriendBadge(0)} />}
              {tab === 'profile' && <ProfileScreen />}
            </main>
            <nav className="tabbar">
              <button className={tab === 'home' ? 'on' : ''} onClick={() => setTab('home')}><span><IconHome /></span>Parti</button>
              <button className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>
                <span><IconUsers />{friendBadge > 0 && <i className="badge">{friendBadge}</i>}</span>Arkadaşlar</button>
              <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}><span><IconUser /></span>Ben</button>
            </nav>
          </>
        )}
        {!roomId && !adminOpen && <ThemeFx theme={theme} />}
        {recovery && <NewPassword onDone={() => { clearPasswordRecovery(); setRecovery(false); }} toast={toast} />}
        <div className="toasts">{toasts.map(t => <div key={t.id} className="toast">{t.m}</div>)}</div>
      </div>
    </AppCtx.Provider>
  );
}

/** Şifre sıfırlama bağlantısıyla gelindiğinde yeni şifre belirleme. */
function NewPassword({ onDone, toast }: { onDone: () => void; toast: (m: string) => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) return setErr('Şifre en az 6 karakter olmalı');
    setBusy(true); setErr('');
    try { await updatePassword(pw); toast('Şifren güncellendi 🔐'); onDone(); }
    catch (e: any) { setErr(e?.message || 'Şifre güncellenemedi'); }
    finally { setBusy(false); }
  }
  return (
    <div className="sheet-bg">
      <form className="sheet" onSubmit={save}>
        <h3>Yeni şifreni belirle 🔐</h3>
        <input type="password" placeholder="Yeni şifre (en az 6 karakter)" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" autoFocus />
        {err && <div className="err">{err}</div>}
        <button className="btn primary big" disabled={busy}>{busy ? '…' : 'Kaydet'}</button>
        <button type="button" className="btn ghost" onClick={onDone}>Şimdi değil</button>
      </form>
    </div>
  );
}

/** Bakım modu: yöneticiler dışında herkes bu ekranı görür (sunucu da oda girişini reddeder). */
function Maintenance({ text, onOut }: { text?: string; onOut: () => void }) {
  return (
    <div className="splash banned maint">
      <div className="brand-mark">🛠️</div>
      <h2>Kısa bir bakımdayız</h2>
      <p>{text?.trim() || 'Uygulamayı güzelleştiriyoruz, birazdan geri döneceğiz.'}</p>
      <button className="btn white" onClick={onOut}>Çıkış yap</button>
    </div>
  );
}

/** Yasaklı hesap ekranı. */
function Banned({ until, reason, onOut }: { until: string; reason: string | null; onOut: () => void }) {
  const d = new Date(until);
  const forever = d.getFullYear() - new Date().getFullYear() > 5;
  return (
    <div className="splash banned">
      <div className="brand-mark">🚫</div>
      <h2>Hesabın askıya alındı</h2>
      <p>{forever ? 'Bu hesap kalıcı olarak kapatıldı.' : `Bitiş: ${d.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}`}</p>
      {reason && <p className="ban-reason">Sebep: {reason}</p>}
      <button className="btn white" onClick={onOut}>Çıkış yap</button>
    </div>
  );
}
