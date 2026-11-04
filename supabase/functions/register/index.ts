// Kullanıcı adı + şifre ile kayıt (e-posta onayı gerektirmez).
// Giriş için kullanıcı adından türetilen gizli bir e-posta adresi kullanılır.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...cors, 'Content-Type': 'application/json' } });

// istemcideki loginEmail() ile birebir aynı olmalı
function loginEmail(username: string) {
  const bytes = new TextEncoder().encode(username.trim().toLocaleLowerCase('tr-TR'));
  return 'u' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('') + '@parti.local';
}

const hits = new Map<string, number[]>();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // basit hız sınırı: IP başına dakikada 5 kayıt
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'x';
    const now = Date.now();
    const list = (hits.get(ip) ?? []).filter(t => now - t < 60_000);
    if (list.length >= 5) return json({ ok: false, error: 'Çok fazla deneme, biraz bekle' });
    hits.set(ip, [...list, now]);

    const { username, password, avatar } = await req.json();
    const u = String(username ?? '').trim();
    if (!/^[\p{L}\p{N}_]{3,20}$/u.test(u)) return json({ ok: false, error: 'Kullanıcı adı 3-20 harf/rakam olmalı' });
    if (typeof password !== 'string' || password.length < 6) return json({ ok: false, error: 'Şifre en az 6 karakter olmalı' });
    const av = typeof avatar === 'string' && [...avatar].length <= 4 ? avatar : '😀';

    const { error } = await admin.auth.admin.createUser({
      email: loginEmail(u), password, email_confirm: true, user_metadata: { username: u, avatar: av },
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) return json({ ok: false, error: 'Bu kullanıcı adı alınmış' });
      console.error(error);
      return json({ ok: false, error: 'Kayıt oluşturulamadı' });
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: 'Sunucu hatası' });
  }
});
