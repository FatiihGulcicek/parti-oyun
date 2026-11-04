// Veri katmanı: Supabase (gerçek) veya bellek içi (demo).
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export interface Profile { id: string; username: string; avatar: string; level: number }
export interface FullProfile extends Profile { bio: string; charm: number; wealth: number }
export interface Wallet { diamonds: number; coins: number; canClaimDaily: boolean }
export interface Gift { id: string; name: string; icon: string; price: number; tier: 'small' | 'medium' | 'large' }
export interface FriendsList { friends: Profile[]; incoming: Profile[]; outgoing: Profile[] }
export type Res<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

export interface Store {
  mode: 'supabase' | 'demo';
  /** token → profil. Geçersizse null. */
  authenticate(token: string): Promise<Profile | null>;
  me(token: string, uid: string): Promise<{ profile: FullProfile; wallet: Wallet }>;
  profile(token: string, id: string): Promise<FullProfile | null>;
  updateProfile(token: string, uid: string, p: Partial<Pick<FullProfile, 'username' | 'avatar' | 'bio'>>): Promise<Res>;
  claimDaily(token: string, uid: string): Promise<Res<{ diamonds: number; coins: number }>>;
  gifts(token: string): Promise<Gift[]>;
  sendGift(token: string, uid: string, to: string, giftId: string, qty: number, room: string): Promise<Res<{ diamonds: number; total: number; icon: string; name: string; tier: string }>>;
  friends(token: string, uid: string): Promise<FriendsList>;
  friendRequest(token: string, uid: string, target: string): Promise<Res<{ status: string }>>;
  friendRespond(token: string, uid: string, requester: string, accept: boolean): Promise<Res>;
  unfriend(token: string, uid: string, other: string): Promise<Res>;
  search(token: string, q: string): Promise<Profile[]>;
}

const GIFTS: Gift[] = [
  { id: 'rose', name: 'Gül', icon: '🌹', price: 1, tier: 'small' },
  { id: 'heart', name: 'Kalp', icon: '💖', price: 5, tier: 'small' },
  { id: 'cake', name: 'Pasta', icon: '🎂', price: 20, tier: 'small' },
  { id: 'crown', name: 'Taç', icon: '👑', price: 99, tier: 'medium' },
  { id: 'car', name: 'Spor Araba', icon: '🏎️', price: 520, tier: 'large' },
  { id: 'rocket', name: 'Roket', icon: '🚀', price: 1314, tier: 'large' },
  { id: 'castle', name: 'Şato', icon: '🏰', price: 5200, tier: 'large' },
];
const REASONS: Record<string, string> = {
  insufficient: 'Yetersiz elmas 💎', self_gift: 'Kendine hediye gönderemezsin', already_claimed: 'Bugünkü ödülü zaten aldın',
  bad_qty: 'Geçersiz adet', no_gift: 'Hediye bulunamadı', no_receiver: 'Alıcı bulunamadı', self: 'Kendini ekleyemezsin',
};
const reason = (r?: string) => REASONS[r ?? ''] ?? 'İşlem başarısız';
const today = () => new Date().toISOString().slice(0, 10);
const levelFor = (wealth: number) => 1 + Math.floor(Math.sqrt(wealth / 100));

