// Bağlantı katmanı: arayüz `call(olay, veri)` ve `bus` olaylarını kullanır,
// bu dosya bunları Supabase (RPC + Realtime + Edge Functions) çağrılarına çevirir.
import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { meta } from './games';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://qtusjbviruqfwolbsvgx.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0dXNqYnZpcnVxZndvbGJzdmd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3NzE4OTYsImV4cCI6MjEwOTM0Nzg5Nn0.S2ncK4Ggrv90JtAOlJxwcTFXW-ziv1pa0Hg6cO3DZPE';

// ?ayri ile açılırsa oturum sekmeye özel olur (aynı tarayıcıda iki hesapla test için)
const perTab = new URLSearchParams(location.search).has('ayri');
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage: perTab ? sessionStorage : localStorage, storageKey: 'parti-auth', persistSession: true },
  realtime: { params: { eventsPerSecond: 20 } },
});

export interface ServerConfig { mode: 'supabase'; voice: boolean }
export interface Profile { id: string; username: string; avatar: string; level: number }
export interface FullProfile extends Profile { bio: string; charm: number; wealth: number; onboarded?: boolean }
export interface Wallet { diamonds: number; coins: number; canClaimDaily: boolean }
type Res<T = {}> = T & { ok: boolean; error?: string };

// ---------------------------------------------------------------- olay yolu
type Handler = (p: any) => void;
const handlers = new Map<string, Set<Handler>>();
export const bus = {
  on(ev: string, h: Handler) { if (!handlers.has(ev)) handlers.set(ev, new Set()); handlers.get(ev)!.add(h); },
  off(ev: string, h: Handler) { handlers.get(ev)?.delete(h); },
  emit(ev: string, p?: any) { handlers.get(ev)?.forEach(h => { try { h(p); } catch (e) { console.error(e); } }); },
};

// ---------------------------------------------------------------- yardımcılar
let uid = '';
export const myId = () => uid;
/** Engellediğim kullanıcılar (sunucu RLS ile de süzer; burası anlık tepki için). */
const blocked = new Set<string>();
export const isBlocked = (id?: string | null) => Boolean(id && blocked.has(id));
const REASONS: Record<string, string> = {
  insufficient: 'Yetersiz elmas 💎', self_gift: 'Kendine hediye gönderemezsin', already_claimed: 'Bugünkü ödülü zaten aldın',
  bad_qty: 'Geçersiz adet', no_gift: 'Hediye bulunamadı', no_receiver: 'Alıcı odada değil', self: 'Kendini ekleyemezsin',
  not_in_room: 'Odada değilsin',
};
const reason = (r?: string) => REASONS[r ?? ''] ?? 'İşlem başarısız';
const err = (error: string) => ({ ok: false, error });
const today = () => new Date().toISOString().slice(0, 10);

const profCache = new Map<string, Profile>();
async function profiles(ids: string[], force = false): Promise<Map<string, Profile>> {
  const need = [...new Set(ids)].filter(id => id && (force || !profCache.has(id)));
  if (need.length) {
    const { data } = await sb.from('profiles').select('id,username,avatar,level').in('id', need);
    for (const p of data ?? []) profCache.set(p.id, p as Profile);
  }
  return profCache;
}

async function rpc(fn: string, args?: Record<string, unknown>): Promise<any> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    console.error(fn, error);
    if (/forbidden/i.test(error.message)) return err('Bu işlem için yetkin yok');
    return err(/JWT|auth/i.test(error.message) ? 'Oturum süresi doldu, tekrar giriş yap' : 'Sunucu hatası');
  }
  return data;
}

async function fn(name: string, body: Record<string, unknown>): Promise<any> {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) { console.error(name, error); return err('Sunucuya ulaşılamadı'); }
  return data;
}

// ---------------------------------------------------------------- kimlik
export function loginEmail(username: string) {
  const bytes = new TextEncoder().encode(username.trim().toLocaleLowerCase('tr-TR'));
  return 'u' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('') + '@parti.local';
}

export async function loadConfig(): Promise<ServerConfig> { return { mode: 'supabase', voice: voiceEnabled }; }

