// Yönetim paneli: yalnızca yöneticiye görünür; her işlem sunucuda `_is_admin()` ile ayrıca doğrulanır.
import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { call } from '../net';
import Avatar from '../components/Avatar';
import { IconBack } from '../components/Icons';
import { GAMES, PLAYABLE, meta } from '../games';
import { THEMES, activeTheme, DEFAULT_THEME_SETTING, type ThemeSetting } from '../themes';
import { TrFlag } from '../components/ThemeFx';

type Tab = 'stats' | 'users' | 'rooms' | 'reports' | 'themes' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'stats', label: '📊 Özet' }, { id: 'users', label: '👥 Kullanıcılar' }, { id: 'rooms', label: '🚪 Odalar' },
  { id: 'reports', label: '🚩 Şikayetler' }, { id: 'themes', label: '🎨 Temalar' }, { id: 'settings', label: '⚙️ Ayarlar' },
];
const REASON_TR: Record<string, string> = { insult: 'Hakaret / küfür', harassment: 'Taciz / zorbalık', spam: 'Spam / reklam', inappropriate: 'Uygunsuz içerik', scam: 'Dolandırıcılık', other: 'Diğer' };
const BAN_OPTS = [{ m: 60, l: '1 saat' }, { m: 1440, l: '1 gün' }, { m: 10080, l: '7 gün' }, { m: 43200, l: '30 gün' }, { m: 5256000, l: 'Kalıcı' }];
const fmt = (n: number) => Number(n ?? 0).toLocaleString('tr-TR');
const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  return s < 60 ? 'az önce' : s < 3600 ? `${Math.floor(s / 60)} dk önce` : s < 86400 ? `${Math.floor(s / 3600)} sa önce` : `${Math.floor(s / 86400)} gün önce`;
};

