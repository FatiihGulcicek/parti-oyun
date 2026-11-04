import { describe, it, expect } from 'vitest';
import { activeTheme, inRange, THEMES } from './themes';

const d = (s: string) => new Date(`${s}T12:00:00`);

describe('temalar', () => {
  it('kimlikler tekrarsız, varsayılan ilk sırada', () => {
    expect(new Set(THEMES.map(t => t.id)).size).toBe(THEMES.length);
    expect(THEMES[0].id).toBe('default');
  });

  it('tarih aralığı: yıl dönümü ve sabit yıl', () => {
    expect(inRange('12-20', '01-02', d('2026-12-31'))).toBe(true);
    expect(inRange('12-20', '01-02', d('2027-01-02'))).toBe(true);
    expect(inRange('12-20', '01-02', d('2027-01-03'))).toBe(false);
    expect(inRange('2027-03-09', '2027-03-11', d('2027-03-10'))).toBe(true);
    expect(inRange('2027-03-09', '2027-03-11', d('2028-03-10'))).toBe(false);
  });

  it('otomatik mod özel günü seçer', () => {
    expect(activeTheme(null, d('2026-12-25')).id).toBe('yilbasi');
    expect(activeTheme(null, d('2026-10-29')).id).toBe('ekim29');
    expect(activeTheme(null, d('2026-10-31')).id).toBe('cadilar');
    expect(activeTheme(null, d('2027-05-19')).id).toBe('mayis19');
    expect(activeTheme(null, d('2027-04-23')).id).toBe('nisan23');
    expect(activeTheme(null, d('2027-02-14')).id).toBe('sevgililer');
    expect(activeTheme(null, d('2026-11-04')).id).toBe('default');
  });

  it('panel ayarları: kapatma, tarih değiştirme, elle seçim', () => {
    expect(activeTheme({ mode: 'auto', active: 'default', schedule: { yilbasi: { enabled: false } } }, d('2026-12-25')).id).toBe('default');
    expect(activeTheme({ mode: 'auto', active: 'default', schedule: { ramazan: { from: '2026-11-03', to: '2026-11-05' } } }, d('2026-11-04')).id).toBe('ramazan');
    expect(activeTheme({ mode: 'manual', active: 'cadilar', schedule: {} }, d('2026-12-25')).id).toBe('cadilar');
    expect(activeTheme({ mode: 'manual', active: 'yok-boyle', schedule: {} }).id).toBe('default');
  });
});
