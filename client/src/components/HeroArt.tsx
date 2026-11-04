// Lobi tanıtım bandının çizimleri (SVG).
import { useId } from 'react';

const useUid = () => useId().replace(/:/g, '');
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

function Die({ x, y, size, rot, n, id }: { x: number; y: number; size: number; rot: number; n: number; id: string }) {
  const s = size / 2, p = size * .26;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x={-s + 3} y={-s + 6} width={size} height={size} rx={size * .22} fill="#000" opacity=".18" />
      <rect x={-s} y={-s} width={size} height={size} rx={size * .22} fill={`url(#dz${id})`} />
      <rect x={-s + 3} y={-s + 3} width={size - 6} height={size * .45} rx={size * .18} fill="#fff" opacity=".55" />
      {PIPS[n].map(([dx, dy], i) => <circle key={i} cx={dx * p} cy={dy * p} r={size * .085} fill={n === 1 ? '#ff4d6d' : '#2b2540'} />)}
    </g>
  );
}

function Pawn({ x, y, color, s = 1 }: { x: number; y: number; color: string; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="30" rx="15" ry="5" fill="#000" opacity=".18" />
      <path d="M-13 28 C-13 18 -7 12 -6 4 L6 4 C7 12 13 18 13 28 Z" fill={color} />
      <ellipse cx="0" cy="28" rx="13" ry="4" fill={color} />
      <circle cx="0" cy="-2" r="9" fill={color} />
      <circle cx="-3" cy="-5" r="3" fill="#fff" opacity=".6" />
      <path d="M-9 20 C-8 14 -5 10 -4 6" stroke="#fff" strokeWidth="2.4" fill="none" opacity=".45" strokeLinecap="round" />
    </g>
  );
}

