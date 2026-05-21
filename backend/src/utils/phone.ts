export function toE164(ddd: string, number: string, country = '55'): string | null {
  const d = String(ddd || '').replace(/\D/g, '');
  let n = String(number || '').replace(/\D/g, '');
  if (!d || !n) return null;
  if (n.length >= 10 && n.startsWith(country)) return n;
  if (n.length === 8 || (n.length === 9 && n[0] === '9')) {
    return `${country}${d}${n}`;
  }
  return `${country}${d}${n}`;
}

export function e164ToWhatsAppJid(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

export function isEmailIdentifier(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
