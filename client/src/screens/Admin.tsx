// Yönetim paneli: yalnızca yöneticiye görünür; her işlem sunucuda `_is_admin()` ile ayrıca doğrulanır
// ve `admin_log`'a yazılır. Sekmeler: özet, kullanıcılar, odalar, mesajlar, şikayetler, hediyeler,
// temalar, ayarlar, kayıtlar.
import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { call } from '../net';
import Avatar from '../components/Avatar';
import { AvatarPicker } from '../components/AvatarPicker';
import { IconBack } from '../components/Icons';
import { GAMES, PLAYABLE, BOT_GAMES, meta } from '../games';
import { THEMES, activeTheme, DEFAULT_THEME_SETTING, type ThemeSetting } from '../themes';
import { TrFlag } from '../components/ThemeFx';

type Tab = 'stats' | 'users' | 'rooms' | 'messages' | 'reports' | 'gifts' | 'themes' | 'settings' | 'log';
const TABS: { id: Tab; label: string }[] = [
  { id: 'stats', label: '📊 Özet' }, { id: 'users', label: '👥 Kullanıcılar' }, { id: 'rooms', label: '🚪 Odalar' },
  { id: 'messages', label: '💬 Mesajlar' }, { id: 'reports', label: '🚩 Şikayetler' }, { id: 'gifts', label: '🎁 Hediyeler' },
  { id: 'themes', label: '🎨 Temalar' }, { id: 'settings', label: '⚙️ Ayarlar' }, { id: 'log', label: '📜 Kayıtlar' },
];
const REASON_TR: Record<string, string> = { insult: 'Hakaret / küfür', harassment: 'Taciz / zorbalık', spam: 'Spam / reklam', inappropriate: 'Uygunsuz içerik', scam: 'Dolandırıcılık', other: 'Diğer' };
const BAN_OPTS = [{ m: 60, l: '1 saat' }, { m: 1440, l: '1 gün' }, { m: 10080, l: '7 gün' }, { m: 43200, l: '30 gün' }, { m: 5256000, l: 'Kalıcı' }];
const MUTE_OPTS = [{ m: 10, l: '10 dk' }, { m: 60, l: '1 saat' }, { m: 1440, l: '1 gün' }, { m: 10080, l: '7 gün' }];
const PROVIDER_TR: Record<string, string> = { email: 'E-posta / kullanıcı adı', google: 'Google', apple: 'Apple' };
const TIER_TR: Record<string, string> = { small: 'Küçük', medium: 'Orta', large: 'Büyük (efektli)' };
/** İşlem kaydındaki eylemlerin Türkçe adları. */
const ACTION_TR: Record<string, string> = {
  grant: '💎 Cüzdan', ban: '🚫 Yasak', unban: '✅ Yasak kaldırma', mute: '🔇 Susturma', unmute: '🔊 Susturma kaldırma',
  edit_user: '✏️ Kullanıcı düzenleme', admin_add: '🛡️ Yönetici ekleme', admin_remove: '🛡️ Yönetici kaldırma', kick: '👢 Odadan çıkarma',
  delete_message: '🗑️ Mesaj silme', delete_messages: '🧹 Tüm mesajları silme', close_room: '🚪 Oda kapatma', create_room: '➕ Oda açma',
  edit_room: '🛠️ Oda düzenleme', broadcast: '📢 Sistem mesajı', clear_chat: '🧹 Sohbet temizleme', stop_game: '⛔ Oyun durdurma',
  free_seat: '💺 Koltuk boşaltma', room_unban: '🔓 Oda engeli kaldırma', report: '🚩 Şikayet', setting: '⚙️ Ayar', gift: '🎁 Hediye',
};
const SETTING_TR: Record<string, string> = { theme: 'tema', announcement: 'duyuru', games: 'oyunlar', maintenance: 'bakım modu', economy: 'günlük ödül', filter: 'küfür filtresi', bots: 'botlar' };

const fmt = (n: number) => Number(n ?? 0).toLocaleString('tr-TR');
const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  return s < 60 ? 'az önce' : s < 3600 ? `${Math.floor(s / 60)} dk önce` : s < 86400 ? `${Math.floor(s / 3600)} sa önce` : `${Math.floor(s / 86400)} gün önce`;
};
const dt = (iso: string) => new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
const active = (iso?: string | null) => Boolean(iso && Date.parse(iso) > Date.now());
const until = (iso: string) => new Date(iso).getFullYear() - new Date().getFullYear() > 5 ? 'kalıcı' : dt(iso);

/** Sunucu çağrısı + bildirim; başarılıysa `true` döner. */
function useRun() {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  async function run(ev: string, p: any, okMsg: string | ((r: any) => string)) {
    setBusy(true);
    const r = await call(ev, p);
    setBusy(false);
    if (!r.ok) { toast(r.error || 'İşlem yapılamadı'); return false; }
    toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
    return true;
  }
  return { busy, run };
}