export function LudoArt() {
  const id = useUid();
  return (
    <svg viewBox="0 0 140 130" className="hero-svg" aria-hidden>
      <defs><linearGradient id={`dz${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#dfe6f5" /></linearGradient></defs>
      <Pawn x={22} y={78} color="#ff4d6d" s={.9} />
      <Pawn x={118} y={82} color="#ffcf3f" s={.8} />
      <Die x={58} y={58} size={50} rot={-14} n={6} id={id} />
      <Die x={96} y={42} size={36} rot={18} n={3} id={id} />
      <circle cx="30" cy="22" r="3" fill="#fff" opacity=".8" /><circle cx="128" cy="18" r="2" fill="#fff" opacity=".8" />
    </svg>
  );
}

function Card({ x, y, rot, color, sym }: { x: number; y: number; rot: number; color: string; sym: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x="-23" y="-31" width="50" height="70" rx="9" fill="#000" opacity=".18" />
      <rect x="-25" y="-35" width="50" height="70" rx="9" fill="#fff" />
      <rect x="-21" y="-31" width="42" height="62" rx="6" fill={color} />
      <ellipse cx="0" cy="0" rx="17" ry="25" transform="rotate(28)" fill="#fff" />
      <text x="0" y="8" textAnchor="middle" fontSize="22" fontWeight="900" fill={color} fontFamily="Nunito, sans-serif">{sym}</text>
      <text x="-15" y="-20" textAnchor="middle" fontSize="9" fontWeight="900" fill="#fff" fontFamily="Nunito, sans-serif">{sym}</text>
    </g>
  );
}

export function UnoArt() {
  return (
    <svg viewBox="0 0 140 130" className="hero-svg" aria-hidden>
      <Card x={42} y={72} rot={-22} color="#2a6fe0" sym="7" />
      <Card x={70} y={62} rot={-4} color="#18a66a" sym="⇄" />
      <Card x={98} y={70} rot={16} color="#f5b800" sym="+2" />
      <g transform="translate(116 22) rotate(10)">
        <path d="M-20 -11 h40 a6 6 0 0 1 6 6 v12 a6 6 0 0 1 -6 6 h-26 l-8 7 v-7 h-6 a6 6 0 0 1 -6 -6 v-12 a6 6 0 0 1 6 -6z" fill="#fff" />
        <text y="5" textAnchor="middle" fontSize="12" fontWeight="900" fill="#ff3d6e" fontFamily="Nunito, sans-serif">UNO!</text>
      </g>
    </svg>
  );
}

export function ChatArt() {
  const id = useUid();
  return (
    <svg viewBox="0 0 140 130" className="hero-svg" aria-hidden>
      <defs>
        <linearGradient id={`mh${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#d9ccff" /></linearGradient>
        <linearGradient id={`mb${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffcf3f" /><stop offset="1" stopColor="#ff8a3d" /></linearGradient>
      </defs>
      <g stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" opacity=".7">
        <path d="M30 40 q-12 20 0 40" /><path d="M20 32 q-18 28 0 56" opacity=".6" />
        <path d="M110 40 q12 20 0 40" /><path d="M120 32 q18 28 0 56" opacity=".6" />
      </g>
      <ellipse cx="70" cy="118" rx="24" ry="5" fill="#000" opacity=".18" />
      <rect x="64" y="84" width="12" height="26" rx="4" fill={`url(#mb${id})`} />
      <rect x="52" y="108" width="36" height="9" rx="4.5" fill={`url(#mb${id})`} />
      <path d="M46 56 v8 a24 24 0 0 0 48 0 v-8" stroke={`url(#mb${id})`} strokeWidth="6" fill="none" strokeLinecap="round" />
      <rect x="52" y="14" width="36" height="64" rx="18" fill={`url(#mh${id})`} />
      <g stroke="#a98bff" strokeWidth="2.2" strokeLinecap="round" opacity=".8">
        <path d="M58 30 h24M58 38 h24M58 46 h24M58 54 h24" />
      </g>
      <rect x="57" y="18" width="8" height="40" rx="4" fill="#fff" opacity=".8" />
      <path d="M112 16 c0 -5 7 -5 7 0 c0 -5 7 -5 7 0 c0 5 -7 9 -7 11 c0 -2 -7 -6 -7 -11z" fill="#ff4f8b" />
      <path d="M18 98 l3 -12 l8 -2 v12" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17" cy="99" r="3.5" fill="#fff" /><circle cx="28" cy="96" r="3.5" fill="#fff" />
    </svg>
  );
}

// ---------------------------------------------------------------- oyun kartı çizimleri
export function DrawArt() {
  return (
    <svg viewBox="0 0 140 130" className="hero-svg" aria-hidden>
      <rect x="22" y="22" width="88" height="70" rx="10" fill="#fff" transform="rotate(-6 66 57)" />
      <path d="M38 70 q14 -30 28 -6 t30 -14" stroke="#ff4f8b" strokeWidth="6" fill="none" strokeLinecap="round" transform="rotate(-6 66 57)" />
      <circle cx="52" cy="44" r="7" fill="#ffcf3f" transform="rotate(-6 66 57)" />
      <g transform="translate(96 66) rotate(35)">
        <rect x="-6" y="-38" width="12" height="52" rx="4" fill="#8f4bff" />
        <rect x="-6" y="-46" width="12" height="10" rx="3" fill="#ff8fb5" />
        <path d="M-6 14 L0 30 L6 14 Z" fill="#ffd9a8" /><path d="M-2 25 L0 30 L2 25 Z" fill="#2b2540" />
      </g>
      <g transform="translate(30 96) scale(.85)">
        <ellipse rx="22" ry="14" fill="#ffe0b5" /><circle cx="-9" cy="-3" r="4" fill="#ff4d6d" /><circle cx="2" cy="-6" r="4" fill="#3fa9ff" />
        <circle cx="11" cy="0" r="4" fill="#22c993" /><circle cx="-2" cy="5" r="4" fill="#ffcf3f" />
      </g>
    </svg>
  );
}

export function SpyArt() {
  return (
    <svg viewBox="0 0 140 130" className="hero-svg" aria-hidden>
      <ellipse cx="70" cy="112" rx="40" ry="8" fill="#000" opacity=".15" />
      <path d="M30 64 Q70 44 110 64 Q100 72 70 72 Q40 72 30 64Z" fill="#2b2540" />
      <path d="M44 62 Q46 26 70 24 Q94 26 96 62 Z" fill="#3d3554" />
      <rect x="44" y="52" width="52" height="8" fill="#ff4f8b" />
      <circle cx="70" cy="86" r="22" fill="#ffd9b8" />
      <g fill="#2b2540"><circle cx="60" cy="84" r="9" /><circle cx="80" cy="84" r="9" /></g>
      <g fill="#7fd8ff" opacity=".9"><circle cx="60" cy="84" r="6" /><circle cx="80" cy="84" r="6" /></g>
      <path d="M69 84 h2" stroke="#2b2540" strokeWidth="3" />
      <path d="M62 98 q8 4 16 0" stroke="#2b2540" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <text x="116" y="40" fontSize="30" fontWeight="900" fill="#fff" fontFamily="Nunito, sans-serif">?</text>
      <text x="18" y="46" fontSize="22" fontWeight="900" fill="#fff" opacity=".8" fontFamily="Nunito, sans-serif">?</text>
    </svg>
  );
}

export function TavlaArt() {
  const tri = (x: number, top: boolean, c: string) => <path key={x + String(top)} d={top ? `M${x} 24 l9 0 l-4.5 34 z` : `M${x} 104 l9 0 l-4.5 -34 z`} fill={c} />;
  return (
    <svg viewBox="0 0 140 130" className="hero-svg" aria-hidden>
      <rect x="14" y="18" width="112" height="92" rx="10" fill="#8a4b22" />
      <rect x="20" y="24" width="48" height="80" rx="4" fill="#f4d9a6" /><rect x="72" y="24" width="48" height="80" rx="4" fill="#f4d9a6" />
      {[20, 28, 36, 44, 52, 60].map((x, i) => tri(x - 0.5, true, i % 2 ? '#c2412d' : '#2b2540'))}
      {[72, 80, 88, 96, 104, 112].map((x, i) => tri(x - 0.5, false, i % 2 ? '#2b2540' : '#c2412d'))}
      {[0, 1, 2].map(k => <circle key={k} cx="108" cy={98 - k * 9} r="4.6" fill="#fff" stroke="#bbb" />)}
      {[0, 1].map(k => <circle key={k} cx="32" cy={30 + k * 9} r="4.6" fill="#2b2540" stroke="#000" />)}
      <g transform="translate(50 64) rotate(-12)"><rect x="-9" y="-9" width="18" height="18" rx="4" fill="#fff" /><circle r="2.2" fill="#ff4d6d" /></g>
      <g transform="translate(92 60) rotate(14)"><rect x="-9" y="-9" width="18" height="18" rx="4" fill="#fff" /><circle cx="-4" cy="-4" r="2" fill="#2b2540" /><circle cx="4" cy="4" r="2" fill="#2b2540" /></g>
    </svg>
  );
}

export function OkeyArt() {
  const tile = (x: number, y: number, r: number, n: string, c: string, k: number) => (
    <g key={k} transform={`translate(${x} ${y}) rotate(${r})`}>
      <rect x="-15" y="-21" width="30" height="42" rx="5" fill="#000" opacity=".15" transform="translate(2 3)" />
      <rect x="-15" y="-21" width="30" height="42" rx="5" fill="#fffaf0" />
      <text y="6" textAnchor="middle" fontSize="20" fontWeight="900" fill={c} fontFamily="Nunito, sans-serif">{n}</text>
      <circle cy="13" r="2.4" fill={c} />
    </g>
  );
  return (
    <svg viewBox="0 0 140 130" className="hero-svg" aria-hidden>
      <rect x="10" y="86" width="120" height="22" rx="6" fill="#a8622e" /><rect x="10" y="86" width="120" height="6" rx="3" fill="#c98345" />
      {tile(34, 66, -10, '7', '#e8304f', 0)}{tile(62, 62, -3, '7', '#2a6fe0', 1)}{tile(90, 62, 4, '7', '#2b2540', 2)}
      <g transform="translate(116 30) rotate(14)">
        <rect x="-13" y="-18" width="26" height="36" rx="5" fill="#fffaf0" /><text y="7" textAnchor="middle" fontSize="18" fill="#ff9a1f">★</text>
      </g>
    </svg>
  );
}
