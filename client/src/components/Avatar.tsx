// Parti'ye özgü çizilmiş avatarlar (SVG). profiles.avatar alanında kısa anahtar ("a01") saklanır;
// eski hesaplardaki emoji avatarlar olduğu gibi gösterilmeye devam eder.
import { useId, type ReactNode } from 'react';

type Species = 'cat' | 'fox' | 'bear' | 'panda' | 'bunny' | 'dog' | 'frog' | 'penguin' | 'owl' | 'chick' | 'dino' | 'robot';
type Acc = 'none' | 'bow' | 'headphones' | 'crown' | 'cap' | 'glasses' | 'flower' | 'party' | 'star';
type Eyes = 'dot' | 'happy' | 'wink' | 'sparkle';

interface AvatarDef {
  id: string; name: string; emoji: string; species: Species;
  fur: string; accent: string; bg: [string, string]; shirt: string; acc: Acc; eyes: Eyes;
}

export const AVATAR_LIST: AvatarDef[] = [
  { id: 'a01', name: 'Pamuk', emoji: '🐱', species: 'cat', fur: '#fff3e2', accent: '#ffc2a8', bg: ['#c9f3e6', '#5fd6b4'], shirt: '#ff6fa8', acc: 'party', eyes: 'sparkle' },
  { id: 'a02', name: 'Zeytin', emoji: '🐱', species: 'cat', fur: '#ffb36b', accent: '#ffd9b0', bg: ['#bfe6ff', '#6cbcff'], shirt: '#3f7cff', acc: 'headphones', eyes: 'happy' },
  { id: 'a03', name: 'Gece', emoji: '🐈‍⬛', species: 'cat', fur: '#3d3554', accent: '#ff9ec7', bg: ['#fff1a8', '#ffcf3f'], shirt: '#8f4bff', acc: 'crown', eyes: 'sparkle' },
  { id: 'a04', name: 'Ateş', emoji: '🦊', species: 'fox', fur: '#ff8a3d', accent: '#fff4ea', bg: ['#e2d1ff', '#a77bff'], shirt: '#22c993', acc: 'star', eyes: 'wink' },
  { id: 'a05', name: 'Kar', emoji: '🦊', species: 'fox', fur: '#e7efff', accent: '#ffffff', bg: ['#c9d2ff', '#6f7dff'], shirt: '#ff4fa3', acc: 'headphones', eyes: 'dot' },
  { id: 'a06', name: 'Bambu', emoji: '🐼', species: 'panda', fur: '#ffffff', accent: '#2b2540', bg: ['#c8f7e3', '#5fdcaa'], shirt: '#ffb800', acc: 'flower', eyes: 'dot' },
  { id: 'a07', name: 'Bal', emoji: '🐻', species: 'bear', fur: '#c98a5a', accent: '#f3d3b5', bg: ['#fff3b8', '#ffd04d'], shirt: '#ff5f6d', acc: 'cap', eyes: 'happy' },
  { id: 'a08', name: 'Buzul', emoji: '🐻‍❄️', species: 'bear', fur: '#f4f8ff', accent: '#dde7fb', bg: ['#cfeaff', '#71b8ff'], shirt: '#7b3cff', acc: 'glasses', eyes: 'dot' },
  { id: 'a09', name: 'Pofuduk', emoji: '🐰', species: 'bunny', fur: '#fff3f8', accent: '#ffb3cf', bg: ['#e8dcff', '#b893ff'], shirt: '#ff9a3d', acc: 'none', eyes: 'sparkle' },
  { id: 'a10', name: 'Kakao', emoji: '🐰', species: 'bunny', fur: '#b98262', accent: '#f1cdb8', bg: ['#ffe0cc', '#ffad80'], shirt: '#1fb5c9', acc: 'glasses', eyes: 'happy' },
  { id: 'a11', name: 'Bisküvi', emoji: '🐶', species: 'dog', fur: '#ecc495', accent: '#a8693f', bg: ['#c6f3f0', '#47cfc4'], shirt: '#ff4fa3', acc: 'party', eyes: 'dot' },
  { id: 'a12', name: 'Kömür', emoji: '🐶', species: 'dog', fur: '#5b4c43', accent: '#2c221d', bg: ['#ffd6ea', '#ff8cc0'], shirt: '#ffcf3f', acc: 'bow', eyes: 'wink' },
  { id: 'a13', name: 'Vak', emoji: '🐸', species: 'frog', fur: '#72db74', accent: '#c9f7b8', bg: ['#ffd9e6', '#ff8fb5'], shirt: '#3f7cff', acc: 'crown', eyes: 'dot' },
  { id: 'a14', name: 'Buz', emoji: '🐧', species: 'penguin', fur: '#2e3b6e', accent: '#ffffff', bg: ['#c9ecff', '#4fb6ff'], shirt: '#ff5f6d', acc: 'headphones', eyes: 'happy' },
  { id: 'a15', name: 'Bilge', emoji: '🦉', species: 'owl', fur: '#9b6b4a', accent: '#f5e2c8', bg: ['#e4d4ff', '#9a6bff'], shirt: '#22c993', acc: 'none', eyes: 'dot' },
  { id: 'a16', name: 'Limon', emoji: '🐥', species: 'chick', fur: '#ffd84a', accent: '#ff9a3d', bg: ['#c9f7dc', '#4fd98f'], shirt: '#8f4bff', acc: 'flower', eyes: 'sparkle' },
  { id: 'a17', name: 'Reks', emoji: '🦖', species: 'dino', fur: '#4fcf8f', accent: '#bdf3d6', bg: ['#ffe2c2', '#ff9f4d'], shirt: '#3f7cff', acc: 'none', eyes: 'happy' },
  { id: 'a18', name: 'Bip', emoji: '🤖', species: 'robot', fur: '#a9bde3', accent: '#43f0ff', bg: ['#d3c4ff', '#6f4bff'], shirt: '#ff4fa3', acc: 'none', eyes: 'dot' },
];
const BY_ID = new Map(AVATAR_LIST.map(a => [a.id, a]));
export const DEFAULT_AVATAR = 'a01';
export const randomAvatar = () => AVATAR_LIST[Math.floor(Math.random() * AVATAR_LIST.length)].id;