export default function Admin({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('stats');
  const [userId, setUserId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  return (
    <div className="admin">
      <header className="admin-head">
        <button className="icon-btn light" onClick={onClose} aria-label="Geri"><IconBack size={20} /></button>
        <div><h2>Yönetim Paneli</h2><small>Tüm işlemler kayıt altına alınır</small></div>
      </header>
      <nav className="admin-tabs">{TABS.map(t => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}</nav>
      <div className="admin-body">
        {tab === 'stats' && <Stats go={setTab} />}
        {tab === 'users' && <Users openUser={setUserId} />}
        {tab === 'rooms' && <Rooms openRoom={setRoomId} />}
        {tab === 'messages' && <Messages openUser={setUserId} />}
        {tab === 'reports' && <Reports openUser={setUserId} />}
        {tab === 'gifts' && <Gifts />}
        {tab === 'themes' && <Themes />}
        {tab === 'settings' && <Settings openUser={setUserId} />}
        {tab === 'log' && <Log />}
      </div>
      {userId && <UserSheet id={userId} onClose={() => setUserId(null)} openRoom={id => { setUserId(null); setRoomId(id); }} />}
      {roomId && <RoomSheet id={roomId} onClose={() => setRoomId(null)} openUser={id => { setRoomId(null); setUserId(id); }} onExit={onClose} />}
    </div>
  );
}

// ---------------------------------------------------------------- özet
function Bars({ data, label, valueKey }: { data: any[]; label: string; valueKey: string }) {
  const max = Math.max(1, ...data.map(d => Number(d[valueKey])));
  return (
    <div className="adm-card">
      <h4 className="adm-h">{label}</h4>
      <div className="adm-bars">
        {data.map(d => (
          <div key={d.day} className="adm-bar" title={`${d.day}: ${fmt(d[valueKey])}`}>
            <small>{fmt(d[valueKey])}</small>
            <i style={{ height: `${Math.max(4, (Number(d[valueKey]) / max) * 100)}%` }} />
            <span>{new Date(d.day + 'T12:00:00').toLocaleDateString('tr-TR', { weekday: 'short' })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stats({ go }: { go: (t: Tab) => void }) {
  const [s, setS] = useState<any>(null);
  const [log, setLog] = useState<any[]>([]);
  const load = async () => {
    const [a, b] = await Promise.all([call<{ stats: any }>('admin:stats'), call<{ log: any[] }>('admin:log')]);
    if (a.ok) setS(a.stats); if (b.ok) setLog(b.log);
  };
  useEffect(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, []);
  if (!s) return <div className="spinner" />;
  const cards: [string, string, string, string, Tab][] = [
    ['👥', 'Kullanıcı', fmt(s.users), `+${s.new_today} bugün`, 'users'], ['🟢', 'Çevrimiçi', fmt(s.online), `${fmt(s.active_rooms ?? s.rooms)} aktif oda`, 'rooms'],
    ['🎮', 'Süren oyun', fmt(s.playing), `${fmt(s.rooms)} oda`, 'rooms'], ['🚩', 'Açık şikayet', fmt(s.open_reports), '', 'reports'],
    ['🚫', 'Yasaklı', fmt(s.banned), s.muted ? `🔇 ${fmt(s.muted)} susturulmuş` : '', 'users'], ['💬', 'Mesaj (24 sa)', fmt(s.messages_today ?? 0), '', 'messages'],
    ['💎', 'Elmas', fmt(s.diamonds), `🪙 ${fmt(s.coins ?? 0)}`, 'gifts'], ['🎁', 'Hediye (24 sa)', fmt(s.gifts_today), '💎 değerinde', 'gifts'],
    ['🤖', 'Bot', fmt(s.bots ?? 0), '', 'settings'],
  ];
  return (
    <>
      {s.maintenance && <button className="adm-alert" onClick={() => go('settings')}>🛠️ Bakım modu AÇIK — kullanıcılar uygulamaya giremiyor. Kapatmak için dokun.</button>}
      <div className="adm-stats">{cards.map(([i, l, v, sub, t]) => <button key={l} className="adm-stat" onClick={() => go(t)}><span>{i}</span><b>{v}</b><small>{l}</small>{sub && <em>{sub}</em>}</button>)}</div>
      {Array.isArray(s.signups) && <Bars data={s.signups} label="Son 7 gün yeni kayıt" valueKey="count" />}
      {Array.isArray(s.gifts_week) && <Bars data={s.gifts_week} label="Son 7 gün hediye (💎)" valueKey="total" />}
      <h4 className="adm-h">Oyunlara göre çevrimiçi</h4>
      <div className="adm-card">
        {Object.keys(s.by_game ?? {}).length === 0 && <p className="muted">Şu an odada kimse yok.</p>}
        {Object.entries(s.by_game ?? {}).map(([g, c]) => <div key={g} className="adm-row"><span>{meta(g).icon} {meta(g).name}</span><b>{String(c)}</b></div>)}
      </div>
      <h4 className="adm-h">Son işlemler</h4>
      <div className="adm-card">
        {log.length === 0 && <p className="muted">Henüz işlem yok.</p>}
        {log.slice(0, 8).map(l => <LogRow key={l.id} l={l} />)}
        {log.length > 0 && <button className="btn ghost small" onClick={() => go('log')}>Tüm kayıtlar ›</button>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- kullanıcılar
const USER_FILTERS = [['all', 'Tümü'], ['online', '🟢 Çevrimiçi'], ['reported', '🚩 Şikayetli'], ['banned', '🚫 Yasaklı'],
  ['muted', '🔇 Susturulmuş'], ['admins', '🛡️ Yöneticiler'], ['rich', '💎 En zengin'], ['bots', '🤖 Botlar']] as const;

function UserRow({ u, onClick }: { u: any; onClick: () => void }) {
  return (
    <button className="adm-user" onClick={onClick}>
      <span className="av"><Avatar value={u.avatar} /></span>
      <div className="grow"><b>{u.username} {u.is_admin && <em className="tag adm">Yönetici</em>}{u.is_bot && <em className="tag adm">BOT</em>}
        {active(u.banned_until) && <em className="tag ban">Yasaklı</em>}{active(u.chat_muted_until) && <em className="tag rep">🔇</em>}
        {u.open_reports > 0 && <em className="tag rep">🚩 {u.open_reports}</em>}</b>
        <small>Lv.{u.level} · 💎 {fmt(u.diamonds)} · 🪙 {fmt(u.coins)}{u.room ? ' · 🟢 odada' : ''}</small></div>
      <span className="chev">›</span>
    </button>
  );
}

function Users({ openUser }: { openUser: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [list, setList] = useState<any[] | null>(null);
  const [more, setMore] = useState(false);
  const load = async (offset = 0) => {
    const r = await call<{ users: any[] }>('admin:users', { q, filter, offset });
    if (!r.ok) return;
    setList(l => offset ? [...(l ?? []), ...r.users] : r.users);
    setMore(r.users.length === 50);
  };
  useEffect(() => { const t = setTimeout(() => load(), 250); return () => clearTimeout(t); }, [q, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <input className="adm-search" placeholder="Kullanıcı adı, e-posta ya da kimlik ara…" value={q} onChange={e => setQ(e.target.value)} />
      <div className="chips adm-chips">
        {USER_FILTERS.map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      <div className="adm-card">
        {list === null && <div className="spinner" />}
        {list?.length === 0 && <p className="muted">Sonuç yok.</p>}
        {list?.map(u => <UserRow key={u.id} u={u} onClick={() => openUser(u.id)} />)}
        {more && <button className="btn ghost small" onClick={() => load(list?.length ?? 0)}>Daha fazla göster</button>}
      </div>
    </>
  );
}

function UserSheet({ id, onClose, openRoom }: { id: string; onClose: () => void; openRoom: (id: string) => void }) {
  const { me } = useApp();
  const { busy, run } = useRun();
  const [d, setD] = useState<any>(null);
  const [sec, setSec] = useState<'manage' | 'edit' | 'activity'>('manage');
  const [dia, setDia] = useState('');
  const [coin, setCoin] = useState('');
  const [reason, setReason] = useState('');
  const [edit, setEdit] = useState<{ username: string; bio: string; avatar: string; level: string } | null>(null);
  const load = async () => {
    const r = await call<{ detail: any }>('admin:user', { id });
    if (!r.ok) return;
    setD(r.detail);
    const p = r.detail.profile;
    setEdit({ username: p.username, bio: p.bio ?? '', avatar: p.avatar, level: String(p.level) });
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (ev: string, p: any, msg: string | ((r: any) => string)) => { if (await run(ev, { id, ...p }, msg)) { setDia(''); setCoin(''); load(); } };

  if (!d || !edit) return <div className="sheet-bg" onClick={onClose}><div className="sheet adm-sheet" onClick={e => e.stopPropagation()}><div className="spinner" /></div></div>;
  const p = d.profile;
  const self = p.id === me.id;
  const banned = active(p.banned_until);
  const muted = active(p.chat_muted_until);
  const prot = d.admin || self; // yöneticiler ve kendin yasaklanamaz / susturulamaz
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet adm-sheet" onClick={e => e.stopPropagation()}>
        <div className="adm-uhead"><span className="av"><Avatar value={p.avatar} /></span>
          <div className="grow"><h3>{p.username} {d.admin && <em className="tag adm">{d.main_admin ? 'Ana yönetici' : 'Yönetici'}</em>}{p.is_bot && <em className="tag adm">BOT</em>}</h3>
            <small>Lv.{p.level} · {new Date(p.created_at).toLocaleDateString('tr-TR')} tarihinde katıldı</small>
            {p.bio && <small className="muted">“{p.bio}”</small>}</div></div>
        <div className="adm-tags">
          {banned && <em className="tag ban">🚫 Yasaklı · {until(p.banned_until)}</em>}
          {muted && <em className="tag rep">🔇 Susturulmuş · {until(p.chat_muted_until)}</em>}
          {d.room && <button className="tag adm" onClick={() => openRoom(d.room.id)}>🟢 {meta(d.room.game).icon} {d.room.name} ›</button>}
        </div>
        <div className="stats adm-ustats">
          <div><b>💎 {fmt(d.wallet?.diamonds)}</b><small>Elmas</small></div><div><b>🪙 {fmt(d.wallet?.coins)}</b><small>Altın</small></div>
          <div><b>👫 {d.friends}</b><small>Arkadaş</small></div><div><b>🚩 {d.reports.filter((r: any) => r.status === 'open').length}</b><small>Açık şikayet</small></div>
        </div>
        <div className="seg adm-seg">
          <button className={sec === 'manage' ? 'on' : ''} onClick={() => setSec('manage')}>Yönet</button>
          <button className={sec === 'edit' ? 'on' : ''} onClick={() => setSec('edit')}>Düzenle</button>
          <button className={sec === 'activity' ? 'on' : ''} onClick={() => setSec('activity')}>Geçmiş</button>
        </div>

        {sec === 'manage' && <>
          <h4 className="adm-h">Elmas / altın ver ya da al</h4>
          <div className="adm-grant">
            <input inputMode="numeric" placeholder="± elmas" value={dia} onChange={e => setDia(e.target.value.replace(/[^\d-]/g, ''))} />
            <input inputMode="numeric" placeholder="± altın" value={coin} onChange={e => setCoin(e.target.value.replace(/[^\d-]/g, ''))} />
            <button className="btn gold small" disabled={busy || (!dia && !coin)} onClick={() => act('admin:grant', { diamonds: dia || 0, coins: coin || 0 }, 'Cüzdan güncellendi')}>Uygula</button>
          </div>
          <div className="adm-quick">{[100, 1000, 10000].map(n => <button key={n} className="btn ghost small" disabled={busy} onClick={() => act('admin:grant', { diamonds: n, coins: 0 }, `+${fmt(n)} 💎 verildi`)}>+{fmt(n)} 💎</button>)}
            <button className="btn ghost small" disabled={busy} onClick={() => act('admin:grant', { diamonds: 0, coins: 5000 }, '+5.000 🪙 verildi')}>+5.000 🪙</button></div>

          <h4 className="adm-h">{muted ? `Susturulmuş · ${until(p.chat_muted_until)}` : 'Sohbetten sustur'}</h4>
          {muted ? <button className="btn primary" disabled={busy} onClick={() => act('admin:mute', { minutes: 0 }, 'Susturma kaldırıldı')}>🔊 Susturmayı kaldır</button>
            : <div className="adm-quick">{MUTE_OPTS.map(o => <button key={o.m} className="btn ghost small" disabled={busy || prot} onClick={() => act('admin:mute', { minutes: o.m }, `${p.username} ${o.l} susturuldu`)}>🔇 {o.l}</button>)}</div>}

          <h4 className="adm-h">{banned ? `Yasaklı · ${until(p.banned_until)}` : 'Yasakla'}</h4>
          {banned ? (<>
            {p.ban_reason && <p className="adm-quote">Sebep: {p.ban_reason}</p>}
            <button className="btn primary" disabled={busy} onClick={() => act('admin:ban', { minutes: 0 }, 'Yasak kaldırıldı')}>✅ Yasağı kaldır</button>
          </>) : (<>
            <input placeholder="Sebep (kullanıcıya gösterilir)" value={reason} onChange={e => setReason(e.target.value)} maxLength={200} />
            <div className="adm-quick">{BAN_OPTS.map(o => <button key={o.m} className="btn danger small" disabled={busy || prot}
              onClick={() => (o.m < 43200 || confirm(`${p.username} ${o.l} yasaklansın mı?`)) && act('admin:ban', { minutes: o.m, reason }, `${p.username} ${o.l} yasaklandı`)}>{o.l}</button>)}</div>
          </>)}
          {prot && <small className="muted">{self ? 'Kendine bu işlemleri uygulayamazsın.' : 'Yöneticiler yasaklanamaz ve susturulamaz.'}</small>}

          <h4 className="adm-h">Diğer</h4>
          <div className="adm-quick">
            {d.room && <button className="btn ghost small" disabled={busy || self} onClick={() => act('admin:kick', { minutes: 0 }, 'Odadan çıkarıldı')}>👢 Odadan çıkar</button>}
            {d.room && <button className="btn ghost small" disabled={busy || self} onClick={() => act('admin:kick', { minutes: 60 }, 'Odadan çıkarıldı, 1 saat giremez')}>👢 Çıkar + 1 sa engelle</button>}
            <button className="btn ghost small" disabled={busy} onClick={() => confirm(`${p.username} kullanıcısının tüm sohbet mesajları silinsin mi?`) && act('admin:deleteUserMessages', {}, r => `${r.count ?? 0} mesaj silindi`)}>🧹 Tüm mesajlarını sil</button>
            {!p.is_bot && !self && !d.main_admin && (d.admin
              ? <button className="btn danger small" disabled={busy} onClick={() => confirm(`${p.username} yönetici yetkisi alınsın mı?`) && act('admin:setAdmin', { on: false }, 'Yönetici yetkisi alındı')}>🛡️ Yöneticilikten çıkar</button>
              : <button className="btn ghost small" disabled={busy} onClick={() => confirm(`${p.username} yönetici yapılsın mı? Panele tam erişimi olur.`) && act('admin:setAdmin', { on: true }, `${p.username} artık yönetici`)}>🛡️ Yönetici yap</button>)}
          </div>
        </>}

        {sec === 'edit' && <>
          <label className="adm-lbl">Kullanıcı adı<input value={edit.username} maxLength={20} onChange={e => setEdit({ ...edit, username: e.target.value })} /></label>
          <label className="adm-lbl">Hakkında<textarea rows={2} maxLength={120} value={edit.bio} onChange={e => setEdit({ ...edit, bio: e.target.value })} /></label>
          <label className="adm-lbl">Seviye<input inputMode="numeric" value={edit.level} onChange={e => setEdit({ ...edit, level: e.target.value.replace(/\D/g, '') })} /></label>
          <AvatarPicker value={edit.avatar} onChange={a => setEdit({ ...edit, avatar: a })} />
          <button className="btn primary" disabled={busy} onClick={() => {
            const ch: any = {};
            if (edit.username.trim() !== p.username) ch.username = edit.username.trim();
            if (edit.bio !== (p.bio ?? '')) ch.bio = edit.bio;
            if (edit.avatar !== p.avatar) ch.avatar = edit.avatar;
            if (Number(edit.level) !== p.level) ch.level = Number(edit.level);
            act('admin:editUser', ch, 'Profil güncellendi');
          }}>Kaydet</button>
          <button className="btn ghost small" disabled={busy || !p.bio} onClick={() => act('admin:editUser', { bio: '' }, 'Hakkında yazısı silindi')}>Uygunsuz “hakkında” yazısını sil</button>
          <h4 className="adm-h">Hesap</h4>
          <div className="adm-card adm-inner">
            {d.email && <div className="adm-row"><span>E-posta</span><small className="adm-break">{d.email.endsWith('@parti.local') ? '— (kullanıcı adıyla kayıt)' : d.email}</small></div>}
            <div className="adm-row"><span>Giriş yöntemi</span><small>{PROVIDER_TR[d.provider] ?? d.provider ?? '—'}</small></div>
            <div className="adm-row"><span>Son giriş</span><small>{d.last_sign_in ? dt(d.last_sign_in) : '—'}</small></div>
            <div className="adm-row"><span>Günlük ödül</span><small>{d.wallet?.last_daily ? new Date(d.wallet.last_daily).toLocaleDateString('tr-TR') : 'hiç almadı'}</small></div>
            <div className="adm-row"><span>Gönderdiği / aldığı hediye</span><small>💎 {fmt(d.gifts_sent)} / {fmt(d.gifts_received)}</small></div>
            <div className="adm-row"><span>Engelleyen kişi</span><small>{d.blocked_by}</small></div>
            <div className="adm-row"><span>Yaptığı şikayet</span><small>{d.reports_filed}</small></div>
            <div className="adm-row"><span>Kimlik</span><small className="adm-break">{p.id}</small></div>
          </div>
        </>}

        {sec === 'activity' && <>
          <h4 className="adm-h">Son mesajları</h4>
          <div className="adm-card adm-inner">
            {d.messages.length === 0 && <p className="muted">Mesaj yok.</p>}
            {d.messages.map((m: any) => (
              <div key={m.id} className="adm-msg"><div className="grow"><span>{m.text}</span><small>{m.room_id} · {ago(m.created_at)}</small></div>
                <button className="btn ghost small" disabled={busy} onClick={() => act('admin:deleteMessage', { id: m.id }, 'Mesaj silindi')} aria-label="Sil">🗑️</button></div>
            ))}
          </div>
          <h4 className="adm-h">Hakkındaki şikayetler</h4>
          <div className="adm-card adm-inner">
            {d.reports.length === 0 && <p className="muted">Şikayet yok.</p>}
            {d.reports.map((r: any) => <div key={r.id} className="adm-row"><span>{REASON_TR[r.reason] ?? r.reason}{r.details ? ` — “${r.details}”` : ''}<small className="muted"> · {r.reporter} · {r.status === 'open' ? '🟠 açık' : r.status === 'reviewed' ? '✅' : '⚪'}</small></span><small>{ago(r.created_at)}</small></div>)}
          </div>
          <h4 className="adm-h">Hediyeler</h4>
          <div className="adm-card adm-inner">
            {d.gifts.length === 0 && <p className="muted">Hediye yok.</p>}
            {d.gifts.map((g: any) => <div key={g.id} className="adm-row"><span>{g.dir === 'out' ? '➡️' : '⬅️'} {g.qty}× {g.icon} {g.name} · {g.other}</span><small>💎 {fmt(g.total)} · {ago(g.created_at)}</small></div>)}
          </div>
          <h4 className="adm-h">Yönetici işlemleri</h4>
          <div className="adm-card adm-inner">
            {d.history.length === 0 && <p className="muted">Kayıt yok.</p>}
            {d.history.map((l: any, i: number) => <LogRow key={i} l={l} />)}
          </div>
        </>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- odalar
function Rooms({ openRoom }: { openRoom: (id: string) => void }) {
  const { toast } = useApp();
  const [list, setList] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [game, setGame] = useState<string>('uno');
  const [creating, setCreating] = useState(false);
  const load = async () => { const r = await call<{ rooms: any[] }>('admin:rooms'); if (r.ok) setList(r.rooms); };
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);
  async function create() {
    const x = await call('admin:createRoom', { name, game, topic });
    if (!x.ok) return toast(x.error!);
    toast('Kalıcı oda açıldı'); setName(''); setTopic(''); setCreating(false); load();
  }
  const shown = (list ?? []).filter(r => !q || `${r.name} ${r.id} ${r.owner ?? ''}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')));
  return (
    <>
      <div className="adm-row adm-top">
        <input className="adm-search grow" placeholder="Oda adı, kodu ya da sahibi…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn primary small" onClick={() => setCreating(c => !c)}>{creating ? 'Vazgeç' : '+ Oda'}</button>
      </div>
      {creating && (
        <div className="adm-card adm-create">
          <h4 className="adm-h">Kalıcı oda aç</h4>
          <input placeholder="Oda adı" value={name} onChange={e => setName(e.target.value)} maxLength={30} />
          <input placeholder="Konu (isteğe bağlı)" value={topic} onChange={e => setTopic(e.target.value)} maxLength={60} />
          <div className="chips adm-chips">{[...PLAYABLE, 'chat' as const].map(g => <button key={g} className={game === g ? 'on' : ''} onClick={() => setGame(g)}>{GAMES[g].icon} {GAMES[g].name}</button>)}</div>
          <button className="btn primary" disabled={name.trim().length < 2} onClick={create}>Oluştur</button>
        </div>
      )}
      <Broadcast />
      <div className="adm-card">
        {list === null && <div className="spinner" />}
        {list && shown.length === 0 && <p className="muted">Oda yok.</p>}
        {shown.map(r => (
          <button key={r.id} className="adm-room" onClick={() => openRoom(r.id)}>
            <span className="adm-ricon">{meta(r.game).icon}</span>
            <div className="grow"><b>{r.name} {r.permanent && <em className="tag adm">Kalıcı</em>}{r.playing && <em className="tag rep">Oyunda</em>}</b>
              <small>{r.id} · 🟢 {r.online} · {r.owner ? `👑 ${r.owner}` : 'sahipsiz'}</small></div>
            <span className="chev">›</span>
          </button>
        ))}
      </div>
    </>
  );
}

/** Tüm dolu odalara (ya da tek odaya) sistem mesajı. */
function Broadcast({ room }: { room?: string }) {
  const { busy, run } = useRun();
  const [text, setText] = useState('');
  return (
    <div className="adm-card">
      <h4 className="adm-h">📢 {room ? 'Bu odaya sistem mesajı' : 'Tüm aktif odalara sistem mesajı'}</h4>
      <div className="adm-row">
        <input className="grow" maxLength={200} placeholder="Ör. 5 dakika sonra kısa bir bakım yapılacak" value={text} onChange={e => setText(e.target.value)} />
        <button className="btn primary small" disabled={busy || !text.trim()} onClick={async () => {
          if (await run('admin:roomMessage', { id: room ?? '', text }, r => room ? 'Mesaj gönderildi' : `${r.rooms} odaya gönderildi`)) setText('');
        }}>Gönder</button>
      </div>
    </div>
  );
}

function RoomSheet({ id, onClose, openUser, onExit }: { id: string; onClose: () => void; openUser: (id: string) => void; onExit: () => void }) {
  const { openRoom } = useApp();
  const { busy, run } = useRun();
  const [d, setD] = useState<any>(null);
  const [form, setForm] = useState<{ name: string; topic: string; game: string; permanent: boolean } | null>(null);
  const load = async () => {
    const r = await call<{ detail: any }>('admin:room', { id });
    if (!r.ok) { onClose(); return; }
    setD(r.detail);
    setForm(f => f ?? { name: r.detail.room.name, topic: r.detail.room.topic ?? '', game: r.detail.room.game, permanent: r.detail.room.permanent });
  };
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (ev: string, p: any, msg: string) => { if (await run(ev, { id, ...p }, msg)) load(); };
  if (!d || !form) return <div className="sheet-bg" onClick={onClose}><div className="sheet adm-sheet" onClick={e => e.stopPropagation()}><div className="spinner" /></div></div>;
  const r = d.room;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet adm-sheet" onClick={e => e.stopPropagation()}>
        <div className="adm-uhead"><span className="adm-ricon">{meta(r.game).icon}</span>
          <div className="grow"><h3>{r.name}</h3><small>{r.id} · {meta(r.game).name} · {r.owner ? `👑 ${r.owner}` : 'sahipsiz'} · {new Date(r.created_at).toLocaleDateString('tr-TR')}</small></div></div>
        <div className="adm-quick">
          <button className="btn primary small" onClick={() => { onExit(); openRoom(r.id); }}>Odaya git</button>
          {d.game?.running && <button className="btn danger small" disabled={busy} onClick={() => confirm('Süren oyun durdurulsun mu?') && act('admin:stopGame', {}, 'Oyun durduruldu')}>⛔ Oyunu durdur</button>}
          <button className="btn ghost small" disabled={busy} onClick={() => confirm('Bu odanın tüm sohbeti silinsin mi?') && act('admin:clearChat', {}, 'Sohbet temizlendi')}>🧹 Sohbeti temizle</button>
          <button className="btn danger small" disabled={busy} onClick={async () => {
            if (!confirm(`"${r.name}" kapatılsın mı? İçindekiler odadan çıkarılır.`)) return;
            if (await run('admin:closeRoom', { id }, 'Oda kapatıldı')) onClose();
          }}>🚪 Odayı kapat</button>
        </div>
        {d.game && <small className="muted">🎮 {d.game.running ? `Oyun sürüyor · ${d.game.players.length} oyuncu` : `Son oyun bitti${d.game.winner ? ` · 🏆 ${d.game.winner}` : ''}`}</small>}

        <h4 className="adm-h">Koltuklar</h4>
        <div className="adm-seats">
          {d.seats.map((s: any) => (
            <div key={s.seat} className={`adm-seat ${s.user ? '' : 'empty'}`}>
              {s.user ? <button className="av" onClick={() => !s.user.is_bot && openUser(s.user.id)}><Avatar value={s.user.avatar} /></button> : <span className="av">{s.locked ? '🔒' : s.seat}</span>}
              <small>{s.user ? s.user.username : s.locked ? 'Kilitli' : 'Boş'}</small>
              {s.user && <button className="adm-x" disabled={busy} onClick={() => act('admin:freeSeat', { seat: s.seat }, 'Koltuk boşaltıldı')} aria-label="Koltuktan kaldır">✕</button>}
            </div>
          ))}
        </div>

        <h4 className="adm-h">Odadakiler ({d.people.length})</h4>
        <div className="adm-card adm-inner">
          {d.people.length === 0 && <p className="muted">Kimse yok.</p>}
          {d.people.map((u: any) => (
            <div key={u.id} className="adm-room">
              <span className="av sm"><Avatar value={u.avatar} /></span>
              <button className="grow adm-link" onClick={() => openUser(u.id)}><b>{u.username}</b><small>{u.online ? '🟢' : '⚪'} {ago(u.joined_at)} girdi</small></button>
              <button className="btn ghost small" disabled={busy} onClick={() => run('admin:kick', { id: u.id, minutes: 0 }, 'Odadan çıkarıldı').then(ok => { if (ok) load(); })}>👢</button>
            </div>
          ))}
        </div>
        {d.bans.length > 0 && <>
          <h4 className="adm-h">Odaya girişi engelliler</h4>
          <div className="adm-card adm-inner">
            {d.bans.map((b: any) => <div key={b.id} className="adm-row"><span>{b.username} <small className="muted">· {dt(b.until)}’e kadar</small></span>
              <button className="btn ghost small" disabled={busy} onClick={() => act('admin:unbanRoom', { user: b.id }, 'Engel kaldırıldı')}>Kaldır</button></div>)}
          </div>
        </>}

        <Broadcast room={r.id} />

        <h4 className="adm-h">Son mesajlar</h4>
        <div className="adm-card adm-inner adm-chatlog">
          {d.messages.length === 0 && <p className="muted">Mesaj yok.</p>}
          {d.messages.map((m: any) => (
            <div key={m.id} className={`adm-msg ${m.kind !== 'chat' ? 'sys' : ''}`}>
              <div className="grow"><span>{m.kind === 'chat' && <b>{m.username}: </b>}{m.text}</span><small>{ago(m.created_at)}</small></div>
              {m.kind === 'chat' && <button className="btn ghost small" disabled={busy} onClick={() => act('admin:deleteMessage', { id: m.id }, 'Mesaj silindi')} aria-label="Sil">🗑️</button>}
            </div>
          ))}
        </div>

        <h4 className="adm-h">Odayı düzenle</h4>
        <label className="adm-lbl">Ad<input value={form.name} maxLength={30} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label className="adm-lbl">Konu<input value={form.topic} maxLength={60} onChange={e => setForm({ ...form, topic: e.target.value })} /></label>
        <div className="chips adm-chips">{[...PLAYABLE, 'chat' as const].map(g => <button key={g} className={form.game === g ? 'on' : ''} onClick={() => setForm({ ...form, game: g })}>{GAMES[g].icon} {GAMES[g].name}</button>)}</div>
        <div className="adm-row"><span>Kalıcı oda (boşken silinmez)</span><label className="adm-toggle"><input type="checkbox" checked={form.permanent} onChange={e => setForm({ ...form, permanent: e.target.checked })} /><i /></label></div>
        <button className="btn primary" disabled={busy || form.name.trim().length < 2} onClick={() => act('admin:editRoom', form, 'Oda güncellendi')}>Kaydet</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- mesajlar
function Messages({ openUser }: { openUser: (id: string) => void }) {
  const { busy, run } = useRun();
  const [q, setQ] = useState('');
  const [room, setRoom] = useState('');
  const [list, setList] = useState<any[] | null>(null);
  const [more, setMore] = useState(false);
  const load = async (before?: number) => {
    const r = await call<{ messages: any[] }>('admin:messages', { q, room: room.trim(), before });
    if (!r.ok) return;
    setList(l => before ? [...(l ?? []), ...r.messages] : r.messages);
    setMore(r.messages.length === 60);
  };
  useEffect(() => { const t = setTimeout(() => load(), 300); return () => clearTimeout(t); }, [q, room]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="adm-row adm-top">
        <input className="adm-search grow" placeholder="Mesajlarda ara…" value={q} onChange={e => setQ(e.target.value)} />
        <input className="adm-search adm-narrow" placeholder="Oda kodu" value={room} onChange={e => setRoom(e.target.value)} />
      </div>
      <small className="muted">Son 24 saatin sohbet mesajları (eski mesajlar otomatik silinir). Silinen mesaj odadakilerin ekranından da kalkar.</small>
      <div className="adm-card">
        {list === null && <div className="spinner" />}
        {list?.length === 0 && <p className="muted">Mesaj yok.</p>}
        {list?.map(m => (
          <div key={m.id} className="adm-msg">
            <button className="av sm" onClick={() => openUser(m.author.id)}><Avatar value={m.author.avatar} /></button>
            <div className="grow"><span><b>{m.author.username}: </b>{m.text}</span><small>{m.room_name ?? m.room_id} · {ago(m.created_at)}</small></div>
            <button className="btn ghost small" disabled={busy} onClick={async () => { if (await run('admin:deleteMessage', { id: m.id }, 'Mesaj silindi')) setList(l => l?.filter(x => x.id !== m.id) ?? null); }} aria-label="Sil">🗑️</button>
          </div>
        ))}
        {more && list && <button className="btn ghost small" onClick={() => load(list[list.length - 1].id)}>Daha eski</button>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- şikayetler
function Reports({ openUser }: { openUser: (id: string) => void }) {
  const { toast } = useApp();
  const [status, setStatus] = useState<'open' | 'reviewed' | 'dismissed'>('open');
  const [list, setList] = useState<any[] | null>(null);
  const load = async () => { const r = await call<{ reports: any[] }>('admin:reports', { status }); if (r.ok) setList(r.reports); };
  useEffect(() => { setList(null); load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  async function act(ev: string, p: any, msg: string) { const r = await call(ev, p); toast(r.ok ? msg : r.error!); load(); }
  async function punish(r: any, ev: string, p: any, msg: string) {
    const b = await call(ev, p);
    if (!b.ok) return toast(b.error!);
    act('admin:resolve', { id: r.id, status: 'reviewed' }, msg);
  }
  return (
    <>
      <div className="chips adm-chips">
        {([['open', '🟠 Açık'], ['reviewed', '✅ İncelendi'], ['dismissed', '⚪ Reddedildi']] as const).map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}
      </div>
      {list === null && <div className="spinner" />}
      {list?.length === 0 && <p className="empty">Bu durumda şikayet yok 🎉</p>}
      {list?.map(r => (
        <div key={r.id} className="adm-card adm-report">
          <button className="adm-rp-head" onClick={() => openUser(r.target.id)}>
            <span className="av"><Avatar value={r.target.avatar} /></span>
            <div className="grow"><b>{r.target.username} {active(r.target.banned_until) && <em className="tag ban">Yasaklı</em>}</b><small>{REASON_TR[r.reason] ?? r.reason} · toplam {r.total_against} şikayet</small></div>
            <small>{ago(r.created_at)}</small>
          </button>
          {r.details && <p className="adm-quote">“{r.details}”</p>}
          <small className="muted">Şikayet eden: {r.reporter.username}{r.room_id ? ` · oda ${r.room_id}` : ''}</small>
          {status === 'open' ? (
            <div className="adm-quick">
              <button className="btn primary small" onClick={() => act('admin:resolve', { id: r.id, status: 'reviewed' }, 'İncelendi olarak işaretlendi')}>✅ İncelendi</button>
              <button className="btn ghost small" onClick={() => act('admin:resolve', { id: r.id, status: 'dismissed' }, 'Şikayet reddedildi')}>Reddet</button>
              <button className="btn ghost small" onClick={() => punish(r, 'admin:mute', { id: r.target.id, minutes: 60 }, `${r.target.username} 1 saat susturuldu`)}>🔇 1 sa sustur</button>
              <button className="btn danger small" onClick={() => punish(r, 'admin:ban', { id: r.target.id, minutes: 1440, reason: REASON_TR[r.reason] ?? 'Kural ihlali' }, `${r.target.username} 1 gün yasaklandı`)}>🚫 1 gün yasakla</button>
            </div>
          ) : <button className="btn ghost small" onClick={() => act('admin:resolve', { id: r.id, status: 'open' }, 'Şikayet yeniden açıldı')}>↩️ Yeniden aç</button>}
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- hediyeler
const EMPTY_GIFT = { id: '', name: '', icon: '', price: '10', tier: 'small', sort: '10', active: true, isNew: true };
function Gifts() {
  const { busy, run } = useRun();
  const [list, setList] = useState<any[] | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const load = async () => { const r = await call<{ gifts: any[] }>('admin:gifts'); if (r.ok) setList(r.gifts); };
  useEffect(() => { load(); }, []);
  async function save(g: any) {
    if (await run('admin:saveGift', g, 'Hediye kaydedildi')) { setEdit(null); load(); }
  }
  return (
    <>
      <div className="adm-row adm-top"><small className="muted grow">Kapalı hediye mağazada görünmez ve gönderilemez. Geçmiş kayıtlar silinmez.</small>
        <button className="btn primary small" onClick={() => setEdit({ ...EMPTY_GIFT })}>+ Hediye</button></div>
      <div className="adm-card">
        {list === null && <div className="spinner" />}
        {list?.map(g => (
          <div key={g.id} className={`adm-room ${g.active ? '' : 'off'}`}>
            <span className="adm-ricon">{g.icon}</span>
            <button className="grow adm-link" onClick={() => setEdit({ ...g, price: String(g.price), sort: String(g.sort) })}>
              <b>{g.name} {!g.active && <em className="tag ban">Kapalı</em>}<em className="tag adm">{TIER_TR[g.tier] ?? g.tier}</em></b>
              <small>💎 {fmt(g.price)} · {fmt(g.sold)} adet satıldı · 💎 {fmt(g.revenue)}</small></button>
            <label className="adm-toggle"><input type="checkbox" checked={g.active} disabled={busy} onChange={e => save({ ...g, active: e.target.checked })} /><i /></label>
          </div>
        ))}
      </div>
      {edit && (
        <div className="sheet-bg" onClick={() => setEdit(null)}>
          <div className="sheet adm-sheet" onClick={e => e.stopPropagation()}>
            <h3>{edit.isNew ? 'Yeni hediye' : `${edit.icon} ${edit.name}`}</h3>
            {edit.isNew && <label className="adm-lbl">Kimlik (küçük harf, değişmez)<input value={edit.id} maxLength={20} placeholder="ör. yildiz" onChange={e => setEdit({ ...edit, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} /></label>}
            <div className="adm-grant two">
              <label className="adm-lbl">Emoji<input value={edit.icon} maxLength={8} placeholder="⭐" onChange={e => setEdit({ ...edit, icon: e.target.value })} /></label>
              <label className="adm-lbl">Ad<input value={edit.name} maxLength={20} onChange={e => setEdit({ ...edit, name: e.target.value })} /></label>
              <label className="adm-lbl">Fiyat (💎)<input inputMode="numeric" value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value.replace(/\D/g, '') })} /></label>
              <label className="adm-lbl">Sıra<input inputMode="numeric" value={edit.sort} onChange={e => setEdit({ ...edit, sort: e.target.value.replace(/\D/g, '') })} /></label>
            </div>
            <div className="seg adm-seg">{Object.entries(TIER_TR).map(([k, l]) => <button key={k} className={edit.tier === k ? 'on' : ''} onClick={() => setEdit({ ...edit, tier: k })}>{l}</button>)}</div>
            <div className="adm-row"><span>Mağazada açık</span><label className="adm-toggle"><input type="checkbox" checked={edit.active} onChange={e => setEdit({ ...edit, active: e.target.checked })} /><i /></label></div>
            <button className="btn primary big" disabled={busy || !edit.id || !edit.name.trim() || !edit.icon.trim() || !Number(edit.price)} onClick={() => save(edit)}>Kaydet</button>
          </div>
        </div>
      )}
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
function Settings({ openUser }: { openUser: (id: string) => void }) {
  const { settings, toast } = useApp();
  const [text, setText] = useState(settings.announcement?.text ?? '');
  const [annOn, setAnnOn] = useState(Boolean(settings.announcement?.active));
  const [mText, setMText] = useState(settings.maintenance?.text ?? '');
  const [daily, setDaily] = useState({ d: String(settings.economy?.daily_diamonds ?? 50), c: String(settings.economy?.daily_coins ?? 200) });
  const [words, setWords] = useState<string[] | null>(null);
  const [word, setWord] = useState('');
  const [admins, setAdmins] = useState<any[] | null>(null);
  const disabled: string[] = settings.games?.disabled ?? [];
  const maint = Boolean(settings.maintenance?.active);
  const botsOn = settings.bots?.enabled !== false;

  useEffect(() => {
    call<{ value: any }>('admin:getSetting', { key: 'filter' }).then(r => setWords(r.ok ? (r.value?.words ?? []) : []));
    call<{ admins: any[] }>('admin:admins').then(r => r.ok && setAdmins(r.admins));
  }, []);

  async function set(key: string, value: any, msg: string) {
    const r = await call('admin:setSetting', { key, value });
    toast(r.ok ? msg : r.error!);
    return r.ok;
  }
  async function toggleGame(g: string) {
    const next = disabled.includes(g) ? disabled.filter(x => x !== g) : [...disabled, g];
    const n = GAMES[g as keyof typeof GAMES].name;
    set('games', { disabled: next }, next.includes(g) ? `${n} kapatıldı` : `${n} açıldı`);
  }
  async function saveWords(next: string[]) {
    if (await set('filter', { words: next }, 'Küfür listesi güncellendi')) setWords(next);
  }
  return (
    <>
      <div className={`adm-card ${maint ? 'adm-danger' : ''}`}>
        <h4 className="adm-h">🛠️ Bakım modu</h4>
        <small className="muted">Açıkken yöneticiler dışında kimse uygulamayı kullanamaz; odadakiler bakım ekranına düşer.</small>
        <textarea rows={2} maxLength={160} placeholder="Kullanıcılara gösterilecek mesaj (isteğe bağlı)" value={mText} onChange={e => setMText(e.target.value)} />
        <div className="adm-quick">
          {maint ? <button className="btn primary" onClick={() => set('maintenance', { active: false, text: mText.trim() }, 'Bakım modu kapatıldı')}>✅ Bakımı bitir</button>
            : <button className="btn danger" onClick={() => confirm('Bakım modu açılsın mı? Kullanıcılar uygulamaya giremez.') && set('maintenance', { active: true, text: mText.trim() }, 'Bakım modu açıldı')}>Bakım modunu aç</button>}
          {maint && <button className="btn ghost small" onClick={() => set('maintenance', { active: true, text: mText.trim() }, 'Mesaj güncellendi')}>Mesajı güncelle</button>}
        </div>
      </div>

      <div className="adm-card">
        <h4 className="adm-h">📢 Duyuru bandı</h4>
        <textarea rows={2} maxLength={160} placeholder="Ör. Bu akşam 21:00'de Okey turnuvası!" value={text} onChange={e => setText(e.target.value)} />
        <div className="adm-row"><span>Lobide göster</span><label className="adm-toggle"><input type="checkbox" checked={annOn} onChange={e => setAnnOn(e.target.checked)} /><i /></label></div>
        <button className="btn primary" onClick={() => set('announcement', { text: text.trim().slice(0, 160), active: annOn }, 'Duyuru kaydedildi')}>Kaydet</button>
      </div>
      <Broadcast />

      <div className="adm-card">
        <h4 className="adm-h">🎮 Oyunlar</h4>
        <small className="muted">Kapalı oyun lobide gri görünür; yeni oda açılamaz ve mevcut odalarda yeni oyun başlatılamaz.</small>
        {[...PLAYABLE, 'chat' as const].map(g => (
          <div key={g} className="adm-row"><span>{GAMES[g].icon} {GAMES[g].name}</span>
            <label className="adm-toggle"><input type="checkbox" checked={!disabled.includes(g)} onChange={() => toggleGame(g)} /><i /></label></div>
        ))}
      </div>

      <div className="adm-card">
        <h4 className="adm-h">🤖 Botlar</h4>
        <div className="adm-row"><span>Masalara bot eklenebilsin<small className="muted"> ({BOT_GAMES.map(g => GAMES[g].name).join(', ')})</small></span>
          <label className="adm-toggle"><input type="checkbox" checked={botsOn} onChange={e => set('bots', { enabled: e.target.checked }, e.target.checked ? 'Botlar açıldı' : 'Botlar kapatıldı (masadakiler oyunu bitirir)')} /><i /></label></div>
      </div>

      <div className="adm-card">
        <h4 className="adm-h">🎁 Günlük ödül</h4>
        <div className="adm-grant">
          <input inputMode="numeric" value={daily.d} onChange={e => setDaily({ ...daily, d: e.target.value.replace(/\D/g, '') })} aria-label="Elmas" />
          <input inputMode="numeric" value={daily.c} onChange={e => setDaily({ ...daily, c: e.target.value.replace(/\D/g, '') })} aria-label="Altın" />
          <button className="btn gold small" onClick={() => set('economy', { daily_diamonds: Math.min(100000, Number(daily.d) || 0), daily_coins: Math.min(1000000, Number(daily.c) || 0) }, 'Günlük ödül güncellendi')}>Kaydet</button>
        </div>
        <small className="muted">💎 elmas · 🪙 altın — her kullanıcı günde bir kez alır.</small>
      </div>

      <div className="adm-card">
        <h4 className="adm-h">🤬 Ek küfür / yasaklı kelime listesi</h4>
        <small className="muted">Yerleşik Türkçe filtreye ek olarak bu kelimeler (ve ekli halleri) sohbette yıldızlanır. Liste yalnızca yöneticilere görünür.</small>
        <div className="adm-row">
          <input className="grow" maxLength={30} placeholder="Kelime ekle" value={word} onChange={e => setWord(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && word.trim().length >= 2 && words) { saveWords([...new Set([...words, word.trim().toLocaleLowerCase('tr')])]); setWord(''); } }} />
          <button className="btn primary small" disabled={!words || word.trim().length < 2} onClick={() => { saveWords([...new Set([...(words ?? []), word.trim().toLocaleLowerCase('tr')])]); setWord(''); }}>Ekle</button>
        </div>
        <div className="adm-words">
          {words === null && <div className="spinner" />}
          {words?.length === 0 && <small className="muted">Ek kelime yok.</small>}
          {words?.map(w => <button key={w} className="adm-word" onClick={() => saveWords(words.filter(x => x !== w))}>{w} ✕</button>)}
        </div>
      </div>

      <div className="adm-card">
        <h4 className="adm-h">🛡️ Yöneticiler</h4>
        <small className="muted">Yeni yönetici eklemek için Kullanıcılar sekmesinden kişiyi açıp “Yönetici yap”a bas. Ana yönetici e-postayla tanımlıdır, kaldırılamaz.</small>
        {admins === null && <div className="spinner" />}
        {admins?.map(a => <UserRow key={a.id} u={{ ...a, is_admin: true, level: '—', diamonds: 0, coins: 0 }} onClick={() => openUser(a.id)} />)}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- kayıtlar
function logText(l: any) {
  const d = l.detail ?? {};
  switch (l.action) {
    case 'grant': return `${d.diamonds ? `${d.diamonds > 0 ? '+' : ''}${fmt(d.diamonds)} 💎 ` : ''}${d.coins ? `${d.coins > 0 ? '+' : ''}${fmt(d.coins)} 🪙` : ''}`;
    case 'ban': return `${BAN_OPTS.find(o => o.m === d.minutes)?.l ?? `${d.minutes} dk`}${d.reason ? ` · ${d.reason}` : ''}`;
    case 'mute': return MUTE_OPTS.find(o => o.m === d.minutes)?.l ?? `${d.minutes} dk`;
    case 'edit_user': return Object.keys(d).join(', ');
    case 'setting': return SETTING_TR[l.target] ?? l.target;
    case 'broadcast': return `“${d.text}” · ${d.rooms} oda`;
    case 'delete_message': return d.text ? `“${String(d.text).slice(0, 40)}”` : '';
    case 'delete_messages': return `${d.count} mesaj`;
    case 'report': return d.status === 'reviewed' ? 'incelendi' : d.status === 'dismissed' ? 'reddedildi' : 'yeniden açıldı';
    case 'gift': return `${d.icon ?? ''} ${d.name ?? ''} · 💎 ${fmt(d.price)}${d.active === false ? ' · kapalı' : ''}`;
    case 'create_room': case 'edit_room': return d.name ?? '';
    default: return '';
  }
}

function LogRow({ l }: { l: any }) {
  const target = l.target_name ?? (l.action === 'setting' ? '' : l.target);
  return (
    <div className="adm-row adm-log">
      <span><b>{ACTION_TR[l.action] ?? l.action}</b>{target ? ` · ${target}` : ''}{logText(l) ? <small className="muted"> · {logText(l)}</small> : null}
        {l.admin && <small className="muted"> — {l.admin}</small>}</span>
      <small>{ago(l.created_at)}</small>
    </div>
  );
}

function Log() {
  const [action, setAction] = useState('');
  const [list, setList] = useState<any[] | null>(null);
  const [more, setMore] = useState(false);
  const load = async (before?: number) => {
    const r = await call<{ log: any[] }>('admin:log', { action, before });
    if (!r.ok) return;
    setList(l => before ? [...(l ?? []), ...r.log] : r.log);
    setMore(r.log.length === 50);
  };
  useEffect(() => { setList(null); load(); }, [action]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="chips adm-chips">
        <button className={action === '' ? 'on' : ''} onClick={() => setAction('')}>Tümü</button>
        {Object.entries(ACTION_TR).map(([k, l]) => <button key={k} className={action === k ? 'on' : ''} onClick={() => setAction(k)}>{l}</button>)}
      </div>
      <div className="adm-card">
        {list === null && <div className="spinner" />}
        {list?.length === 0 && <p className="muted">Kayıt yok.</p>}
        {list?.map(l => <LogRow key={l.id} l={l} />)}
        {more && list && <button className="btn ghost small" onClick={() => load(list[list.length - 1].id)}>Daha eski</button>}
      </div>
    </>
  );
}
