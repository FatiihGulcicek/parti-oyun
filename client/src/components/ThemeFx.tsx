import { useMemo } from 'react';
import type { ThemeDef } from '../themes';

/** Al-beyaz Türk bayrağı (hilal ve yıldız). */
export function TrFlag({ size = 28 }: { size?: number }) {
  return (
    <svg width={size * 1.5} height={size} viewBox="0 0 30 20" aria-hidden>
      <rect width="30" height="20" rx="2" fill="#e30a17" />
      <circle cx="11.25" cy="10" r="5" fill="#fff" />
      <circle cx="12.5" cy="10" r="4" fill="#e30a17" />
      <path d="M16.3 10 L20.9 8.5 L18 12.4 L18 7.6 L20.9 11.5 Z" fill="#fff" />
    </svg>
  );
}

/** Temaya özel süzülen süsler. Sayfa tıklamalarını engellemez; hareket azaltma tercihine uyar. */
export default function ThemeFx({ theme }: { theme: ThemeDef }) {
  const items = useMemo(() => {
    if (!theme.fx.length) return [];
    let seed = theme.id.length * 97;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    return Array.from({ length: 10 }, (_, i) => ({
      k: i, glyph: theme.fx[i % theme.fx.length],
      left: Math.round(rnd() * 96), delay: -(rnd() * 14).toFixed(1), dur: (9 + rnd() * 8).toFixed(1),
      size: Math.round(14 + rnd() * 14), sway: Math.round(10 + rnd() * 30),
    }));
  }, [theme]);
  if (!items.length) return null;
  return (
    <div className={`theme-fx fx-${theme.fxMode}`} aria-hidden>
      {items.map(it => (
        <i key={it.k} style={{ left: `${it.left}%`, animationDelay: `${it.delay}s`, animationDuration: `${it.dur}s`, fontSize: it.size, ['--sway' as any]: `${it.sway}px` }}>
          {it.glyph === 'flag' ? <TrFlag size={it.size} /> : it.glyph}
        </i>
      ))}
    </div>
  );
}