/** Metin içinde (bildirim vb.) kullanılacak karşılık: yeni avatarlar için emoji, eskiler olduğu gibi. */
export function avatarText(v?: string | null) {
  if (!v) return '';
  return BY_ID.get(v)?.emoji ?? v;
}

const INK = '#2b2540';

// ---------------------------------------------------------------- parçalar
function Eyes({ kind, y = 52, gap = 9, color = INK }: { kind: Eyes; y?: number; gap?: number; color?: string }) {
  const xs = [50 - gap, 50 + gap];
  if (kind === 'happy') return <g stroke={color} strokeWidth="2.6" strokeLinecap="round" fill="none">
    {xs.map(x => <path key={x} d={`M${x - 4} ${y + 1} q4 -5 8 0`} />)}</g>;
  return (
    <g>
      {xs.map((x, i) => kind === 'wink' && i === 1
        ? <path key={x} d={`M${x - 4} ${y} q4 3 8 0`} stroke={color} strokeWidth="2.6" strokeLinecap="round" fill="none" />
        : <g key={x}>
          <ellipse cx={x} cy={y} rx={kind === 'sparkle' ? 4.2 : 3.6} ry={kind === 'sparkle' ? 5 : 4.4} fill={color} />
          <circle cx={x + 1.3} cy={y - 1.6} r={kind === 'sparkle' ? 1.7 : 1.3} fill="#fff" />
          {kind === 'sparkle' && <circle cx={x - 1.2} cy={y + 1.8} r=".8" fill="#fff" />}
        </g>)}
    </g>
  );
}
const Cheeks = ({ y = 61, gap = 17, color = '#ff8fb1' }) => (
  <g fill={color} opacity=".55"><ellipse cx={50 - gap} cy={y} rx="4.5" ry="3" /><ellipse cx={50 + gap} cy={y} rx="4.5" ry="3" /></g>
);
const CatMouth = ({ y = 60 }) => <path d={`M45.5 ${y} q2.25 3 4.5 0 q2.25 3 4.5 0`} stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />;
const Smile = ({ y = 61, w = 6 }) => <path d={`M${50 - w} ${y} q${w} ${w * .9} ${w * 2} 0`} stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />;
const Nose = ({ y = 56, color = '#ff7aa2', w = 3 }) => <path d={`M${50 - w} ${y} h${w * 2} l-${w} ${w * .9} z`} fill={color} strokeLinejoin="round" />;

