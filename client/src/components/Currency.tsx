// Para birimi ve rozet ikonları (SVG). Emoji yerine her cihazda aynı görünür.
import { useId } from 'react';

const useUid = () => useId().replace(/:/g, '');

/** Elmas: kesme taş, mor-camgöbeği gradyan, parıltı. */
export function GemIcon({ size = 18 }: { size?: number }) {
  const id = useUid();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="cur-ic">
      <defs>
        <linearGradient id={`gt${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b9f3ff" /><stop offset="1" stopColor="#5fc8ff" /></linearGradient>
        <linearGradient id={`gb${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5f8bff" /><stop offset="1" stopColor="#a04bff" /></linearGradient>
      </defs>
      <path d="M6.5 3.5h11l4 5.2L12 21 2.5 8.7z" fill={`url(#gb${id})`} />
      <path d="M6.5 3.5h11l4 5.2h-19z" fill={`url(#gt${id})`} />
      <path d="M2.5 8.7h19L12 21z" fill="#7a5cff" opacity=".35" />
      <path d="M8.2 8.7 12 21l3.8-12.3z" fill="#fff" opacity=".28" />
      <path d="M6.5 3.5 8.2 8.7 12 3.5l3.8 5.2 1.7-5.2" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth=".8" strokeLinejoin="round" />
      <path d="M19.6 1.2l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" fill="#fff" />
    </svg>
  );
}

/** Altın: kenarlı, kabartmalı yıldızlı para. */
export function CoinIcon({ size = 18 }: { size?: number }) {
  const id = useUid();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="cur-ic">
      <defs>
        <linearGradient id={`ce${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd23f" /><stop offset="1" stopColor="#e88a00" /></linearGradient>
        <linearGradient id={`cf${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff07a" /><stop offset="1" stopColor="#ffb300" /></linearGradient>
      </defs>
      <circle cx="12" cy="12.6" r="10" fill="#c96f00" />
      <circle cx="12" cy="11.6" r="10" fill={`url(#ce${id})`} />
      <circle cx="12" cy="11.6" r="7.3" fill={`url(#cf${id})`} stroke="#e89400" strokeWidth=".9" />
      <path d="M12 6.9l1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z" fill="#f09a00" />
      <path d="M12 6.9l1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5z" fill="#ffd23f" opacity=".6" />
      <path d="M6 7.5a7.5 7.5 0 0 1 5-3.3" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity=".75" />
    </svg>
  );
}

/** Seviye rozeti: altın kalkan içinde sayı. */
export function LevelBadge({ level }: { level: number }) {
  const id = useUid();
  return (
    <span className="lvl-badge" aria-label={`Seviye ${level}`}>
      <svg viewBox="0 0 28 30" aria-hidden>
        <defs><linearGradient id={`lb${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe066" /><stop offset="1" stopColor="#ff8a1f" /></linearGradient></defs>
        <path d="M14 1.5 25.5 6v8.6c0 6.6-4.8 11.6-11.5 14-6.7-2.4-11.5-7.4-11.5-14V6z" fill={`url(#lb${id})`} stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M14 4.6 23 8.2v3.2c-5.6-1.6-12.4-1.6-18 0V8.2z" fill="#fff" opacity=".35" />
      </svg>
      <b>{level}</b>
    </span>
  );
}

/** Saate göre selamlama. */
export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 6) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}