export async function restoreSession(): Promise<string | null> {
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function register(username: string, password: string, avatar: string) {
  const r = await fn('register', { username, password, avatar });
  if (!r?.ok) throw new Error(r?.error || 'Kayıt başarısız');
  return login(username, password);
}

export async function login(username: string, password: string) {
  const { data, error } = await sb.auth.signInWithPassword({ email: loginEmail(username), password });
  if (error) throw new Error(/invalid/i.test(error.message) ? 'Kullanıcı adı veya şifre hatalı' : error.message);
  return data.session!.access_token;
}

// ---------------------------------------------------------------- Google / Apple / e-posta
export type OAuthProvider = 'google' | 'apple';
/** Giriş sonrası dönülecek adres (sorgu dizesi korunur, ör. ?ayri). */
const returnUrl = () => location.origin + location.pathname + location.search;

function authError(m: string) {
  if (/invalid login credentials/i.test(m)) return 'E-posta veya şifre hatalı';
  if (/already registered|already exists/i.test(m)) return 'Bu e-posta zaten kayıtlı, giriş yapmayı dene';
  if (/email not confirmed/i.test(m)) return 'Önce e-postandaki doğrulama bağlantısına tıkla';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Çok fazla deneme, biraz sonra tekrar dene';
  if (/provider is not enabled|unsupported provider/i.test(m)) return 'Bu giriş yöntemi henüz açılmadı';
  if (/password should be|weak/i.test(m)) return 'Şifre en az 6 karakter olmalı';
  if (/invalid.*email|valid email/i.test(m)) return 'Geçerli bir e-posta adresi yaz';
  return 'Giriş yapılamadı, tekrar dene';
}

/** Google / Apple: sağlayıcının sayfasına yönlendirir, dönüşte oturum otomatik açılır. */
export async function oauthLogin(provider: OAuthProvider) {
  const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: returnUrl() } });
  if (error) throw new Error(authError(error.message));
}

export async function emailLogin(email: string, password: string) {
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(authError(error.message));
  return data.session!.access_token;
}

/** E-posta ile kayıt. Doğrulama açıksa oturum gelmez → null döner (e-posta kutusunu kontrol et). */
export async function emailRegister(email: string, password: string, avatar: string): Promise<string | null> {
  const { data, error } = await sb.auth.signUp({
    email: email.trim(), password, options: { emailRedirectTo: returnUrl(), data: { avatar } },
  });
  if (error) throw new Error(authError(error.message));
  // aynı e-posta zaten kayıtlıysa Supabase kimliksiz bir kullanıcı döndürür
  if (data.user && (data.user.identities?.length ?? 0) === 0) throw new Error('Bu e-posta zaten kayıtlı, giriş yapmayı dene');
  return data.session?.access_token ?? null;
}

export async function sendPasswordReset(email: string) {
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: returnUrl() });
  if (error) throw new Error(authError(error.message));
}

export async function updatePassword(password: string) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(authError(error.message));
}

/** Şifre sıfırlama bağlantısıyla gelindiyse true (uygulama yeni şifre sorar). */
let recovering = /type=recovery/.test(location.hash);
export const isPasswordRecovery = () => recovering;
export const clearPasswordRecovery = () => { recovering = false; };

let globalChannel: RealtimeChannel | null = null;

/** Uygulama ayarları: { theme, announcement, games } */
export async function loadSettings(): Promise<Record<string, any>> {
  const { data } = await sb.from('app_settings').select('key,value');
  return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
}

/** Giriş sonrası: kullanıcıyı belirle, arkadaşlık bildirimlerini dinle. */
export async function connect(_token?: string) {
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error('no_user');
  uid = data.user.id;
  const { data: prof } = await sb.from('profiles').select('id').eq('id', uid).maybeSingle();
  if (!prof) throw new Error('no_profile');
  const { data: bl } = await sb.from('user_blocks').select('blocked');
  blocked.clear();
  for (const b of bl ?? []) blocked.add(b.blocked);
  if (globalChannel) sb.removeChannel(globalChannel);
  globalChannel = sb.channel('me-' + uid)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friendships' }, async ({ new: f }: any) => {
      if (f.addressee !== uid) return;
      const p = (await profiles([f.requester])).get(f.requester);
      bus.emit('friends:changed', { from: p, status: f.status });
    })
    // yönetim ayarları (tema, duyuru, kapalı oyunlar) anında herkese yansır
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, async () => {
      bus.emit('settings:changed', await loadSettings());
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friendships' }, async ({ new: f }: any) => {
      if (f.status !== 'accepted' || f.requester !== uid) return;
      const p = (await profiles([f.addressee])).get(f.addressee);
      bus.emit('friends:changed', { from: p, status: 'accepted' });
    })
    .subscribe();
}