function Species({ d }: { d: AvatarDef }) {
  const { fur, accent } = d;
  switch (d.species) {
    case 'cat': return <g>
      <path d="M24 40 L28 13 L46 27 Z" fill={fur} /><path d="M76 40 L72 13 L54 27 Z" fill={fur} />
      <path d="M29 33 L31 20 L40 27 Z" fill={accent} /><path d="M71 33 L69 20 L60 27 Z" fill={accent} />
      <circle cx="50" cy="50" r="28" fill={fur} />
      <Eyes kind={d.eyes} /><Cheeks /><Nose /><CatMouth />
      <g stroke={d.fur === '#3d3554' ? '#8f86a8' : '#c9bfd9'} strokeWidth="1.2" strokeLinecap="round">
        <path d="M30 57 h-9M31 61 l-8 2M70 57 h9M69 61 l8 2" /></g>
    </g>;
    case 'fox': return <g>
      <path d="M22 44 L25 9 L47 27 Z" fill={fur} /><path d="M78 44 L75 9 L53 27 Z" fill={fur} />
      <path d="M28 33 L29 17 L40 27 Z" fill={INK} opacity=".75" /><path d="M72 33 L71 17 L60 27 Z" fill={INK} opacity=".75" />
      <circle cx="50" cy="50" r="28" fill={fur} />
      <path d="M22 52 Q34 50 50 66 Q66 50 78 52 Q74 76 50 78 Q26 76 22 52 Z" fill={accent} />
      <Eyes kind={d.eyes} y={50} /><ellipse cx="50" cy="60" rx="3.6" ry="2.6" fill={INK} /><Smile y={64} w={4} />
    </g>;
    case 'bear': return <g>
      <circle cx="28" cy="28" r="10" fill={fur} /><circle cx="72" cy="28" r="10" fill={fur} />
      <circle cx="28" cy="28" r="5" fill={accent} /><circle cx="72" cy="28" r="5" fill={accent} />
      <circle cx="50" cy="51" r="28" fill={fur} />
      <ellipse cx="50" cy="61" rx="12" ry="9" fill={accent} />
      <Eyes kind={d.eyes} y={50} /><ellipse cx="50" cy="57" rx="4.5" ry="3.2" fill={INK} /><Smile y={62} w={4} /><Cheeks y={60} gap={19} />
    </g>;
    case 'panda': return <g>
      <circle cx="27" cy="29" r="10" fill={accent} /><circle cx="73" cy="29" r="10" fill={accent} />
      <circle cx="50" cy="51" r="28" fill={fur} />
      <ellipse cx="39" cy="51" rx="7.5" ry="9.5" transform="rotate(-28 39 51)" fill={accent} />
      <ellipse cx="61" cy="51" rx="7.5" ry="9.5" transform="rotate(28 61 51)" fill={accent} />
      <Eyes kind={d.eyes} y={51} gap={10} color="#fff" />
      <ellipse cx="50" cy="60" rx="4" ry="2.8" fill={accent} /><Smile y={64} w={3.5} /><Cheeks y={63} gap={20} />
    </g>;
    case 'bunny': return <g>
      <ellipse cx="38" cy="16" rx="7.5" ry="19" transform="rotate(-10 38 16)" fill={fur} />
      <ellipse cx="62" cy="16" rx="7.5" ry="19" transform="rotate(10 62 16)" fill={fur} />
      <ellipse cx="38" cy="17" rx="3.6" ry="13" transform="rotate(-10 38 17)" fill={accent} />
      <ellipse cx="62" cy="17" rx="3.6" ry="13" transform="rotate(10 62 17)" fill={accent} />
      <circle cx="50" cy="53" r="27" fill={fur} />
      <Eyes kind={d.eyes} y={53} /><Cheeks y={62} /><Nose y={58} color="#ff7aa2" w={2.6} />
      <path d="M50 61 v3" stroke={INK} strokeWidth="1.6" strokeLinecap="round" /><rect x="47.5" y="64" width="5" height="4.5" rx="1" fill="#fff" stroke={INK} strokeWidth="1" />
    </g>;
    case 'dog': return <g>
      <circle cx="50" cy="51" r="28" fill={fur} />
      <ellipse cx="25" cy="48" rx="9" ry="17" transform="rotate(18 25 48)" fill={accent} />
      <ellipse cx="75" cy="48" rx="9" ry="17" transform="rotate(-18 75 48)" fill={accent} />
      <ellipse cx="50" cy="62" rx="13" ry="10" fill="#fff" opacity=".85" />
      <Eyes kind={d.eyes} y={50} /><ellipse cx="50" cy="57" rx="5" ry="3.6" fill={INK} />
      <path d="M45 62 q5 4 10 0" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M48 64 q2 6 4 0" fill="#ff6f8f" />
    </g>;
    case 'frog': return <g>
      <circle cx="34" cy="34" r="12" fill={fur} /><circle cx="66" cy="34" r="12" fill={fur} />
      <ellipse cx="50" cy="56" rx="32" ry="24" fill={fur} />
      <circle cx="34" cy="34" r="8" fill="#fff" /><circle cx="66" cy="34" r="8" fill="#fff" />
      <Eyes kind={d.eyes} y={35} gap={16} />
      <ellipse cx="50" cy="66" rx="20" ry="9" fill={accent} opacity=".7" />
      <path d="M33 58 q17 12 34 0" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" /><Cheeks y={56} gap={24} />
    </g>;
    case 'penguin': return <g>
      <circle cx="50" cy="50" r="29" fill={fur} />
      <path d="M50 38 C40 28 24 38 28 54 C31 68 42 76 50 76 C58 76 69 68 72 54 C76 38 60 28 50 38 Z" fill={accent} />
      <Eyes kind={d.eyes} y={52} gap={10} /><path d="M45 59 h10 l-5 6 z" fill="#ff9a3d" strokeLinejoin="round" /><Cheeks y={62} gap={16} />
    </g>;
    case 'owl': return <g>
      <path d="M24 34 L28 14 L40 28 Z" fill={fur} /><path d="M76 34 L72 14 L60 28 Z" fill={fur} />
      <circle cx="50" cy="51" r="28" fill={fur} />
      <path d="M50 44 C42 70 30 72 30 72 C40 80 60 80 70 72 C70 72 58 70 50 44 Z" fill={accent} opacity=".6" />
      <circle cx="39" cy="47" r="10" fill="#ffd27a" /><circle cx="61" cy="47" r="10" fill="#ffd27a" />
      <circle cx="39" cy="47" r="7.5" fill="#fff" /><circle cx="61" cy="47" r="7.5" fill="#fff" />
      <Eyes kind={d.eyes} y={47} gap={11} /><path d="M46 56 h8 l-4 7 z" fill="#ff9a3d" />
    </g>;
    case 'chick': return <g>
      <path d="M46 24 q-2 -10 6 -10 M50 24 q4 -9 10 -5" stroke={fur} strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="50" cy="52" r="28" fill={fur} />
      <Eyes kind={d.eyes} y={50} gap={10} /><path d="M44 57 L50 53 L56 57 L50 62 Z" fill={accent} /><Cheeks y={60} gap={19} />
      <path d="M22 62 q-6 -8 2 -14" stroke={fur} strokeWidth="6" fill="none" strokeLinecap="round" />
    </g>;
    case 'dino': return <g>
      {[[30, 30], [40, 22], [50, 19], [60, 22], [70, 30]].map(([x, y]) => <path key={x} d={`M${x - 6} ${y + 6} L${x} ${y - 7} L${x + 6} ${y + 6} Z`} fill="#ffb84d" />)}
      <ellipse cx="50" cy="53" rx="29" ry="27" fill={fur} />
      <ellipse cx="50" cy="65" rx="19" ry="10" fill={accent} />
      <Eyes kind={d.eyes} y={48} gap={11} /><circle cx="45" cy="60" r="1.4" fill={INK} /><circle cx="55" cy="60" r="1.4" fill={INK} />
      <path d="M40 67 q10 7 20 0" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M43 67 l2 3 l2 -2.5 M53 67.5 l2 2.5 l2 -3" stroke="#fff" strokeWidth="1.6" fill="none" />
    </g>;
    case 'robot': return <g>
      <path d="M50 22 V12" stroke="#7a8db3" strokeWidth="3" strokeLinecap="round" /><circle cx="50" cy="10" r="4.5" fill="#ff4fa3" />
      <rect x="18" y="42" width="8" height="16" rx="3" fill="#7a8db3" /><rect x="74" y="42" width="8" height="16" rx="3" fill="#7a8db3" />
      <rect x="24" y="22" width="52" height="52" rx="16" fill={fur} />
      <rect x="31" y="36" width="38" height="22" rx="10" fill={INK} />
      <g fill={accent}><rect x="36" y="42" width="9" height="10" rx="4.5" /><rect x="55" y="42" width="9" height="10" rx="4.5" /></g>
      <g stroke="#7a8db3" strokeWidth="2" strokeLinecap="round"><path d="M40 66 h20M44 63 v6M50 63 v6M56 63 v6" /></g>
      <Cheeks y={62} gap={21} color="#ff6fa8" />
    </g>;
  }
}