// ------------------------------------------------------------------ Supabase
export function supabaseStore(url: string, anon: string): Store {
  const c = (token: string): SupabaseClient => createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const P = 'id,username,avatar,level';
  return {
    mode: 'supabase',
    async authenticate(token) {
      const sb = c(token);
      const { data, error } = await sb.auth.getUser(token);
      if (error || !data.user) return null;
      const { data: p } = await sb.from('profiles').select(P).eq('id', data.user.id).single();
      return (p as Profile) ?? null;
    },
    async me(token, uid) {
      const sb = c(token);
      const [{ data: profile }, { data: w }] = await Promise.all([
        sb.from('profiles').select('*').eq('id', uid).single(),
        sb.from('wallets').select('*').eq('user_id', uid).single(),
      ]);
      return {
        profile: profile as FullProfile,
        wallet: { diamonds: Number(w?.diamonds ?? 0), coins: Number(w?.coins ?? 0), canClaimDaily: !w?.last_daily || w.last_daily < today() },
      };
    },
    async profile(token, id) {
      const { data } = await c(token).from('profiles').select('id,username,avatar,level,bio,charm,wealth').eq('id', id).single();
      return (data as FullProfile) ?? null;
    },
    async updateProfile(token, uid, p) {
      const { error } = await c(token).from('profiles').update(p).eq('id', uid);
      if (error) return { ok: false, error: error.code === '23505' ? 'Bu kullanıcı adı alınmış' : 'Profil güncellenemedi' };
      return { ok: true };
    },
    async claimDaily(token) {
      const { data, error } = await c(token).rpc('claim_daily');
      if (error || !data?.ok) return { ok: false, error: reason(data?.reason) };
      return { ok: true, diamonds: data.diamonds, coins: data.coins };
    },
    async gifts(token) {
      const { data } = await c(token).from('gifts').select('id,name,icon,price,tier').order('sort');
      return (data as Gift[]) ?? GIFTS;
    },
    async sendGift(token, _uid, to, giftId, qty, room) {
      const { data, error } = await c(token).rpc('send_gift', { p_receiver: to, p_gift: giftId, p_qty: qty, p_room: room });
      if (error) return { ok: false, error: 'Oturum süresi dolmuş olabilir' };
      if (!data?.ok) return { ok: false, error: reason(data?.reason) };
      return { ok: true, diamonds: data.diamonds, total: data.total, icon: data.icon, name: data.name, tier: data.tier };
    },
    async friends(token, uid) {
      const { data } = await c(token).from('friendships')
        .select(`status, requester, addressee, req:profiles!friendships_requester_fkey(${P}), add:profiles!friendships_addressee_fkey(${P})`);
      const out: FriendsList = { friends: [], incoming: [], outgoing: [] };
      for (const f of (data as any[]) ?? []) {
        const other = f.requester === uid ? f.add : f.req;
        if (f.status === 'accepted') out.friends.push(other);
        else if (f.addressee === uid) out.incoming.push(other);
        else out.outgoing.push(other);
      }
      return out;
    },
    async friendRequest(token, _uid, target) {
      const { data, error } = await c(token).rpc('send_friend_request', { p_target: target });
      if (error || !data?.ok) return { ok: false, error: reason(data?.reason) };
      return { ok: true, status: data.status };
    },
    async friendRespond(token, _uid, requester, accept) {
      const { data, error } = await c(token).rpc('respond_friend_request', { p_requester: requester, p_accept: accept });
      return error || !data?.ok ? { ok: false, error: 'İstek bulunamadı' } : { ok: true };
    },
    async unfriend(token, uid, other) {
      const { error } = await c(token).from('friendships').delete()
        .or(`and(requester.eq.${uid},addressee.eq.${other}),and(requester.eq.${other},addressee.eq.${uid})`);
      return error ? { ok: false, error: 'Silinemedi' } : { ok: true };
    },
    async search(token, q) {
      const clean = q.replace(/[%_,()]/g, '').slice(0, 20);
      if (clean.length < 2) return [];
      const { data } = await c(token).from('profiles').select(P).ilike('username', `%${clean}%`).limit(20);
      return (data as Profile[]) ?? [];
    },
  };
}