export async function logout() {
  await leaveCurrentRoom();
  if (globalChannel) { sb.removeChannel(globalChannel); globalChannel = null; }
  await sb.auth.signOut();
  uid = '';
}

export function watchTokenRefresh() { /* supabase-js jetonu kendisi yeniler */ }

// ---------------------------------------------------------------- oda durumu
let voiceEnabled = false;

interface RoomCtx {
  id: string; game?: string; channel: RealtimeChannel; hb: number; rebuildTimer?: number;
  pub: any | null; hand: any[] | null; handVersion: number; skew: number; timeoutTimer?: number; endTimer?: number;
}
let cur: RoomCtx | null = null;

async function snapshot(id: string) {
  const [{ data: r }, { data: pres }, { data: gp }] = await Promise.all([
    sb.from('rooms').select('*').eq('id', id).maybeSingle(),
    sb.from('room_presence').select('user_id,last_seen,joined_at').eq('room_id', id).order('joined_at'),
    sb.from('game_public').select('players,winner').eq('room_id', id).maybeSingle(),
  ]);
  if (!r) return null;
  const alive = (pres ?? []).filter((p: any) => Date.now() - Date.parse(p.last_seen) < 75_000).map((p: any) => p.user_id);
  const seats: (string | null)[] = r.seats;
  const cache = await profiles([...alive, ...seats.filter(Boolean) as string[]]);
  const playing = Boolean(gp && !gp.winner);
  return {
    id: r.id, name: r.name, topic: r.topic, game: r.game, ownerId: r.owner_id, voice: voiceEnabled,
    online: alive.length, playing,
    seats: seats.map((u, i) => u ? { userId: u, muted: r.muted[i], profile: cache.get(u) ?? null, locked: false } : { locked: r.locked[i] }),
    members: alive.map((a: string) => cache.get(a)).filter(Boolean),
    unoPlayers: playing ? gp!.players : [],
  };
}

function scheduleRebuild(ctx: RoomCtx) {
  clearTimeout(ctx.rebuildTimer);
  ctx.rebuildTimer = window.setTimeout(async () => {
    if (cur !== ctx) return;
    const s = await snapshot(ctx.id);
    if (cur === ctx && s) bus.emit('room:state', s);
  }, 120);
}

/** Odanın oyununa göre hakem Edge Function'ı (games.ts). */
const refereeFor = (game?: string) => meta(game).referee ?? 'game';

/**
 * Oyun durumunu ekrana yayar. Uno: 'uno:state' (eski biçim). Diğer tüm oyunlar: 'game:state' →
 * herkese açık görünüm + `mine` (yalnızca bana ait gizli bilgi: el, kelime…).
 */
function emitUno(ctx: RoomCtx) {
  if (cur !== ctx || !ctx.game) return;
  clearTimeout(ctx.timeoutTimer);
  const gp = ctx.pub;
  const ev = ctx.game === 'uno' ? 'uno:state' : 'game:state';
  if (!gp || (gp.winner && Date.now() - Date.parse(gp.updated_at) > 12_000)) { bus.emit(ev, null); return; }
  const deadline = Date.parse(gp.deadline) + ctx.skew;
  if (ctx.game !== 'uno') {
    const inGame = gp.players.includes(uid);
    const mine = inGame ? (ctx.hand ?? null) : null;
    const syncing = inGame && ctx.hand !== null && ctx.handVersion !== gp.version;
    bus.emit(ev, { ...gp.view, game: ctx.game, mine, syncing, version: gp.version, deadline, serverNow: Date.now() });
    scheduleGameTimers(ctx, gp, deadline);
    return;
  }
  const mine = gp.players.includes(uid) ? (ctx.hand ?? []) : null;
  // elim herkese açık durumdan geride ise (realtime sırası) bir anlığına hamle yaptırma
  const syncing = mine !== null && ctx.handVersion !== gp.version;
  bus.emit(ev, { ...gp.view, myHand: mine, syncing, deadline, serverNow: Date.now() });
  scheduleGameTimers(ctx, gp, deadline);
}