function Accessory({ d }: { d: AvatarDef }) {
  const top = d.species === 'frog' ? 22 : 22;
  switch (d.acc) {
    case 'bow': return <g transform="translate(70 26) rotate(18)">
      <path d="M0 0 L-11 -7 L-11 7 Z M0 0 L11 -7 L11 7 Z" fill="#ff4f8b" stroke="#d92a6a" strokeWidth="1.2" strokeLinejoin="round" />
      <circle r="3.4" fill="#ff86b0" /></g>;
    case 'headphones': return <g>
      <path d="M22 50 C22 22 78 22 78 50" stroke="#3a3350" strokeWidth="5" fill="none" strokeLinecap="round" />
      <rect x="15" y="44" width="11" height="18" rx="5" fill="#ff4fa3" /><rect x="74" y="44" width="11" height="18" rx="5" fill="#ff4fa3" />
    </g>;
    case 'crown': return <g transform={`translate(50 ${top})`}>
      <path d="M-14 4 L-14 -10 L-7 -3 L0 -13 L7 -3 L14 -10 L14 4 Z" fill="#ffcf3f" stroke="#e59a00" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="0" cy="-1" r="2.4" fill="#ff4f8b" /></g>;
    case 'cap': return <g>
      <path d="M24 38 C24 16 76 16 76 38 Z" fill="#ff5f6d" />
      <path d="M50 38 C66 34 84 36 88 41 C76 44 60 42 50 41 Z" fill="#e2354a" />
      <circle cx="50" cy="20" r="2.6" fill="#e2354a" /></g>;
    case 'glasses': return <g stroke={INK} strokeWidth="2.2" fill="rgba(255,255,255,.25)">
      <circle cx="40" cy="51" r="8" /><circle cx="60" cy="51" r="8" /><path d="M48 51 h4" fill="none" /></g>;
    case 'flower': return <g transform="translate(71 28)">
      {[0, 72, 144, 216, 288].map(r => <ellipse key={r} cx="0" cy="-6" rx="4" ry="6" fill="#ff86b0" transform={`rotate(${r})`} />)}
      <circle r="3.6" fill="#ffcf3f" /></g>;
    case 'party': return <g transform="translate(50 24)">
      <path d="M-11 0 L0 -24 L11 0 Z" fill="#8f4bff" /><path d="M-7 -8 L7 -8 M-4 -15 L4 -15" stroke="#ffcf3f" strokeWidth="3" />
      <circle cy="-25" r="4" fill="#ffcf3f" /></g>;
    case 'star': return <g transform="translate(72 27) rotate(12)">
      <path d="M0 -9 L2.6 -2.8 L9 -2.8 L3.8 1.2 L5.6 7.6 L0 3.8 L-5.6 7.6 L-3.8 1.2 L-9 -2.8 L-2.6 -2.8 Z" fill="#ffcf3f" stroke="#e59a00" strokeWidth="1.2" strokeLinejoin="round" /></g>;
    default: return null;
  }
}

