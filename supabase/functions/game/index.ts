// Uno hakemi: tüm hamleler burada doğrulanır. Gizli durum `games` tablosunda,
// herkese açık kısım `game_public`, her oyuncunun eli `game_hands` (RLS: sadece kendi elin).
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as Uno from './uno.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const TURN_MS = 25_000;
const ALIVE_MS = 60_000;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (error: string) => json({ ok: false, error });

async function names(ids: string[]) {
  const { data } = await admin.from('profiles').select('id,username').in('id', ids);
  return new Map((data ?? []).map((p: any) => [p.id, p.username as string]));
}

async function publish(roomId: string, s: Uno.UnoState, version: number, deadline: number, msgs: string[]) {
  const { myHand: _x, ...view } = Uno.viewFor(s, null);
  const tasks: Promise<unknown>[] = [
    admin.from('game_public').upsert({
      room_id: roomId, view, players: s.players, winner: s.winner, version,
      deadline: new Date(deadline).toISOString(), updated_at: new Date().toISOString(),
    }),
  ];
  if (s.players.length) {
    tasks.push(admin.from('game_hands').upsert(s.players.map(p => ({ room_id: roomId, user_id: p, hand: s.hands[p], version }))));
    tasks.push(admin.from('game_hands').delete().eq('room_id', roomId).not('user_id', 'in', `(${s.players.join(',')})`));
  }
  if (msgs.length) tasks.push(admin.from('room_messages').insert(msgs.map(text => ({ room_id: roomId, kind: 'system', text }))));
  await Promise.all(tasks);
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
    if (room.game !== 'uno') return fail('Bu oda Uno odası değil');
    const present = new Set((pres ?? []).filter((p: any) => Date.now() - Date.parse(p.last_seen) < ALIVE_MS).map((p: any) => p.user_id));
    if (!present.has(uid)) return fail('Odada değilsin');
    const seated: string[] = (room.seats as (string | null)[]).filter((x): x is string => Boolean(x));

    // ---- yeni oyun
    if (body.action === 'start') {
      if (!seated.includes(uid)) return fail('Başlatmak için koltuğa otur');
      if (room.owner_id && room.owner_id !== uid) return fail('Oyunu oda sahibi başlatır');
      const { data: old } = await admin.from('games').select('state,version').eq('room_id', roomId).maybeSingle();
      if (old && !(old.state as Uno.UnoState).winner) return fail('Oyun zaten sürüyor');
      const players = seated.filter(p => present.has(p)).slice(0, 6);
      if (players.length < 2) return fail('En az 2 oturan oyuncu gerekli');
      const s = Uno.newGame(players);
      const version = (old?.version ?? 0) + 1;
      const deadline = Date.now() + TURN_MS;
      const { error } = await admin.from('games').upsert({
        room_id: roomId, state: s, version, deadline: new Date(deadline).toISOString(), updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      await admin.from('game_hands').delete().eq('room_id', roomId);
      await publish(roomId, s, version, deadline, [`🎴 Uno başladı! (${players.length} oyuncu)`]);
      return json({ ok: true });
    }

    // ---- hamle / süre aşımı (eşzamanlı yazımlara karşı sürüm kontrolüyle tekrar dene)
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: g } = await admin.from('games').select('*').eq('room_id', roomId).maybeSingle();
      if (!g) return fail('Oyun yok');
      const s = g.state as Uno.UnoState;
      if (s.winner) return fail('Oyun bitti');
      const n = await names([...s.players, uid]);
      const msgs: string[] = [];
      const before = { turn: Uno.current(s), drew: s.drewThisTurn };
      let deadline = Date.parse(g.deadline);

      // koltuktan kalkan / ayrılan oyuncuları oyundan çıkar
      let purged = false;
      for (const p of [...s.players]) {
        if (!s.winner && (!seated.includes(p) || !present.has(p))) {
          Uno.removePlayer(s, p); purged = true;
          msgs.push(`🚪 ${n.get(p) ?? 'Bir oyuncu'} oyundan ayrıldı`);
        }
      }

      if (!s.winner) {
        if (body.action === 'timeout') {
          if (Date.now() < deadline - 500 && !purged) return fail('Süre dolmadı');
          if (Date.now() >= deadline - 500) {
            const who = Uno.current(s);
            Uno.autoMove(s);
            msgs.push(`⏰ ${n.get(who) ?? 'Oyuncu'} süresi doldu, otomatik kart çekildi`);
          }
        } else {
          const move = body.move as Uno.UnoAction;
          if (!move || typeof move !== 'object') return fail('Geçersiz hamle');
          try { Uno.apply(s, uid, move); }
          catch (e) { if (!purged) return fail(e instanceof Uno.UnoError ? e.message : 'Geçersiz hamle'); }
          if (move.type === 'catch' && s.lastAction?.type === 'catch')
            msgs.push(`🚨 ${n.get(uid)}, ${n.get(move.target)} UNO demeden yakaladı! +2 kart`);
        }
      }
      if (s.winner) msgs.push(`🏆 ${n.get(s.winner) ?? 'Bir oyuncu'} Uno'yu kazandı!`);
      if (purged || body.action === 'timeout' || Uno.current(s) !== before.turn || s.drewThisTurn !== before.drew)
        deadline = Date.now() + TURN_MS;

      const version = g.version + 1;
      const { data: upd } = await admin.from('games')
        .update({ state: s, version, deadline: new Date(deadline).toISOString(), updated_at: new Date().toISOString() })
        .eq('room_id', roomId).eq('version', g.version).select('version');
      if (!upd?.length) continue; // başka bir hamle araya girdi
      await publish(roomId, s, version, deadline, msgs);
      return json({ ok: true });
    }
    return fail('Masa çok yoğun, tekrar dene');
  } catch (e) {
    console.error(e);
    return fail('Sunucu hatası');
  }
});