// ------------------------------------------------------------------ Demo (bellek içi)
// Demo token biçimi: "demo:<kullanıcıadı>:<avatar>". Aynı kullanıcı adı aynı hesaba girer.
export function demoStore(): Store {
  interface U extends FullProfile { diamonds: number; coins: number; lastDaily: string | null }
  const users = new Map<string, U>();
  const friendships: { requester: string; addressee: string; status: 'pending' | 'accepted' }[] = [];
  const pub = (u: U): Profile => ({ id: u.id, username: u.username, avatar: u.avatar, level: u.level });
  const full = (u: U): FullProfile => ({ ...pub(u), bio: u.bio, charm: u.charm, wealth: u.wealth });

  return {
    mode: 'demo',
    async authenticate(token) {
      const m = /^demo:([^:]{3,20}):(.{1,8})$/u.exec(token);
      if (!m) return null;
      const id = crypto.createHash('sha1').update(m[1].toLowerCase()).digest('hex').slice(0, 32)
        .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
      let u = users.get(id);
      if (!u) {
        u = { id, username: m[1], avatar: m[2], level: 1, bio: '', charm: 0, wealth: 0, diamonds: 500, coins: 1000, lastDaily: null };
        users.set(id, u);
      }
      return pub(u);
    },
    async me(_t, uid) {
      const u = users.get(uid)!;
      return { profile: full(u), wallet: { diamonds: u.diamonds, coins: u.coins, canClaimDaily: u.lastDaily !== today() } };
    },
    async profile(_t, id) { const u = users.get(id); return u ? full(u) : null; },
    async updateProfile(_t, uid, p) {
      const u = users.get(uid)!;
      if (p.username && [...users.values()].some(x => x.id !== uid && x.username.toLowerCase() === p.username!.toLowerCase()))
        return { ok: false, error: 'Bu kullanıcı adı alınmış' };
      Object.assign(u, p);
      return { ok: true };
    },
    async claimDaily(_t, uid) {
      const u = users.get(uid)!;
      if (u.lastDaily === today()) return { ok: false, error: reason('already_claimed') };
      u.lastDaily = today(); u.diamonds += 50; u.coins += 200;
      return { ok: true, diamonds: u.diamonds, coins: u.coins };
    },
    async gifts() { return GIFTS; },
    async sendGift(_t, uid, to, giftId, qty) {
      const g = GIFTS.find(x => x.id === giftId);
      const s = users.get(uid)!, r = users.get(to);
      if (!g) return { ok: false, error: reason('no_gift') };
      if (!r) return { ok: false, error: reason('no_receiver') };
      if (uid === to) return { ok: false, error: reason('self_gift') };
      const total = g.price * qty;
      if (s.diamonds < total) return { ok: false, error: reason('insufficient') };
      s.diamonds -= total; s.wealth += total; s.level = levelFor(s.wealth); r.charm += total;
      return { ok: true, diamonds: s.diamonds, total, icon: g.icon, name: g.name, tier: g.tier };
    },
    async friends(_t, uid) {
      const out: FriendsList = { friends: [], incoming: [], outgoing: [] };
      for (const f of friendships) {
        if (f.requester !== uid && f.addressee !== uid) continue;
        const other = pub(users.get(f.requester === uid ? f.addressee : f.requester)!);
        if (f.status === 'accepted') out.friends.push(other);
        else if (f.addressee === uid) out.incoming.push(other);
        else out.outgoing.push(other);
      }
      return out;
    },
    async friendRequest(_t, uid, target) {
      if (uid === target) return { ok: false, error: reason('self') };
      if (!users.has(target)) return { ok: false, error: reason('no_receiver') };
      const back = friendships.find(f => f.requester === target && f.addressee === uid);
      if (back) { back.status = 'accepted'; return { ok: true, status: 'accepted' }; }
      if (!friendships.some(f => f.requester === uid && f.addressee === target))
        friendships.push({ requester: uid, addressee: target, status: 'pending' });
      return { ok: true, status: 'pending' };
    },
    async friendRespond(_t, uid, requester, accept) {
      const i = friendships.findIndex(f => f.requester === requester && f.addressee === uid && f.status === 'pending');
      if (i < 0) return { ok: false, error: 'İstek bulunamadı' };
      if (accept) friendships[i].status = 'accepted'; else friendships.splice(i, 1);
      return { ok: true };
    },
    async unfriend(_t, uid, other) {
      const i = friendships.findIndex(f => (f.requester === uid && f.addressee === other) || (f.requester === other && f.addressee === uid));
      if (i >= 0) friendships.splice(i, 1);
      return { ok: true };
    },
    async search(_t, q) {
      const s = q.toLowerCase();
      return s.length < 2 ? [] : [...users.values()].filter(u => u.username.toLowerCase().includes(s)).slice(0, 20).map(pub);
    },
  };
}