function scheduleGameTimers(ctx: RoomCtx, gp: any, deadline: number) {
  if (gp.winner) {
    clearTimeout(ctx.endTimer);
    ctx.endTimer = window.setTimeout(() => { emitUno(ctx); scheduleRebuild(ctx); }, 12_500);
  } else {
    // süre dolarsa odadaki herhangi biri hakemden otomatik hamle ister
    const wait = Math.max(0, deadline - Date.now()) + 1200 + Math.random() * 1500;
    ctx.timeoutTimer = window.setTimeout(() => { if (cur === ctx) fn(refereeFor(ctx.game), { room: ctx.id, action: 'timeout' }); }, wait);
  }
}

async function joinRoom(id: string) {
  await leaveCurrentRoom(id);
  const j = await rpc('join_room', { p_room: id });
  if (!j?.ok) return err(j?.error || 'Odaya girilemedi');

  const ctx: RoomCtx = { id, channel: null as any, hb: 0, pub: null, hand: null, handVersion: -1, skew: 0 };
  cur = ctx;
  const toMsg = async (m: any) => {
    const ids = [m.user_id, m.meta?.to].filter(Boolean);
    const cache = await profiles(ids);
    return { id: m.id, from: m.user_id ? cache.get(m.user_id) ?? null : null, text: m.text, kind: m.kind, at: Date.parse(m.created_at), meta: m.meta };
  };
  ctx.channel = sb.channel('room-' + id)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${id}` }, () => scheduleRebuild(ctx))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${id}` }, async ({ new: m }: any) => {
      if (cur !== ctx) return;
      if (m.kind === 'system' && m.meta?.kicked === uid) { bus.emit('room:kicked', 'Oda sahibi seni odadan attı'); return; }
      if (m.kind === 'chat' && blocked.has(m.user_id)) return;
      const msg = await toMsg(m);
      bus.emit('chat:msg', msg);
      if (m.kind === 'system') scheduleRebuild(ctx);
      if (m.kind === 'gift' && m.meta) {
        const to = profCache.get(m.meta.to);
        bus.emit('gift:fx', { from: msg.from, to, icon: m.meta.icon, name: m.meta.name, tier: m.meta.tier, qty: m.meta.qty, total: m.meta.total });
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_public', filter: `room_id=eq.${id}` }, ({ new: gp }: any) => {
      if (cur !== ctx || !gp?.room_id) return;
      ctx.skew = Date.now() - Date.parse(gp.updated_at);
      if (Math.abs(ctx.skew) < 1500) ctx.skew = 0; // gecikmeyi saat farkı sanma
      const wasPlaying = ctx.pub && !ctx.pub.winner;
      ctx.pub = gp;
      emitUno(ctx);
      if (!wasPlaying || gp.winner) scheduleRebuild(ctx);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_hands', filter: `room_id=eq.${id}` }, ({ new: h }: any) => {
      if (cur !== ctx || !h || h.user_id !== uid) return;
      ctx.hand = h.hand; ctx.handVersion = h.version;
      emitUno(ctx);
    })
    // Çiz-Tahmin: çizim çizgileri veritabanına yazılmadan oyuncular arasında akar
    .on('broadcast', { event: 'draw' }, ({ payload }: any) => { if (cur === ctx && payload) bus.emit('draw:stroke', payload); })
    .subscribe((status) => { if (status === 'SUBSCRIBED' && cur === ctx) scheduleRebuild(ctx); });

  ctx.hb = window.setInterval(async () => {
    if (cur !== ctx) return;
    const h = await rpc('heartbeat', { p_room: id });
    if (h && h.ok === false && cur === ctx) {
      const j = await rpc('join_room', { p_room: id });
      if (cur !== ctx) return;
      if (j?.kicked || j?.banned) { bus.emit('room:kicked', j.error); return; }
      scheduleRebuild(ctx);
    }
  }, 20_000);

  const [snap, { data: msgs }, { data: gp }, { data: hand }] = await Promise.all([
    snapshot(id),
    sb.from('room_messages').select('*').eq('room_id', id).order('id', { ascending: false }).limit(40),
    sb.from('game_public').select('*').eq('room_id', id).maybeSingle(),
    sb.from('game_hands').select('hand,version').eq('room_id', id).eq('user_id', uid).maybeSingle(),
  ]);
  const chat = await Promise.all((msgs ?? []).filter((m: any) => !(m.kind === 'chat' && blocked.has(m.user_id))).reverse().map(toMsg));
  ctx.game = snap?.game;
  ctx.pub = gp; ctx.hand = hand?.hand ?? null; ctx.handVersion = hand?.version ?? -1;
  setTimeout(() => emitUno(ctx), 0);
  return { ok: true, room: snap, chat };
}

