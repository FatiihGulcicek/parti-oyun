import { useEffect, useRef, useState } from 'react';
import { useApp } from '../App';
import { bus, call, Profile } from '../net';

interface Gift { id: string; name: string; icon: string; price: number; tier: 'small' | 'medium' | 'large' }
export interface GiftFxEvent { from: Profile; to: Profile; icon: string; name: string; tier: string; qty: number; total: number }

let catalog: Gift[] | null = null;

export function GiftSheet({ members, initialTo, roomOwner, onClose }: {
  members: Profile[]; initialTo?: string; roomOwner?: string | null; onClose: () => void;
}) {
  const { me, wallet, setWallet, toast } = useApp();
  const others = members.filter(m => m.id !== me.id);
  const [gifts, setGifts] = useState<Gift[]>(catalog ?? []);
  const [to, setTo] = useState(initialTo ?? (others.find(o => o.id === roomOwner)?.id ?? others[0]?.id));
  const [gift, setGift] = useState<string>('rose');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!catalog) call<{ gifts: Gift[] }>('gifts:list').then(r => { if (r.ok) { catalog = r.gifts; setGifts(r.gifts); } });
  }, []);

  const g = gifts.find(x => x.id === gift);
  const cost = (g?.price ?? 0) * qty;

  async function send() {
    if (!to) return toast('Odada hediye gönderecek kimse yok');
    setBusy(true);
    const r = await call<{ diamonds: number }>('gift:send', { to, giftId: gift, qty });
    setBusy(false);
    if (!r.ok) return toast(r.error!);
    setWallet({ diamonds: r.diamonds });
    if (g?.tier !== 'small') onClose();
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet gift-sheet" onClick={e => e.stopPropagation()}>
        <div className="gift-to">
          {others.length === 0 && <small className="muted">Odada başka kimse yok</small>}
          {others.map(m => (
            <button key={m.id} className={to === m.id ? 'on' : ''} onClick={() => setTo(m.id)}>
              <span className="av">{m.avatar}</span><small>{m.username}</small>
            </button>
          ))}
        </div>
        <div className="gift-grid">
          {gifts.map(x => (
            <button key={x.id} className={`gift ${gift === x.id ? 'on' : ''} t-${x.tier}`} onClick={() => setGift(x.id)}>
              <span>{x.icon}</span><b>{x.name}</b><small>💎 {x.price}</small>
            </button>
          ))}
        </div>
        <div className="gift-foot">
          <span className="balance">💎 {wallet.diamonds.toLocaleString('tr-TR')}</span>
          <div className="qty">{[1, 10, 99].map(n => <button key={n} className={qty === n ? 'on' : ''} onClick={() => setQty(n)}>×{n}</button>)}</div>
          <button className="btn gold" disabled={busy || !to || cost > wallet.diamonds} onClick={send}>
            Gönder {cost > 0 && <small>({cost.toLocaleString('tr-TR')})</small>}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Odaya gelen hediye animasyonlarını sırayla oynatır. */
export function GiftFx() {
  const [queue, setQueue] = useState<(GiftFxEvent & { key: number })[]>([]);
  const [floaters, setFloaters] = useState<(GiftFxEvent & { key: number })[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const on = (e: GiftFxEvent) => {
      if (!e?.from || !e?.to) return;
      const item = { ...e, key: seq.current++ };
      if (e.tier === 'small') {
        setFloaters(f => [...f, item]);
        setTimeout(() => setFloaters(f => f.filter(x => x.key !== item.key)), 2200);
      } else setQueue(q => [...q, item]);
    };
    bus.on('gift:fx', on);
    return () => { bus.off('gift:fx', on); };
  }, []);

  const cur = queue[0];
  useEffect(() => {
    if (!cur) return;
    const t = setTimeout(() => setQueue(q => q.slice(1)), cur.tier === 'large' ? 3600 : 2400);
    return () => clearTimeout(t);
  }, [cur?.key]);

  return (
    <>
      <div className="gift-floaters">
        {floaters.map((f, i) => (
          <div key={f.key} className="gift-floater" style={{ ['--row' as any]: i % 3 }}>
            <span className="av">{f.from.avatar}</span>
            <div><b>{f.from.username}</b><small>→ {f.to.username}</small></div>
            <span className="gicon">{f.icon}</span><em>×{f.qty}</em>
          </div>
        ))}
      </div>
      {cur && (
        <div key={cur.key} className={`gift-big ${cur.tier}`}>
          <div className="rays" />
          <div className="big-icon">{cur.icon}</div>
          <div className="big-text">
            <b>{cur.from.avatar} {cur.from.username}</b> → <b>{cur.to.avatar} {cur.to.username}</b>
            <div>{cur.name} ×{cur.qty}</div>
          </div>
          {cur.tier === 'large' && <div className="sparkles">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ ['--i' as any]: i }}>✨</i>)}</div>}
        </div>
      )}
    </>
  );
}
