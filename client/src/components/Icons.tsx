// Uygulama genelinde kullanılan basit çizgi ikonlar (currentColor ile boyanır).
type P = { size?: number; className?: string };
const base = (size = 24) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

export const IconHome = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></svg>
);
export const IconUsers = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.8c2 .7 3.2 2.5 3.5 5.2" /></svg>
);
export const IconUser = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5" /></svg>
);
export const IconPlus = ({ size, className }: P) => (
  <svg {...base(size)} className={className} strokeWidth={3}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconBack = ({ size, className }: P) => (
  <svg {...base(size)} className={className} strokeWidth={2.6}><path d="M15 5l-7 7 7 7" /></svg>
);
export const IconMic = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
export const IconMicOff = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M15 9.5V6a3 3 0 0 0-5.8-1M9 9v2a3 3 0 0 0 4.6 2.5" /><path d="M5 11a7 7 0 0 0 11.2 5.6M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18" /></svg>
);
export const IconGift = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7M12 8v13" /><path d="M12 8S10.5 3 8 4.2 9 8 12 8zM12 8s1.5-5 4-3.8S15 8 12 8z" /></svg>
);
export const IconSend = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M21 3 10 14" /><path d="M21 3l-6.5 18-4.5-7-7-4.5z" /></svg>
);
export const IconSeatDown = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
);
export const IconSearch = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const IconChevron = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="m9 5 7 7-7 7" /></svg>
);
export const IconSofa = ({ size, className }: P) => (
  <svg {...base(size)} className={className} strokeWidth={1.8}><path d="M6 11V8a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3" /><path d="M4 11a2 2 0 0 1 2 2v2h12v-2a2 2 0 1 1 2 2v3H4v-3a2 2 0 0 1 0-4zM7 18v2M17 18v2" /></svg>
);
export const IconLock = ({ size, className }: P) => (
  <svg {...base(size)} className={className} strokeWidth={2}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