async function leaveCurrentRoom(nextId?: string) {
  const ctx = cur;
  if (!ctx) return;
  cur = null;
  clearInterval(ctx.hb); clearTimeout(ctx.timeoutTimer); clearTimeout(ctx.endTimer); clearTimeout(ctx.rebuildTimer);
  sb.removeChannel(ctx.channel);
  if (ctx.id !== nextId) await rpc('leave_room', { p_room: ctx.id });
}

// sekme kapanırken odadan çık (en iyi çaba)
window.addEventListener('pagehide', () => {
  if (!cur) return;
  const token = (sb as any).auth?.session?.access_token;
  fetch(`${SUPABASE_URL}/rest/v1/rpc/leave_room`, {
    method: 'POST', keepalive: true,
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${token ?? SUPABASE_KEY}` },
    body: JSON.stringify({ p_room: cur.id }),
  }).catch(() => {});
});
sb.auth.onAuthStateChange((e, s) => {
  (sb as any).auth.session = s;
  if (e === 'PASSWORD_RECOVERY') { recovering = true; bus.emit('auth:recovery'); }
});

// ---------------------------------------------------------------- tek API
export async function call<T = any>(event: string, p: any = {}): Promise<Res<T>> {
  try { return await handle(event, p ?? {}) as Res<T>; }
  catch (e) { console.error(event, e); return err('Bağlantı hatası') as Res<T>; }
}

async function handle(event: string, p: any): Promise<any> {
  const room = cur?.id;
  void room;
  switch (event) {
    case 'me:get': {
      const [{ data: profile }, { data: w }] = await Promise.all([
        sb.from('profiles').select('*').eq('id', uid).single(),
        sb.from('wallets').select('*').eq('user_id', uid).single(),
      ]);
      if (!profile) return err('Profil yok');
      profCache.set(uid, profile);
      return {
        ok: true, profile, mode: 'supabase', voice: voiceEnabled,
        wallet: { diamonds: Number(w?.diamonds ?? 0), coins: Number(w?.coins ?? 0), canClaimDaily: !w?.last_daily || w.last_daily < today() },
      };
    }
    case 'lobby:list': {
      const rooms = await rpc('lobby_rooms');
      return Array.isArray(rooms) ? { ok: true, rooms } : rooms;
    }
    case 'room:create': return rpc('create_room', { p_name: p.name, p_game: p.game, p_topic: p.topic ?? '' });
    case 'room:join': return joinRoom(String(p.roomId));
    case 'room:leave': await leaveCurrentRoom(); return { ok: true };
    case 'seat:take': return room ? rpc('take_seat', { p_room: room, p_index: p.index }) : err('Odada değilsin');
    case 'seat:leave': return room ? rpc('leave_seat', { p_room: room }) : err('Odada değilsin');
    case 'seat:mute': return room ? rpc('set_mute', { p_room: room, p_muted: Boolean(p.muted) }) : err('Odada değilsin');
    case 'seat:lock': return room ? rpc('toggle_lock', { p_room: room, p_index: p.index }) : err('Odada değilsin');
    case 'seat:kick': return room ? rpc('kick_seat', { p_room: room, p_user: p.userId }) : err('Odada değilsin');
    case 'chat:send': return room ? rpc('send_chat', { p_room: room, p_text: p.text }) : err('Odada değilsin');
    case 'gift:send': {
      if (!room) return err('Odada değilsin');
      const r = await rpc('room_gift', { p_room: room, p_receiver: p.to, p_gift: p.giftId, p_qty: p.qty });
      return r?.ok ? { ok: true, diamonds: r.diamonds } : err(r?.error ?? reason(r?.reason));
    }
    case 'gifts:list': {
      const { data } = await sb.from('gifts').select('id,name,icon,price,tier').order('sort');
      return { ok: true, gifts: data ?? [] };
    }
    case 'daily:claim': {
      const r = await rpc('claim_daily');
      return r?.ok ? r : err(r?.error ?? reason(r?.reason));
    }
    case 'profile:get': {
      const { data } = await sb.from('profiles').select('id,username,avatar,level,bio,charm,wealth').eq('id', p.id).maybeSingle();
      return data ? { ok: true, profile: data, blocked: blocked.has(data.id) } : err('Profil bulunamadı');
    }
    case 'status:get': {
      const r = await rpc('my_status');
      return r && !r.error ? { ok: true, admin: Boolean(r.admin), bannedUntil: r.banned_until, banReason: r.ban_reason } : err('Durum alınamadı');
    }
    case 'settings:get': return { ok: true, settings: await loadSettings() };
    // ---- yönetim paneli (sunucuda _is_admin() ile korunur)
    case 'admin:stats': { const r = await rpc('admin_stats'); return r?.error ? r : { ok: true, stats: r }; }
    case 'admin:users': { const r = await rpc('admin_users', { p_q: p.q ?? '', p_filter: p.filter ?? 'all' }); return Array.isArray(r) ? { ok: true, users: r } : r; }
    case 'admin:grant': return rpc('admin_grant', { p_user: p.id, p_diamonds: Math.trunc(Number(p.diamonds) || 0), p_coins: Math.trunc(Number(p.coins) || 0) });
    case 'admin:ban': return rpc('admin_ban', { p_user: p.id, p_minutes: Math.trunc(Number(p.minutes) || 0), p_reason: p.reason ?? '' });
    case 'admin:rooms': { const r = await rpc('admin_rooms'); return Array.isArray(r) ? { ok: true, rooms: r } : r; }
    case 'admin:closeRoom': return rpc('admin_close_room', { p_room: p.id });
    case 'admin:createRoom': return rpc('admin_create_room', { p_name: p.name, p_game: p.game, p_topic: p.topic ?? '' });
    case 'admin:reports': { const r = await rpc('admin_reports', { p_status: p.status ?? 'open' }); return Array.isArray(r) ? { ok: true, reports: r } : r; }
    case 'admin:resolve': return rpc('admin_resolve_report', { p_id: p.id, p_status: p.status });
    case 'admin:setSetting': return rpc('admin_set_setting', { p_key: p.key, p_value: p.value });
    case 'admin:log': { const r = await rpc('admin_log_list'); return Array.isArray(r) ? { ok: true, log: r } : r; }
    case 'profile:onboard': {
      const r = await rpc('complete_onboarding', { p_username: String(p.username ?? '').trim(), p_avatar: p.avatar });
      if (r?.ok) await profiles([uid], true);
      return r?.ok ? r : err(r?.error ?? 'Profil kaydedilemedi');
    }
    case 'profile:update': {
      const patch: any = {};
      if (typeof p.username === 'string') {
        const u = p.username.trim();
        if (!/^[\p{L}\p{N}_]{3,20}$/u.test(u)) return err('Kullanıcı adı 3-20 harf/rakam olmalı');
        patch.username = u;
      }
      if (typeof p.avatar === 'string') patch.avatar = p.avatar;
      if (typeof p.bio === 'string') patch.bio = p.bio.slice(0, 120);
      const { error } = await sb.from('profiles').update(patch).eq('id', uid);
      if (error) return err(error.code === '23505' ? 'Bu kullanıcı adı alınmış' : 'Profil güncellenemedi');
      await profiles([uid], true);
      if (cur) scheduleRebuild(cur);
      return { ok: true };
    }
    case 'friends:list': {
      const { data } = await sb.from('friendships').select('requester,addressee,status');
      const rows = data ?? [];
      const other = (f: any) => f.requester === uid ? f.addressee : f.requester;
      const cache = await profiles(rows.map(other), true);
      const accepted = rows.filter(f => f.status === 'accepted').map(other);
      const { data: pres } = accepted.length
        ? await sb.from('room_presence').select('user_id,room_id,last_seen,rooms(name)').in('user_id', accepted)
        : { data: [] as any[] };
      const where = new Map((pres ?? []).filter((x: any) => Date.now() - Date.parse(x.last_seen) < 75_000)
        .map((x: any) => [x.user_id, { roomId: x.room_id, roomName: x.rooms?.name ?? 'Oda' }]));
      return {
        ok: true,
        friends: accepted.map(id => ({ ...cache.get(id)!, online: where.has(id), room: where.get(id) ?? null })).filter(f => f.id),
        incoming: rows.filter(f => f.status === 'pending' && f.addressee === uid).map(f => cache.get(f.requester)).filter(Boolean),
        outgoing: rows.filter(f => f.status === 'pending' && f.requester === uid).map(f => cache.get(f.addressee)).filter(Boolean),
      };
    }
    case 'friend:request': {
      const r = await rpc('send_friend_request', { p_target: p.id });
      return r?.ok ? r : err(r?.error ?? reason(r?.reason));
    }
    case 'friend:respond': {
      const r = await rpc('respond_friend_request', { p_requester: p.id, p_accept: Boolean(p.accept) });
      return r?.ok ? r : err('İstek bulunamadı');
    }
    case 'friend:remove': {
      await sb.from('friendships').delete().or(`and(requester.eq.${uid},addressee.eq.${p.id}),and(requester.eq.${p.id},addressee.eq.${uid})`);
      return { ok: true };
    }
    case 'user:block': {
      const r = await rpc('block_user', { p_target: p.id });
      if (r?.ok) { blocked.add(p.id); bus.emit('block:changed', { id: p.id, blocked: true }); }
      return r?.ok ? r : err(r?.error ?? 'Engellenemedi');
    }
    case 'user:unblock': {
      const r = await rpc('unblock_user', { p_target: p.id });
      if (r?.ok) { blocked.delete(p.id); bus.emit('block:changed', { id: p.id, blocked: false }); }
      return r?.ok ? r : err(r?.error ?? 'Engel kaldırılamadı');
    }
    case 'user:report': {
      const r = await rpc('report_user', { p_target: p.id, p_reason: p.reason, p_details: p.details ?? '', p_room: room ?? null });
      return r?.ok ? r : err(r?.error ?? 'Şikayet gönderilemedi');
    }
    case 'room:kick': return room ? rpc('kick_from_room', { p_room: room, p_user: p.userId }) : err('Odada değilsin');
    case 'user:search': {
      const q = String(p.q ?? '').replace(/[%_,()*]/g, '').slice(0, 20);
      if (q.length < 2) return { ok: true, users: [] };
      const { data } = await sb.from('profiles').select('id,username,avatar,level').ilike('username', `%${q}%`).limit(20);
      return { ok: true, users: data ?? [] };
    }
    case 'uno:start': return room ? fn('game', { room, action: 'start' }) : err('Odada değilsin');
    case 'uno:action': return room ? fn('game', { room, move: p }) : err('Odada değilsin');
    case 'ludo:start': return room ? fn('ludo', { room, action: 'start' }) : err('Odada değilsin');
    case 'game:start': return cur ? fn(refereeFor(cur.game), { room: cur.id, action: 'start' }) : err('Odada değilsin');
    case 'game:move': return cur ? fn(refereeFor(cur.game), { room: cur.id, move: p }) : err('Odada değilsin');
    case 'draw:send': {
      if (!cur) return err('Odada değilsin');
      cur.channel.send({ type: 'broadcast', event: 'draw', payload: { ...p, from: uid } });
      return { ok: true };
    }
    case 'ludo:roll': return room ? fn('ludo', { room, move: { type: 'roll' } }) : err('Odada değilsin');
    case 'ludo:move': return room ? fn('ludo', { room, move: { type: 'move', token: Number(p.token) } }) : err('Odada değilsin');
    case 'voice:token': {
      if (!room) return err('Odada değilsin');
      const r = await fn('voice', { room });
      const enabled = Boolean(r?.ok && !r.disabled);
      if (enabled !== voiceEnabled) { voiceEnabled = enabled; if (cur) scheduleRebuild(cur); }
      return r;
    }
  }
  return err('Bilinmeyen işlem');
}
