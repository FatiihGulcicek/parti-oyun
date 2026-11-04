import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { bus, call, clearPasswordRecovery, connect, isPasswordRecovery, loadConfig, logout, restoreSession, updatePassword, FullProfile, ServerConfig, Wallet } from './net';
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

  const start = useCallback(async (token: string) => {
    try {
      await connect(token);
      bus.on('friends:changed', (p: any) => {
        if (!p?.from) return;
        if (p.status === 'pending') { setFriendBadge(n => n + 1); toast(`${avatarText(p.from.avatar)} ${p.from.username} arkadaşlık isteği gönderdi`); }
        if (p.status === 'accepted') toast(`${avatarText(p.from.avatar)} ${p.from.username} artık arkadaşın!`);
      });
      await refreshMe();
      setPhase('ready');
    } catch {
      await logout();
      setPhase('login');
    }
  }, [refreshMe, toast]);

  useEffect(() => {
    (async () => {
      try {
        setConfig(await loadConfig());
        const t = await restoreSession();
        if (t) await start(t); else setPhase('login');
      } catch { setPhase('offline'); }
    })();
  }, [start]);

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

  const ctx: Ctx = { config, me, wallet, refreshMe, setWallet, openRoom, toast, signOut };
  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        {me.onboarded === false ? <Onboarding /> : roomId ? (
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
