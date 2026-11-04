import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Server, Socket } from 'socket.io';
import { supabaseStore, demoStore, Profile } from './store';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import * as Uno from './uno';

// ---------------------------------------------------------------- ayarlar
const PORT = Number(process.env.PORT || 3001);
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const DEMO = process.env.DEMO_MODE === '1' || !SUPABASE_URL || !SUPABASE_ANON_KEY;
const store = DEMO ? demoStore() : supabaseStore(SUPABASE_URL, SUPABASE_ANON_KEY);
const LK_URL = process.env.LIVEKIT_URL || '';
const LK_KEY = process.env.LIVEKIT_API_KEY || '';
const LK_SECRET = process.env.LIVEKIT_API_SECRET || '';
const VOICE = Boolean(LK_URL && LK_KEY && LK_SECRET);
const SEATS = 9;
const TURN_MS = 25_000;
const STATIC_DIR = process.env.STATIC_DIR || path.resolve(__dirname, '../../client/dist');

const lkRooms = VOICE ? new RoomServiceClient(LK_URL.replace(/^wss?:/, 'https:'), LK_KEY, LK_SECRET) : null;

// ---------------------------------------------------------------- tipler
interface Member { profile: Profile; sockets: Set<string> }
interface Seat { userId: string; muted: boolean }
interface ChatMsg { id: number; from: Profile | null; text: string; kind: 'chat' | 'system' | 'gift'; at: number }
interface UnoSession { state: Uno.UnoState; deadline: number; timer: NodeJS.Timeout | null }
interface Room {
  id: string; name: string; topic: string; game: 'uno' | 'chat'; ownerId: string | null; permanent: boolean;
  seats: (Seat | null)[]; locked: boolean[]; members: Map<string, Member>;
  chat: ChatMsg[]; uno: UnoSession | null; emptySince: number | null; createdAt: number;
}

const rooms = new Map<string, Room>();
let msgSeq = 1;

function makeRoom(name: string, topic: string, game: Room['game'], ownerId: string | null, permanent = false, id?: string): Room {
  const room: Room = {
    id: id || Math.random().toString(36).slice(2, 8), name, topic, game, ownerId, permanent,
    seats: Array(SEATS).fill(null), locked: Array(SEATS).fill(false), members: new Map(),
    chat: [], uno: null, emptySince: permanent ? null : Date.now(), createdAt: Date.now(),
  };
  rooms.set(room.id, room);
  return room;
}
makeRoom('🎴 Uno Masası', 'Herkese açık Uno, gel otur!', 'uno', null, true, 'uno1');
makeRoom('☕ Sohbet Kafe', 'Tanışma ve muhabbet', 'chat', null, true, 'kafe');

// ---------------------------------------------------------------- yardımcılar
const io = new Server({ cors: { origin: '*' }, pingInterval: 10_000 });

function roomSummary(r: Room) {
  const owner = r.ownerId ? r.members.get(r.ownerId)?.profile : null;
  return {
    id: r.id, name: r.name, topic: r.topic, game: r.game, online: r.members.size,
    seated: r.seats.filter(Boolean).length, playing: Boolean(r.uno && !r.uno.state.winner),
    owner: owner ? { username: owner.username, avatar: owner.avatar } : null,
  };
}

function roomSnapshot(r: Room) {
  return {
    ...roomSummary(r), ownerId: r.ownerId, voice: VOICE,
    seats: r.seats.map((s, i) => s ? { ...s, profile: r.members.get(s.userId)?.profile ?? null, locked: false } : { locked: r.locked[i] }),
    members: [...r.members.values()].map(m => m.profile),
    unoPlayers: r.uno && !r.uno.state.winner ? r.uno.state.players : [],
  };
}

const pushRoom = (r: Room) => io.to(r.id).emit('room:state', roomSnapshot(r));

function pushUno(r: Room) {
  if (!r.uno) { io.to(r.id).emit('uno:state', null); return; }
  const base = { deadline: r.uno.deadline, serverNow: Date.now() };
  for (const sid of io.sockets.adapter.rooms.get(r.id) ?? []) {
    const s = io.sockets.sockets.get(sid);
    if (!s) continue;
    s.emit('uno:state', { ...Uno.viewFor(r.uno.state, s.data.user.id), ...base });
  }
}

function addChat(r: Room, m: Omit<ChatMsg, 'id' | 'at'>) {
  const msg = { ...m, id: msgSeq++, at: Date.now() };
  r.chat.push(msg);
  if (r.chat.length > 60) r.chat.shift();
  io.to(r.id).emit('chat:msg', msg);
}

