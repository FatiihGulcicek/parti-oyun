// Yeni oyun masalarının ortak parçaları: geri sayım, oyuncu şeridi, kazanan ekranı.
import { useEffect, useState, type ReactNode } from 'react';
import type { Profile } from '../net';
import Avatar from './Avatar';

export interface BaseView { version: number; deadline: number; serverNow: number; winner: string | null; mine: any; syncing?: boolean }

/** Sunucu süresine göre kalan milisaniye. */
export function useCountdown(deadline: number, serverNow: number, active = true) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!active) { setLeft(0); return; }
    const end = Date.now() + (deadline - serverNow);
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [deadline, serverNow, active]);
  return left;
}

export function Timer({ ms, total }: { ms: number; total: number }) {
  const secs = Math.ceil(ms / 1000);
  const pct = Math.max(0, Math.min(1, ms / total));
  return (
    <div className={`gk-timer ${secs <= 5 ? 'hot' : ''}`} style={{ ['--p' as any]: pct }}>
      <span>{secs}</span>
    </div>
  );
}

export interface StripItem { id: string; active?: boolean; badge?: ReactNode; sub?: ReactNode; dim?: boolean; tone?: string }
/** Üstte yatay oyuncu şeridi (avatar, ad, puan/rozet). */
export function PlayerStrip({ items, people, meId }: { items: StripItem[]; people: Map<string, Profile>; meId: string }) {
  return (
    <div className="gk-strip">
      {items.map(it => {
        const p = people.get(it.id);
        return (
          <div key={it.id} className={`gk-pl ${it.active ? 'active' : ''} ${it.dim ? 'dim' : ''}`} style={it.tone ? { ['--tone' as any]: it.tone } : undefined}>
            <span className="gk-av"><Avatar value={p?.avatar} />{it.badge && <i className="gk-badge">{it.badge}</i>}</span>
            <b>{it.id === meId ? 'Sen' : p?.username ?? '…'}</b>
            {it.sub !== undefined && <small>{it.sub}</small>}
          </div>
        );
      })}
    </div>
  );
}

export function WinOverlay({ winner, people, meId, title, lines }: {
  winner: string | null; people: Map<string, Profile>; meId: string; title?: string; lines?: ReactNode;
}) {
  const p = winner ? people.get(winner) : null;
  return (
    <div className="win-overlay">
      <div className="confetti">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ ['--i' as any]: i }} />)}</div>
      <div className="win-card">
        {p && <div className="av-xl"><Avatar value={p.avatar} /></div>}
        <h2>{title ?? (winner === meId ? 'Kazandın! 🎉' : `${p?.username ?? 'Bir oyuncu'} kazandı!`)}</h2>
        {lines}
      </div>
    </div>
  );
}
