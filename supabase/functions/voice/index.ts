// LiveKit ses jetonu. LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET yoksa ses kapalı döner.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const LK_URL = Deno.env.get('LIVEKIT_URL') ?? '';
const LK_KEY = Deno.env.get('LIVEKIT_API_KEY') ?? '';
const LK_SECRET = Deno.env.get('LIVEKIT_API_SECRET') ?? '';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!LK_URL || !LK_KEY || !LK_SECRET) return json({ ok: true, disabled: true });
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
    const { data: auth } = await admin.auth.getUser(token);
    if (!auth?.user) return json({ ok: false, error: 'Oturum geçersiz' });
    const { room } = await req.json();
    const { data: pres } = await admin.from('room_presence').select('room_id').eq('user_id', auth.user.id).maybeSingle();
    if (!pres || pres.room_id !== room) return json({ ok: false, error: 'Odada değilsin' });
    const { data: prof } = await admin.from('profiles').select('username').eq('id', auth.user.id).single();
    const at = new AccessToken(LK_KEY, LK_SECRET, { identity: auth.user.id, name: prof?.username ?? 'oyuncu', ttl: '6h' });
    at.addGrant({ room: String(room), roomJoin: true, canSubscribe: true, canPublish: true, canPublishData: false });
    return json({ ok: true, url: LK_URL, token: await at.toJwt() });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: 'Sunucu hatası' });
  }
});