async function setVoicePermission(r: Room, userId: string, canPublish: boolean) {
  if (!lkRooms) return;
  try {
    await lkRooms.updateParticipant(r.id, userId, undefined, { canPublish, canSubscribe: true, canPublishData: true });
  } catch { /* katılımcı henüz sese bağlı değil */ }
}

function seatOf(r: Room, userId: string) { return r.seats.findIndex(s => s?.userId === userId); }

function leaveSeat(r: Room, userId: string) {
  const i = seatOf(r, userId);
  if (i >= 0) { r.seats[i] = null; setVoicePermission(r, userId, false); }
  if (r.uno && !r.uno.state.winner && r.uno.state.players.includes(userId)) {
    const wasTurn = Uno.current(r.uno.state) === userId;
    Uno.removePlayer(r.uno.state, userId);
    if (wasTurn) armTimer(r);
    afterUnoChange(r);
  }
}

// ---------------------------------------------------------------- Uno akışı
function armTimer(r: Room) {
  const u = r.uno;
  if (!u) return;
  if (u.timer) clearTimeout(u.timer);
  if (u.state.winner) { u.timer = null; return; }
  u.deadline = Date.now() + TURN_MS;
  const turnAt = { player: Uno.current(u.state), drew: u.state.drewThisTurn };
  u.timer = setTimeout(() => {
    if (r.uno !== u || u.state.winner) return;
    try { Uno.autoMove(u.state); } catch { /* yoksay */ }
    const p = r.members.get(turnAt.player)?.profile;
    if (p) addChat(r, { from: null, text: `⏰ ${p.username} süresi doldu, otomatik kart çekildi`, kind: 'system' });
    armTimer(r);
    afterUnoChange(r);
  }, TURN_MS);
}

function afterUnoChange(r: Room) {
  const u = r.uno;
  if (!u) return;
  if (u.state.winner) {
    if (u.timer) clearTimeout(u.timer);
    u.timer = null;
    const w = r.members.get(u.state.winner)?.profile;
    addChat(r, { from: null, text: `🏆 ${w?.username ?? 'Bir oyuncu'} Uno'yu kazandı!`, kind: 'system' });
    const ended = u;
    setTimeout(() => { if (r.uno === ended) { r.uno = null; pushUno(r); pushRoom(r); } }, 10_000);
  }
  pushUno(r);
  pushRoom(r);
}

// ---------------------------------------------------------------- kimlik doğrulama
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token || typeof token !== 'string') return next(new Error('unauthorized'));
  try {
    const prof = await store.authenticate(token);
    if (!prof) return next(new Error('unauthorized'));
    socket.data.user = prof;
    socket.data.token = token;
    socket.data.roomId = null as string | null;
    next();
  } catch (e) { next(new Error('auth_failed')); }
});

// ---------------------------------------------------------------- olaylar
type Ack = (res: any) => void;
const ok = (cb: Ack | undefined, data: any = {}) => typeof cb === 'function' && cb({ ok: true, ...data });
const fail = (cb: Ack | undefined, error: string) => typeof cb === 'function' && cb({ ok: false, error });

function currentRoom(s: Socket): Room | null {
  return s.data.roomId ? rooms.get(s.data.roomId) ?? null : null;
}

function leaveRoom(s: Socket) {
  const r = currentRoom(s);
  if (!r) return;
  const uid = s.data.user.id;
  s.leave(r.id);
  s.data.roomId = null;
  const m = r.members.get(uid);
  if (!m) return;
  m.sockets.delete(s.id);
  if (m.sockets.size > 0) return; // aynı kullanıcı başka sekmede hâlâ odada
  leaveSeat(r, uid);
  r.members.delete(uid);
  addChat(r, { from: null, text: `${m.profile.username} odadan ayrıldı`, kind: 'system' });
  if (r.ownerId === uid && !r.permanent) {
    // sahiplik oturan veya kalan ilk kişiye geçer
    const next = r.seats.find(Boolean)?.userId ?? r.members.keys().next().value ?? null;
    r.ownerId = next;
  }
  if (r.members.size === 0) r.emptySince = Date.now();
  pushRoom(r);
}