export default function Admin({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('stats');
  return (
    <div className="admin">
      <header className="admin-head">
        <button className="icon-btn light" onClick={onClose} aria-label="Geri"><IconBack size={20} /></button>
        <div><h2>Yönetim Paneli</h2><small>Tüm işlemler kayıt altına alınır</small></div>
      </header>
      <nav className="admin-tabs">{TABS.map(t => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}</nav>
      <div className="admin-body">
        {tab === 'stats' && <Stats />}
        {tab === 'users' && <Users />}
        {tab === 'rooms' && <Rooms onClose={onClose} />}
        {tab === 'reports' && <Reports />}
        {tab === 'themes' && <Themes />}
        {tab === 'settings' && <Settings />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- özet
function Stats() {
  const [s, setS] = useState<any>(null);
  const [log, setLog] = useState<any[]>([]);
  const load = async () => {
    const [a, b] = await Promise.all([call<{ stats: any }>('admin:stats'), call<{ log: any[] }>('admin:log')]);
    if (a.ok) setS(a.stats); if (b.ok) setLog(b.log);
  };
  useEffect(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, []);
  if (!s) return <div className="spinner" />;
  const cards = [
    ['👥', 'Kullanıcı', fmt(s.users), `+${s.new_today} bugün`], ['🟢', 'Çevrimiçi', fmt(s.online), `${fmt(s.rooms)} oda`],
    ['🎮', 'Süren oyun', fmt(s.playing), ''], ['🚩', 'Açık şikayet', fmt(s.open_reports), ''],
    ['🚫', 'Yasaklı', fmt(s.banned), ''], ['💎', 'Dolaşımdaki elmas', fmt(s.diamonds), `🎁 ${fmt(s.gifts_today)} bugün`],
  ];
  return (
    <>
      <div className="adm-stats">{cards.map(([i, l, v, sub]) => <div key={l} className="adm-stat"><span>{i}</span><b>{v}</b><small>{l}</small>{sub && <em>{sub}</em>}</div>)}</div>
      <h4 className="adm-h">Oyunlara göre çevrimiçi</h4>
      <div className="adm-card">
        {Object.keys(s.by_game ?? {}).length === 0 && <p className="muted">Şu an odada kimse yok.</p>}
        {Object.entries(s.by_game ?? {}).map(([g, c]) => <div key={g} className="adm-row"><span>{meta(g).icon} {meta(g).name}</span><b>{String(c)}</b></div>)}
      </div>
      <h4 className="adm-h">Son işlemler</h4>
      <div className="adm-card">
        {log.length === 0 && <p className="muted">Henüz işlem yok.</p>}
        {log.slice(0, 15).map(l => <div key={l.id} className="adm-row"><span><b>{l.admin ?? '?'}</b> · {l.action} {l.target ? `· ${String(l.target).slice(0, 8)}` : ''}</span><small>{ago(l.created_at)}</small></div>)}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- kullanıcılar
function Users() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'banned' | 'reported'>('all');
  const [list, setList] = useState<any[] | null>(null);
  const [sel, setSel] = useState<any | null>(null);
  const load = async () => { const r = await call<{ users: any[] }>('admin:users', { q, filter }); if (r.ok) setList(r.users); };
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <input className="adm-search" placeholder="Kullanıcı adı ara…" value={q} onChange={e => setQ(e.target.value)} />
      <div className="chips adm-chips">
        {([['all', 'Tümü'], ['reported', '🚩 Şikayetli'], ['banned', '🚫 Yasaklı']] as const).map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      <div className="adm-card">
        {list === null && <div className="spinner" />}
        {list?.length === 0 && <p className="muted">Sonuç yok.</p>}
        {list?.map(u => (
          <button key={u.id} className="adm-user" onClick={() => setSel(u)}>
            <span className="av"><Avatar value={u.avatar} /></span>
            <div className="grow"><b>{u.username} {u.is_admin && <em className="tag adm">Yönetici</em>}{u.banned_until && Date.parse(u.banned_until) > Date.now() && <em className="tag ban">Yasaklı</em>}{u.open_reports > 0 && <em className="tag rep">🚩 {u.open_reports}</em>}</b>
              <small>Lv.{u.level} · 💎 {fmt(u.diamonds)} · 🪙 {fmt(u.coins)}{u.room ? ' · 🟢 odada' : ''}</small></div>
            <span className="chev">›</span>
          </button>
        ))}
      </div>
      {sel && <UserSheet u={sel} onClose={() => setSel(null)} onDone={() => { setSel(null); load(); }} />}
    </>
  );
}

function UserSheet({ u, onClose, onDone }: { u: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const [dia, setDia] = useState('');
  const [coin, setCoin] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const banned = u.banned_until && Date.parse(u.banned_until) > Date.now();
  async function run(ev: string, p: any, okMsg: string) {
    setBusy(true);
    const r = await call(ev, p);
    setBusy(false);
    if (!r.ok) return toast(r.error!);
    toast(okMsg); onDone();
  }
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet adm-sheet" onClick={e => e.stopPropagation()}>
        <div className="adm-uhead"><span className="av"><Avatar value={u.avatar} /></span><div><h3>{u.username}</h3><small>Lv.{u.level} · {new Date(u.created_at).toLocaleDateString('tr-TR')} tarihinde katıldı</small></div></div>
        <div className="stats"><div><b>💎 {fmt(u.diamonds)}</b><small>Elmas</small></div><div><b>🪙 {fmt(u.coins)}</b><small>Altın</small></div><div><b>🚩 {u.open_reports}</b><small>Açık şikayet</small></div></div>

        <h4 className="adm-h">Elmas / altın ver ya da al</h4>
        <div className="adm-grant">
          <input inputMode="numeric" placeholder="± elmas" value={dia} onChange={e => setDia(e.target.value.replace(/[^\d-]/g, ''))} />
          <input inputMode="numeric" placeholder="± altın" value={coin} onChange={e => setCoin(e.target.value.replace(/[^\d-]/g, ''))} />
          <button className="btn gold small" disabled={busy || (!dia && !coin)} onClick={() => run('admin:grant', { id: u.id, diamonds: dia || 0, coins: coin || 0 }, 'Cüzdan güncellendi')}>Uygula</button>
        </div>
        <div className="adm-quick">{[100, 1000, 10000].map(n => <button key={n} className="btn ghost small" disabled={busy} onClick={() => run('admin:grant', { id: u.id, diamonds: n, coins: 0 }, `+${fmt(n)} 💎 verildi`)}>+{fmt(n)} 💎</button>)}</div>

        <h4 className="adm-h">{banned ? `Yasaklı · ${new Date(u.banned_until).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Yasakla'}</h4>
        {banned ? (
          <button className="btn primary" disabled={busy || u.is_admin} onClick={() => run('admin:ban', { id: u.id, minutes: 0 }, 'Yasak kaldırıldı')}>✅ Yasağı kaldır</button>
        ) : (
          <>
            <input placeholder="Sebep (kullanıcıya gösterilir)" value={reason} onChange={e => setReason(e.target.value)} maxLength={200} />
            <div className="adm-quick">{BAN_OPTS.map(o => <button key={o.m} className="btn danger small" disabled={busy || u.is_admin} onClick={() => run('admin:ban', { id: u.id, minutes: o.m, reason }, `${u.username} ${o.l} yasaklandı`)}>{o.l}</button>)}</div>
            {u.is_admin && <small className="muted">Yöneticiler yasaklanamaz.</small>}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- odalar
function Rooms({ onClose }: { onClose: () => void }) {
  const { toast, openRoom } = useApp();
  const [list, setList] = useState<any[] | null>(null);
  const [name, setName] = useState('');
  const [game, setGame] = useState<string>('uno');
  const load = async () => { const r = await call<{ rooms: any[] }>('admin:rooms'); if (r.ok) setList(r.rooms); };
  useEffect(() => { load(); }, []);
  async function close(r: any) {
    if (!confirm(`"${r.name}" kapatılsın mı? İçindekiler odadan çıkarılır.`)) return;
    const x = await call('admin:closeRoom', { id: r.id });
    toast(x.ok ? 'Oda kapatıldı' : x.error!); load();
  }
  async function create() {
    const x = await call('admin:createRoom', { name, game });
    if (!x.ok) return toast(x.error!);
    toast('Kalıcı oda açıldı'); setName(''); load();
  }
  return (
    <>
      <div className="adm-card adm-create">
        <h4 className="adm-h">Kalıcı oda aç</h4>
        <input placeholder="Oda adı" value={name} onChange={e => setName(e.target.value)} maxLength={30} />
        <div className="chips adm-chips">{[...PLAYABLE, 'chat' as const].map(g => <button key={g} className={game === g ? 'on' : ''} onClick={() => setGame(g)}>{GAMES[g].icon} {GAMES[g].name}</button>)}</div>
        <button className="btn primary" disabled={name.trim().length < 2} onClick={create}>Oluştur</button>
      </div>
      <div className="adm-card">
        {list === null && <div className="spinner" />}
        {list?.map(r => (
          <div key={r.id} className="adm-room">
            <span className="adm-ricon">{meta(r.game).icon}</span>
            <div className="grow"><b>{r.name} {r.permanent && <em className="tag adm">Kalıcı</em>}{r.playing && <em className="tag rep">Oyunda</em>}</b>
              <small>{r.id} · 🟢 {r.online} · {r.owner ? `👑 ${r.owner}` : 'sahipsiz'}</small></div>
            <button className="btn ghost small" onClick={() => { onClose(); openRoom(r.id); }}>Git</button>
            <button className="btn danger small" onClick={() => close(r)}>Kapat</button>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- şikayetler
function Reports() {
  const { toast } = useApp();
  const [status, setStatus] = useState<'open' | 'reviewed' | 'dismissed'>('open');
  const [list, setList] = useState<any[] | null>(null);
  const load = async () => { const r = await call<{ reports: any[] }>('admin:reports', { status }); if (r.ok) setList(r.reports); };
  useEffect(() => { setList(null); load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  async function act(ev: string, p: any, msg: string) { const r = await call(ev, p); toast(r.ok ? msg : r.error!); load(); }
  return (
    <>
      <div className="chips adm-chips">
        {([['open', '🟠 Açık'], ['reviewed', '✅ İncelendi'], ['dismissed', '⚪ Reddedildi']] as const).map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}
      </div>
      {list === null && <div className="spinner" />}
      {list?.length === 0 && <p className="empty">Bu durumda şikayet yok 🎉</p>}
      {list?.map(r => (
        <div key={r.id} className="adm-card adm-report">
          <div className="adm-rp-head">
            <span className="av"><Avatar value={r.target.avatar} /></span>
            <div className="grow"><b>{r.target.username}</b><small>{REASON_TR[r.reason] ?? r.reason} · toplam {r.total_against} şikayet</small></div>
            <small>{ago(r.created_at)}</small>
          </div>
          {r.details && <p className="adm-quote">“{r.details}”</p>}
          <small className="muted">Şikayet eden: {r.reporter.username}{r.room_id ? ` · oda ${r.room_id}` : ''}</small>
          {status === 'open' && (
            <div className="adm-quick">
              <button className="btn primary small" onClick={() => act('admin:resolve', { id: r.id, status: 'reviewed' }, 'İncelendi olarak işaretlendi')}>✅ İncelendi</button>
              <button className="btn ghost small" onClick={() => act('admin:resolve', { id: r.id, status: 'dismissed' }, 'Şikayet reddedildi')}>Reddet</button>
              <button className="btn danger small" onClick={async () => {
                const b = await call('admin:ban', { id: r.target.id, minutes: 1440, reason: REASON_TR[r.reason] ?? 'Kural ihlali' });
                if (!b.ok) return toast(b.error!);
                act('admin:resolve', { id: r.id, status: 'reviewed' }, `${r.target.username} 1 gün yasaklandı`);
              }}>🚫 1 gün yasakla</button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- temalar
function ThemeSwatch({ id, emoji }: { id: string; emoji: string }) {
  return <span className={`adm-swatch theme-${id}`}>{id === 'ekim29' || id === 'mayis19' ? <TrFlag size={18} /> : emoji}</span>;
}

function Themes() {
  const { settings, toast } = useApp();
  const cur: ThemeSetting = { ...DEFAULT_THEME_SETTING, ...(settings.theme ?? {}) };
  const [draft, setDraft] = useState<ThemeSetting>(cur);
  useEffect(() => { setDraft({ ...DEFAULT_THEME_SETTING, ...(settings.theme ?? {}) }); }, [settings.theme]);
  const live = activeTheme(cur);
  const preview = activeTheme(draft);
  const sch = (id: string) => draft.schedule?.[id] ?? {};
  const setSch = (id: string, patch: any) => setDraft(d => ({ ...d, schedule: { ...d.schedule, [id]: { ...(d.schedule?.[id] ?? {}), ...patch } } }));
  async function save(next = draft) {
    const r = await call('admin:setSetting', { key: 'theme', value: next });
    toast(r.ok ? 'Tema ayarları kaydedildi — herkese anında uygulanır' : r.error!);
  }
  return (
    <>
      <div className="adm-card">
        <div className="adm-row"><span>Şu an açık tema</span><b><ThemeSwatch id={live.id} emoji={live.emoji} /> {live.name}</b></div>
        <div className="seg adm-seg">
          <button className={draft.mode === 'auto' ? 'on' : ''} onClick={() => setDraft(d => ({ ...d, mode: 'auto' }))}>📅 Tarihe göre otomatik</button>
          <button className={draft.mode === 'manual' ? 'on' : ''} onClick={() => setDraft(d => ({ ...d, mode: 'manual' }))}>✋ Elle seç</button>
        </div>
        <small className="muted">{draft.mode === 'auto' ? 'Aşağıdaki tarih aralıklarında tema kendiliğinden açılır. Kapattığın tema atlanır.' : 'Seçtiğin tema, sen değiştirene kadar herkeste açık kalır.'}</small>
      </div>
      <div className="adm-themes">
        {THEMES.map(t => {
          const o = sch(t.id);
          const enabled = o.enabled !== false;
          const isActive = draft.mode === 'manual' ? draft.active === t.id : preview.id === t.id;
          return (
            <div key={t.id} className={`adm-theme ${isActive ? 'on' : ''} ${!enabled && draft.mode === 'auto' ? 'off' : ''}`}>
              <div className={`adm-tprev theme-${t.id}`}><ThemeSwatch id={t.id} emoji={t.emoji} /></div>
              <div className="grow">
                <b>{t.name} {isActive && <em className="tag adm">Açık</em>}</b>
                <small>{t.desc}</small>
                {t.id !== 'default' && draft.mode === 'auto' && (
                  <div className="adm-dates">
                    <input value={o.from ?? t.from ?? ''} onChange={e => setSch(t.id, { from: e.target.value.trim() })} placeholder={t.lunar ? 'YYYY-AA-GG' : 'AA-GG'} />
                    <span>→</span>
                    <input value={o.to ?? t.to ?? ''} onChange={e => setSch(t.id, { to: e.target.value.trim() })} placeholder={t.lunar ? 'YYYY-AA-GG' : 'AA-GG'} />
                    <label className="adm-toggle"><input type="checkbox" checked={enabled} onChange={e => setSch(t.id, { enabled: e.target.checked })} /><i /></label>
                  </div>
                )}
                {t.lunar && draft.mode === 'auto' && <small className="adm-note">Tarihi her yıl değişir, panelden güncelle.</small>}
              </div>
              {draft.mode === 'manual' && <button className={`btn small ${draft.active === t.id ? 'primary' : 'ghost'}`} onClick={() => setDraft(d => ({ ...d, active: t.id }))}>{draft.active === t.id ? 'Seçili' : 'Seç'}</button>}
            </div>
          );
        })}
      </div>
      <button className="btn primary big adm-save" onClick={() => save()}>Kaydet ve herkese uygula</button>
    </>
  );
}

// ---------------------------------------------------------------- ayarlar
function Settings() {
  const { settings, toast } = useApp();
  const [text, setText] = useState(settings.announcement?.text ?? '');
  const [active, setActive] = useState(Boolean(settings.announcement?.active));
  const disabled: string[] = settings.games?.disabled ?? [];
  async function saveAnn() {
    const r = await call('admin:setSetting', { key: 'announcement', value: { text: text.trim().slice(0, 160), active } });
    toast(r.ok ? 'Duyuru kaydedildi' : r.error!);
  }
  async function toggleGame(g: string) {
    const next = disabled.includes(g) ? disabled.filter(x => x !== g) : [...disabled, g];
    const r = await call('admin:setSetting', { key: 'games', value: { disabled: next } });
    toast(r.ok ? (next.includes(g) ? `${GAMES[g as keyof typeof GAMES].name} kapatıldı` : `${GAMES[g as keyof typeof GAMES].name} açıldı`) : r.error!);
  }
  return (
    <>
      <div className="adm-card">
        <h4 className="adm-h">📢 Duyuru bandı</h4>
        <textarea rows={2} maxLength={160} placeholder="Ör. Bu akşam 21:00'de Okey turnuvası!" value={text} onChange={e => setText(e.target.value)} />
        <div className="adm-row"><span>Lobide göster</span><label className="adm-toggle"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /><i /></label></div>
        <button className="btn primary" onClick={saveAnn}>Kaydet</button>
      </div>
      <div className="adm-card">
        <h4 className="adm-h">🎮 Oyunlar</h4>
        <small className="muted">Kapalı oyun lobide gri görünür ve yeni oda açılamaz.</small>
        {[...PLAYABLE, 'chat' as const].map(g => (
          <div key={g} className="adm-row"><span>{GAMES[g].icon} {GAMES[g].name}</span>
            <label className="adm-toggle"><input type="checkbox" checked={!disabled.includes(g)} onChange={() => toggleGame(g)} /><i /></label></div>
        ))}
      </div>
    </>
  );
}
