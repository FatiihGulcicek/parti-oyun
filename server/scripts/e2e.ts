// Demo modunda 3 istemciyle uçtan uca senaryo
import { io, Socket } from 'socket.io-client';
const URL = process.env.URL || 'http://localhost:3001';
const call = (s: Socket, ev: string, p?: any): Promise<any> => new Promise(r => p === undefined ? s.emit(ev, r) : s.emit(ev, p, r));
const connect = (name: string, av: string) => new Promise<Socket>((res, rej) => {
  const s = io(URL, { auth: { token: `demo:${name}:${av}` }, transports: ['websocket'] });
  s.on('connect', () => res(s)); s.on('connect_error', rej);
});
function assert(c: any, m: string) { if (!c) { console.error('❌', m); process.exit(1); } console.log('✅', m); }

(async () => {
  const [a, b, c] = await Promise.all([connect('Ayse', '🐱'), connect('Burak', '🐶'), connect('Cem', '🦁')]);
  const meA = await call(a, 'me:get'); const meB = await call(b, 'me:get'); const meC = await call(c, 'me:get');
  assert(meA.ok && meA.wallet.diamonds === 500, 'profil + 500 elmas başlangıç');
  assert((await call(a, 'daily:claim')).diamonds === 550, 'günlük ödül');
  assert(!(await call(a, 'daily:claim')).ok, 'günlük ödül 2. kez alınamaz');

  const lobby = await call(a, 'lobby:list');
  assert(lobby.rooms.length >= 2, 'lobi listesi');
  const cr = await call(a, 'room:create', { name: 'Test Odası', game: 'uno' });
  assert(cr.ok, 'oda oluşturma');
  const ver: Record<string, number> = {}; const states: Record<string, any> = {}; const unos: Record<string, any> = {}; const fx: any[] = [];
  for (const [n, s] of [['a', a], ['b', b], ['c', c]] as const) {
    s.on('room:state', (x: any) => states[n] = x); s.on('uno:state', (x: any) => { unos[n] = x; ver[n] = (ver[n] ?? 0) + 1; }); s.on('gift:fx', (x: any) => fx.push(x));
  }
  for (const s of [a, b, c]) assert((await call(s, 'room:join', { roomId: cr.roomId })).ok, 'odaya katılma');
  assert((await call(a, 'seat:take', { index: 0 })).ok, 'A koltuk 0');
  assert(!(await call(b, 'seat:take', { index: 0 })).ok, 'dolu koltuğa oturulamaz');
  assert((await call(b, 'seat:take', { index: 1 })).ok, 'B koltuk 1');
  assert(!(await call(b, 'uno:start')).ok, 'sadece sahip başlatır');
  assert((await call(a, 'uno:start')).ok, 'Uno başladı');
  await new Promise(r => setTimeout(r, 150));
  assert(unos.a.myHand.length === 7 && unos.c.myHand === null, 'izleyici kart görmez, oyuncu 7 kart');
  assert(states.c.ownerId === meA.profile.id && states.c.unoPlayers.length === 2, 'oda durumu yayınlandı');

  // oyunu sonuna kadar oyna
  const S: Record<string, Socket> = { [meA.profile.id]: a, [meB.profile.id]: b };
  const view = (id: string) => id === meA.profile.id ? unos.a : unos.b;
  let moves = 0; ver.a = ver.a ?? 0; ver.b = ver.b ?? 0;
  while (!unos.a.winner && moves++ < 2000) {
    const turn = unos.a.turn; const v = view(turn); const s = S[turn];
    const playable = v.myHand.filter((x: any) => (x.color === 'wild' || x.color === v.color || x.value === v.top.value)
      && (!v.drewThisTurn || x.id === v.myHand[v.myHand.length - 1].id));
    let r;
    if (playable.length) r = await call(s, 'uno:action', { type: 'play', cardId: playable[0].id, chosenColor: 'red', uno: true });
    else if (!v.drewThisTurn) r = await call(s, 'uno:action', { type: 'draw' });
    else r = await call(s, 'uno:action', { type: 'pass' });
    if (!r.ok) { console.error(r, v); process.exit(1); }
    // hamle sonrası her iki oyuncunun da yeni durumu almasını bekle
    const va = ver.a, vb = ver.b;
    const t0 = Date.now();
    while ((ver.a === va || ver.b === vb) && Date.now() - t0 < 2000) await new Promise(r => setTimeout(r, 2));
  }
  assert(unos.a.winner, `oyun bitti (${moves} hamle)`);

  // hediye
  const g = await call(c, 'gift:send', { to: meA.profile.id, giftId: 'crown', qty: 2 });
  assert(g.ok && g.diamonds === 500 - 198, 'hediye gönderildi, elmas düştü');
  assert(!(await call(c, 'gift:send', { to: meA.profile.id, giftId: 'castle', qty: 1 })).ok, 'yetersiz elmas reddedildi');
  await new Promise(r => setTimeout(r, 100));
  assert(fx.length === 3 && fx[0].icon === '👑', 'hediye animasyonu herkese yayınlandı');
  const pa = await call(b, 'profile:get', { id: meA.profile.id });
  assert(pa.profile.charm === 198, 'alıcının çekiciliği arttı');

  // arkadaşlık
  assert((await call(a, 'friend:request', { id: meB.profile.id })).status === 'pending', 'arkadaşlık isteği');
  const fb = await call(b, 'friends:list');
  assert(fb.incoming.length === 1, 'gelen istek görünür');
  assert((await call(b, 'friend:respond', { id: meA.profile.id, accept: true })).ok, 'istek kabul');
  const fa = await call(a, 'friends:list');
  assert(fa.friends[0]?.online && fa.friends[0]?.room?.roomId === cr.roomId, 'arkadaş çevrimiçi + oda bilgisi');
  assert((await call(a, 'user:search', { q: 'bur' })).users.length === 1, 'kullanıcı arama');
  assert((await call(a, 'profile:update', { username: 'AyseX', bio: 'merhaba' })).ok, 'profil güncelleme');
  assert(!(await call(b, 'profile:update', { username: 'AyseX' })).ok, 'aynı kullanıcı adı reddedildi');

  // sohbet + ayrılma
  const chats: any[] = []; b.on('chat:msg', (m: any) => chats.push(m));
  await call(a, 'chat:send', { text: 'selam' });
  await new Promise(r => setTimeout(r, 100));
  assert(chats.some(m => m.text === 'selam'), 'sohbet mesajı');
  a.disconnect(); await new Promise(r => setTimeout(r, 150));
  assert(states.b.ownerId === meB.profile.id, 'sahip ayrılınca sahiplik devredildi');
  console.log('\n🎉 Tüm senaryolar geçti'); process.exit(0);
})();