io.on('connection', (s) => {
  const me = () => s.data.user as Profile;

  s.on('lobby:list', (cb: Ack) => {
    const list = [...rooms.values()]
      .sort((a, b) => b.members.size - a.members.size || a.createdAt - b.createdAt)
      .map(roomSummary);
    ok(cb, { rooms: list, voice: VOICE });
  });

  s.on('room:create', (p: { name?: string; topic?: string; game?: string }, cb: Ack) => {
    const name = String(p?.name ?? '').trim().slice(0, 30);
    if (name.length < 2) return fail(cb, 'Oda adı en az 2 karakter olmalı');
    const game = p?.game === 'chat' ? 'chat' : 'uno';
    const r = makeRoom(name, String(p?.topic ?? '').slice(0, 60), game, me().id);
    ok(cb, { roomId: r.id });
  });

  s.on('room:join', (p: { roomId: string }, cb: Ack) => {
    const r = rooms.get(String(p?.roomId));
    if (!r) return fail(cb, 'Oda bulunamadı');
    if (currentRoom(s)?.id !== r.id) leaveRoom(s);
    s.join(r.id);
    s.data.roomId = r.id;
    const uid = me().id;
    const existing = r.members.get(uid);
    if (existing) existing.sockets.add(s.id);
    else {
      r.members.set(uid, { profile: me(), sockets: new Set([s.id]) });
      addChat(r, { from: null, text: `${me().username} odaya katıldı 👋`, kind: 'system' });
    }
    if (!r.ownerId && !r.permanent) r.ownerId = uid;
    r.emptySince = null;
    ok(cb, { room: roomSnapshot(r), chat: r.chat });
    pushRoom(r);
    if (r.uno) s.emit('uno:state', { ...Uno.viewFor(r.uno.state, uid), deadline: r.uno.deadline, serverNow: Date.now() });
  });

  s.on('room:leave', (cb?: Ack) => { leaveRoom(s); ok(cb); });

  s.on('seat:take', (p: { index: number }, cb: Ack) => {
    const r = currentRoom(s);
    if (!r) return fail(cb, 'Odada değilsin');
    const i = Number(p?.index);
    if (!Number.isInteger(i) || i < 0 || i >= SEATS) return fail(cb, 'Geçersiz koltuk');
    if (r.seats[i]) return fail(cb, 'Koltuk dolu');
    if (r.locked[i] && r.ownerId !== me().id) return fail(cb, 'Koltuk kilitli');
    if (r.uno && !r.uno.state.winner && r.uno.state.players.includes(me().id)) return fail(cb, 'Oyun sürerken koltuk değiştiremezsin');
    const prev = seatOf(r, me().id);
    if (prev >= 0) r.seats[prev] = null;
    r.seats[i] = { userId: me().id, muted: false };
    setVoicePermission(r, me().id, true);
    ok(cb);
    pushRoom(r);
  });

  s.on('seat:leave', (cb?: Ack) => {
    const r = currentRoom(s);
    if (!r) return fail(cb, 'Odada değilsin');
    leaveSeat(r, me().id);
    ok(cb);
    pushRoom(r);
  });

  s.on('seat:mute', (p: { muted: boolean }, cb?: Ack) => {
    const r = currentRoom(s);
    const i = r ? seatOf(r, me().id) : -1;
    if (!r || i < 0) return fail(cb, 'Koltukta değilsin');
    r.seats[i]!.muted = Boolean(p?.muted);
    ok(cb);
    pushRoom(r);
  });

  s.on('seat:lock', (p: { index: number }, cb?: Ack) => {
    const r = currentRoom(s);
    if (!r || r.ownerId !== me().id) return fail(cb, 'Sadece oda sahibi');
    const i = Number(p?.index);
    if (!Number.isInteger(i) || i < 0 || i >= SEATS || r.seats[i]) return fail(cb, 'Geçersiz koltuk');
    r.locked[i] = !r.locked[i];
    ok(cb);
    pushRoom(r);
  });

  s.on('seat:kick', (p: { userId: string }, cb?: Ack) => {
    const r = currentRoom(s);
    if (!r || r.ownerId !== me().id) return fail(cb, 'Sadece oda sahibi');
    if (p?.userId === me().id) return fail(cb, 'Kendini indiremezsin');
    leaveSeat(r, String(p?.userId));
    ok(cb);
    pushRoom(r);
  });

  s.on('chat:send', (p: { text: string }, cb?: Ack) => {
    const r = currentRoom(s);
    const text = String(p?.text ?? '').trim().slice(0, 200);
    if (!r || !text) return fail(cb, 'Boş mesaj');
    const now = Date.now();
    if (now - (s.data.lastChat ?? 0) < 700) return fail(cb, 'Çok hızlı');
    s.data.lastChat = now;
    addChat(r, { from: me(), text, kind: 'chat' });
    ok(cb);
  });

  s.on('gift:send', async (p: { to: string; giftId: string; qty: number }, cb: Ack) => {
    const r = currentRoom(s);
    if (!r) return fail(cb, 'Odada değilsin');
    const to = r.members.get(String(p?.to));
    if (!to) return fail(cb, 'Alıcı odada değil');
    const qty = Math.max(1, Math.min(999, Math.floor(Number(p?.qty) || 1)));
    const data = await store.sendGift(s.data.token, me().id, to.profile.id, String(p?.giftId), qty, r.id);
    if (!data.ok) return fail(cb, data.error);
    const fx = { from: me(), to: to.profile, icon: data.icon, name: data.name, tier: data.tier, qty, total: data.total };
    io.to(r.id).emit('gift:fx', fx);
    addChat(r, { from: me(), text: `${to.profile.username} kişisine ${qty}× ${data.icon} ${data.name} gönderdi`, kind: 'gift' });
    ok(cb, { diamonds: data.diamonds });
  });

  s.on('token:refresh', (p: { token: string }) => {
    if (typeof p?.token === 'string' && p.token.length > 20) s.data.token = p.token;
  });

  // ---- Profil / cüzdan / arkadaşlar (istemci tek API olarak sunucuyu kullanır)
  const tok = () => s.data.token as string;
  const guard = (fn: (p: any) => Promise<any>) => async (p: any, cb?: Ack) => {
    if (typeof p === 'function') { cb = p; p = {}; }
    try { const r = await fn(p ?? {}); typeof cb === 'function' && cb(r && 'ok' in r ? r : { ok: true, ...r }); }
    catch (e) { console.error(e); fail(cb, 'Sunucu hatası'); }
  };
  s.on('me:get', guard(async () => ({ ...(await store.me(tok(), me().id)), mode: store.mode, voice: VOICE })));
  s.on('gifts:list', guard(async () => ({ gifts: await store.gifts(tok()) })));
  s.on('daily:claim', guard(() => store.claimDaily(tok(), me().id)));
  s.on('profile:get', guard(async (p) => {
    const prof = await store.profile(tok(), String(p.id));
    return prof ? { ok: true, profile: prof } : { ok: false, error: 'Profil bulunamadı' };
  }));
  s.on('profile:update', guard(async (p) => {
    const patch: any = {};
    if (typeof p.username === 'string') {
      const u = p.username.trim();
      if (!/^[\p{L}\p{N}_]{3,20}$/u.test(u)) return { ok: false, error: 'Kullanıcı adı 3-20 harf/rakam olmalı' };
      patch.username = u;
    }
    if (typeof p.avatar === 'string' && [...p.avatar].length <= 4) patch.avatar = p.avatar;
    if (typeof p.bio === 'string') patch.bio = p.bio.slice(0, 120);
    const res = await store.updateProfile(tok(), me().id, patch);
    if (res.ok) {
      const fresh = await store.profile(tok(), me().id);
      if (fresh) {
        const pub = { id: fresh.id, username: fresh.username, avatar: fresh.avatar, level: fresh.level };
        for (const sock of io.sockets.sockets.values()) if (sock.data.user?.id === pub.id) sock.data.user = pub;
        for (const r of rooms.values()) { const m = r.members.get(pub.id); if (m) { m.profile = pub; pushRoom(r); } }
      }
    }
    return res;
  }));
  s.on('friends:list', guard(async () => {
    const f = await store.friends(tok(), me().id);
    // çevrimiçi durum + bulunduğu oda
    const where = new Map<string, { roomId: string; roomName: string }>();
    for (const r of rooms.values()) for (const id of r.members.keys()) where.set(id, { roomId: r.id, roomName: r.name });
    const online = new Set([...io.sockets.sockets.values()].map(x => x.data.user?.id));
    return { ...f, friends: f.friends.map(x => ({ ...x, online: online.has(x.id), room: where.get(x.id) ?? null })) };
  }));
  s.on('friend:request', guard(async (p) => {
    const res = await store.friendRequest(tok(), me().id, String(p.id));
    if (res.ok) for (const sock of io.sockets.sockets.values()) if (sock.data.user?.id === p.id) sock.emit('friends:changed', { from: me(), status: res.status });
    return res;
  }));
  s.on('friend:respond', guard(async (p) => {
    const res = await store.friendRespond(tok(), me().id, String(p.id), Boolean(p.accept));
    if (res.ok) for (const sock of io.sockets.sockets.values()) if (sock.data.user?.id === p.id) sock.emit('friends:changed', { from: me(), status: p.accept ? 'accepted' : 'declined' });
    return res;
  }));
  s.on('friend:remove', guard((p) => store.unfriend(tok(), me().id, String(p.id))));
  s.on('user:search', guard(async (p) => ({ users: await store.search(tok(), String(p.q ?? '')) })));

  // ---- Uno
  s.on('uno:start', (cb: Ack) => {
    const r = currentRoom(s);
    if (!r || r.game !== 'uno') return fail(cb, 'Bu oda Uno odası değil');
    if (r.uno && !r.uno.state.winner) return fail(cb, 'Oyun zaten sürüyor');
    if (seatOf(r, me().id) < 0) return fail(cb, 'Başlatmak için koltuğa otur');
    if (r.ownerId && r.ownerId !== me().id) return fail(cb, 'Oyunu oda sahibi başlatır');
    const players = r.seats.filter(Boolean).map(x => x!.userId).slice(0, 6);
    if (players.length < 2) return fail(cb, 'En az 2 oturan oyuncu gerekli');
    if (r.uno?.timer) clearTimeout(r.uno.timer);
    r.uno = { state: Uno.newGame(players), deadline: 0, timer: null };
    addChat(r, { from: null, text: `🎴 Uno başladı! (${players.length} oyuncu)`, kind: 'system' });
    armTimer(r);
    ok(cb);
    afterUnoChange(r);
  });

  s.on('uno:action', (a: Uno.UnoAction, cb: Ack) => {
    const r = currentRoom(s);
    if (!r?.uno) return fail(cb, 'Oyun yok');
    const before = Uno.current(r.uno.state);
    const beforeDrew = r.uno.state.drewThisTurn;
    try { Uno.apply(r.uno.state, me().id, a); }
    catch (e) { return fail(cb, e instanceof Uno.UnoError ? e.message : 'Geçersiz hamle'); }
    if (Uno.current(r.uno.state) !== before || r.uno.state.drewThisTurn !== beforeDrew) armTimer(r);
    if (a.type === 'catch') {
      const t = r.members.get(a.target)?.profile;
      addChat(r, { from: null, text: `🚨 ${me().username}, ${t?.username} UNO demeden yakaladı! +2 kart`, kind: 'system' });
    }
    ok(cb);
    afterUnoChange(r);
  });

  // ---- Ses (LiveKit)
  s.on('voice:token', async (cb: Ack) => {
    const r = currentRoom(s);
    if (!r) return fail(cb, 'Odada değilsin');
    if (!VOICE) return ok(cb, { disabled: true });
    const at = new AccessToken(LK_KEY, LK_SECRET, { identity: me().id, name: me().username, ttl: '6h' });
    at.addGrant({ room: r.id, roomJoin: true, canSubscribe: true, canPublish: seatOf(r, me().id) >= 0, canPublishData: true });
    ok(cb, { url: LK_URL, token: await at.toJwt() });
  });

  s.on('disconnect', () => leaveRoom(s));
});

// boş odaları temizle
setInterval(() => {
  for (const r of rooms.values()) {
    if (!r.permanent && r.members.size === 0 && r.emptySince && Date.now() - r.emptySince > 120_000) {
      if (r.uno?.timer) clearTimeout(r.uno.timer);
      rooms.delete(r.id);
    }
  }
}, 30_000);

// ---------------------------------------------------------------- HTTP (sağlık + statik istemci)
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/config') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify({ mode: store.mode, voice: VOICE, supabaseUrl: DEMO ? null : SUPABASE_URL, supabaseAnonKey: DEMO ? null : SUPABASE_ANON_KEY }));
  }
  if (url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size, voice: VOICE, mode: store.mode }));
  }
  if (!fs.existsSync(STATIC_DIR)) { res.writeHead(404); return res.end('client build yok'); }
  let file = path.join(STATIC_DIR, path.normalize(url).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(STATIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(STATIC_DIR, 'index.html');
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
io.attach(server);
server.listen(PORT, () => console.log(`🎉 Parti sunucusu :${PORT}  veri=${store.mode}  ses=${VOICE ? 'açık' : 'kapalı (LiveKit anahtarı yok)'}`));
