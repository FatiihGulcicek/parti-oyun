// Çiz-Tahmin hakemi: kelime seçimi, tahmin kontrolü, ipuçları ve puanlar burada.
// Gizli durum `games` (sadece service role), herkese açık kısım `game_public`; çizerin kelimesi
// yalnızca kendi `game_hands` satırında. Çizimin kendisi Realtime broadcast ile oyuncular arasında akar.
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as Draw from './draw.ts';
import { WORDS } from './words.ts';

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
const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

async function names(ids: string[]) {
  const { data } = await admin.from('profiles').select('id,username').in('id', ids);
  return new Map((data ?? []).map((p: any) => [p.id, p.username as string]));
}

async function publish(roomId: string, s: Draw.DrawState, version: number, msgs: string[]) {
  const deadline = s.next || Date.now() + 60_000;
  const tasks: PromiseLike<unknown>[] = [
    admin.from('game_public').upsert({
      room_id: roomId, view: Draw.viewFor(s), players: s.players, winner: s.winner, version,
      deadline: new Date(deadline).toISOString(), updated_at: new Date().toISOString(),
    }),
  ];
  if (s.players.length) {
    tasks.push(admin.from('game_hands').upsert(s.players.map(p => ({ room_id: roomId, user_id: p, hand: Draw.privateFor(s, p), version }))));
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
    if (room.game !== 'draw') return fail('Bu oda Çiz-Tahmin odası değil');
    const present = new Set((pres ?? []).filter((p: any) => Date.now() - Date.parse(p.last_seen) < ALIVE_MS).map((p: any) => p.user_id));
    if (!present.has(uid)) return fail('Odada değilsin');
    const seated: string[] = (room.seats as (string | null)[]).filter((x): x is string => Boolean(x));

    if (body.action === 'start') {
      if (!seated.includes(uid)) return fail('Başlatmak için koltuğa otur');
      if (room.owner_id && room.owner_id !== uid) return fail('Oyunu oda sahibi başlatır');
      const { data: old } = await admin.from('games').select('state,version').eq('room_id', roomId).maybeSingle();
      if (old && !(old.state as Draw.DrawState).winner && (old.state as Draw.DrawState).phase !== 'end' && (old.state as any).drawer) return fail('Oyun zaten sürüyor');
      const players = seated.filter(p => present.has(p)).slice(0, 8);
      if (players.length < 2) return fail('En az 2 oturan oyuncu gerekli');
      const s = Draw.newGame(players, WORDS, Date.now(), rnd);
      const version = (old?.version ?? 0) + 1;
      const { error } = await admin.from('games').upsert({
        room_id: roomId, state: s, version, deadline: new Date(s.next).toISOString(), updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      await admin.from('game_hands').delete().eq('room_id', roomId);
      await publish(roomId, s, version, [`🎨 Çiz-Tahmin başladı! (${players.length} oyuncu, ${s.rounds} tur)`]);
      return json({ ok: true });
    }

    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: g } = await admin.from('games').select('*').eq('room_id', roomId).maybeSingle();
      if (!g) return fail('Oyun yok');
      const s = g.state as Draw.DrawState;
      if (!s.drawer) return fail('Oyun yok');
      if (s.winner || s.phase === 'end') return fail('Oyun bitti');
      const now = Date.now();
      const n = await names([...s.players, uid]);
      const msgs: string[] = [];
      let changed = false;
      let result: string | undefined;

      for (const p of [...s.players]) {
        if (s.phase !== 'end' && (!seated.includes(p) || !present.has(p))) {
          Draw.removePlayer(s, p, WORDS, now, rnd); changed = true;
          msgs.push(`🚪 ${n.get(p) ?? 'Bir oyuncu'} oyundan ayrıldı`);
        }
      }

      if (s.phase !== 'end') {
        if (body.action === 'timeout') {
          const before = s.phase;
          if (Draw.tick(s, WORDS, now, rnd)) {
            changed = true;
            if (before === 'draw' && s.phase === 'reveal') msgs.push(`⌛ Süre doldu! Kelime: "${s.lastWord}"`);
          } else if (!changed) return fail('Süre dolmadı');
        } else {
          const move = body.move as Draw.DrawAction;
          if (!move || typeof move !== 'object') return fail('Geçersiz hamle');
          try { result = Draw.apply(s, uid, move, now); changed = true; }
          catch (e) { if (!changed) return fail(e instanceof Draw.DrawError ? e.message : 'Geçersiz hamle'); }
          if (result === 'correct') msgs.push(`✅ ${n.get(uid) ?? 'Bir oyuncu'} kelimeyi bildi! (+${s.gained[uid] ?? 0})`);
        }
      }
      if (s.phase === 'end' && s.winner) msgs.push(`🏆 ${n.get(s.winner) ?? 'Bir oyuncu'} Çiz-Tahmin'i ${s.scores[s.winner] ?? 0} puanla kazandı!`);

      const version = g.version + 1;
      const { data: upd } = await admin.from('games')
        .update({ state: s, version, deadline: new Date(s.next || now).toISOString(), updated_at: new Date().toISOString() })
        .eq('room_id', roomId).eq('version', g.version).select('version');
      if (!upd?.length) continue;
      await publish(roomId, s, version, msgs);
      return json({ ok: true, result });
    }
    return fail('Masa çok yoğun, tekrar dene');
  } catch (e) {
    console.error(e);
    return fail('Sunucu hatası');
  }
});