/** Kişinin avatarı: yeni SVG karakter ya da eski emoji. Kabın tamamını doldurur. */
export default function Avatar({ value, className }: { value?: string | null; className?: string }): ReactNode {
  const uid = useId().replace(/:/g, '');
  const d = value ? BY_ID.get(value) : undefined;
  if (!d) return <span className={`avatar-emoji ${className ?? ''}`}>{value || '🙂'}</span>;
  return (
    <svg className={`avatar-svg ${className ?? ''}`} viewBox="0 0 100 100" role="img" aria-label={d.name}>
      <defs>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={d.bg[0]} /><stop offset="1" stopColor={d.bg[1]} /></linearGradient>
        <clipPath id={`c${uid}`}><circle cx="50" cy="50" r="50" /></clipPath>
      </defs>
      <g clipPath={`url(#c${uid})`}>
        <rect width="100" height="100" fill={`url(#g${uid})`} />
        <circle cx="18" cy="20" r="14" fill="#fff" opacity=".18" />
        <ellipse cx="50" cy="104" rx="36" ry="24" fill={d.shirt} />
        <path d="M40 82 q10 6 20 0" stroke="#fff" strokeWidth="2.5" fill="none" opacity=".6" strokeLinecap="round" />
        <g transform="translate(0 2)"><Species d={d} /><Accessory d={d} /></g>
      </g>
    </svg>
  );
}
