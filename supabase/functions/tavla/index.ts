// Tavla hakemi: zar sunucuda atılır, her hamle kurallara göre doğrulanır.
// Durum `games` tablosunda (sadece service role), herkese açık kısım `game_public` (tavlada gizli bilgi yok).
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as Tavla from './tavla.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ALIVE_MS = 60_000;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (error: string) => json({ ok: false, error });
const BOT_MS = 900; // botun düşünme süresi
const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

async function names(ids: string[]) {
  const { data } = await admin.from('profiles').select('id,username').in('id', ids);
  return new Map((data ?? []).map((p: any) => [p.id, p.username as string]));
}

async function publish(roomId: string, s: Tavla.TavlaState, version: number, msgs: string[]) {
  const deadline = s.next || Date.now() + 60_000;
  await Promise.all([
    admin.from('game_public').upsert({
      room_id: roomId, view: Tavla.viewFor(s), players: s.players, winner: s.winner, version,
      deadline: new Date(deadline).toISOString(), updated_at: new Date().toISOString(),
    }),
    msgs.length ? admin.from('room_messages').insert(msgs.map(text => ({ room_id: roomId, kind: 'system', text }))) : null,
  ]);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
    const { data: auth } = await admin.auth.getUser(token);
    if (!auth?.user) return fail('Oturum geçersiz, tekrar giriş yap');
    const uid = auth.user.id;
    const body = await req.json().catch(() => ({}));
    const roomId = String(body.room ?? '');

    const [{ data: room }, { data: pres }] = await Promise.all([
      admin.from('rooms').select('*').eq('id', roomId).maybeSingle(),
      admin.from('room_presence').select('user_id,last_seen').eq('room_id', roomId),
    ]);
    if (!room) return fail('Oda bulunamadı');
    if (room.game !== 'tavla') return fail('Bu oda Tavla odası değil');
    const present = new Set((pres ?? []).filter((p: any) => Date.now() - Date.parse(p.last_seen) < ALIVE_MS).map((p: any) => p.user_id));
    if (!present.has(uid)) return fail('Odada değilsin');
    const seated: string[] = (room.seats as (string | null)[]).filter((x): x is string => Boolean(x));
    // botlar odada "hazır" sayılır; hamlelerini hakem yapar
    const { data: botRows } = seated.length ? await admin.from('profiles').select('id').in('id', seated).eq('is_bot', true) : { data: [] as any[] };
    const bots = new Set<string>((botRows ?? []).map((b: any) => b.id));
    for (const b of bots) present.add(b);

    if (body.action === 'start') {
      if (!seated.includes(uid)) return fail('Başlatmak için koltuğa otur');
      if (room.owner_id && room.owner_id !== uid) return fail('Oyunu oda sahibi başlatır');
      const { data: old } = await admin.from('games').select('state,version').eq('room_id', roomId).maybeSingle();
      const os = old?.state as Tavla.TavlaState | undefined;
      if (os?.points && os.phase !== 'end') return fail('Oyun zaten sürüyor');
      const players = seated.filter(p => present.has(p)).slice(0, 2);
      if (players.length < 2) return fail('Tavla için 2 oturan oyuncu gerekli');
      const s = Tavla.newGame(players, Date.now(), rnd);
      if (bots.has(Tavla.current(s))) s.next = Date.now() + BOT_MS;
      const version = (old?.version ?? 0) + 1;
      const { error } = await admin.from('games').upsert({
        room_id: roomId, state: s, version, deadline: new Date(s.next).toISOString(), updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      await admin.from('game_hands').delete().eq('room_id', roomId);
      const n0 = await names(players);
      await publish(roomId, s, version, [`🎯 Tavla başladı! ⚪ ${n0.get(players[0]) ?? 'Beyaz'} - ⚫ ${n0.get(players[1]) ?? 'Siyah'}. İlk zar ${n0.get(Tavla.current(s)) ?? 'oyuncu'} için.`]);
      return json({ ok: true });
    }

    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: g } = await admin.from('games').select('*').eq('room_id', roomId).maybeSingle();
      if (!g) return fail('Oyun yok');
      const s = g.state as Tavla.TavlaState;
      if (!s.points) return fail('Oyun yok');
      if (s.phase === 'end') return fail('Oyun bitti');
      const now = Date.now();
      const n = await names([...s.players, uid]);
      const msgs: string[] = [];
      let changed = false;

      for (const p of [...s.players]) {
        if (s.phase !== 'end' && (!seated.includes(p) || !present.has(p))) {
          Tavla.removePlayer(s, p); changed = true;
          msgs.push(`🚪 ${n.get(p) ?? 'Bir oyuncu'} oyundan ayrıldı`);
        }
      }
      if (s.phase !== 'end') {
        if (body.action === 'timeout') {
          if (now < s.next - 500 && !changed) return fail('Süre dolmadı');
          if (now >= s.next - 500) {
            const who = Tavla.current(s);
            if (bots.has(who)) Tavla.botMove(s, now, rnd);
            else { Tavla.autoPlay(s, now, rnd); msgs.push(`⏰ ${n.get(who) ?? 'Oyuncu'} süresi doldu, otomatik oynandı`); }
            changed = true;
          }
        } else {
          const move = body.move as Tavla.TavlaAction;
          if (!move || typeof move !== 'object') return fail('Geçersiz hamle');
          try { Tavla.apply(s, uid, move, now, rnd); changed = true; }
          catch (e) { if (!changed) return fail(e instanceof Tavla.TavlaError ? e.message : 'Geçersiz hamle'); }
        }
      }
      if (s.phase !== 'end' && bots.has(Tavla.current(s))) s.next = Date.now() + BOT_MS;
      if (s.phase === 'end' && s.winner) msgs.push(`🏆 ${n.get(s.winner) ?? 'Bir oyuncu'} tavlayı ${s.mars ? 'MARS ile ' : ''}kazandı!`);

      const version = g.version + 1;
      const { data: upd } = await admin.from('games')
        .update({ state: s, version, deadline: new Date(s.next || now).toISOString(), updated_at: new Date().toISOString() })
        .eq('room_id', roomId).eq('version', g.version).select('version');
      if (!upd?.length) continue;
      await publish(roomId, s, version, msgs);
      return json({ ok: true });
    }
    return fail('Masa çok yoğun, tekrar dene');
  } catch (e) {
    console.error(e);
    return fail('Sunucu hatası');
  }
});
