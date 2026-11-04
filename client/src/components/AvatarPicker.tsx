import Avatar, { AVATAR_LIST } from './Avatar';

/** Karakter seçici: büyük önizleme + ızgara. */
export function AvatarPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const cur = AVATAR_LIST.find(a => a.id === value);
  return (
    <div className="avatar-picker">
      <div className="ap-preview">
        <span className="ap-big" key={value}><Avatar value={value} /></span>
        <b>{cur?.name ?? 'Eski avatarın'}</b>
      </div>
      <div className="avatar-grid">
        {AVATAR_LIST.map(a => (
          <button type="button" key={a.id} className={a.id === value ? 'on' : ''} onClick={() => onChange(a.id)} aria-label={a.name} title={a.name}>
            <Avatar value={a.id} />
          </button>
        ))}
      </div>
    </div>
  );
}
