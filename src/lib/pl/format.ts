export function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Normalises Polish phone numbers to "+48 XXX XXX XXX". Anything that is not
 * nine digits (optionally prefixed with 48) is returned unchanged — the field
 * is free text and users occasionally record extensions or notes.
 */
export function formatPhone(t: string): string {
  const digits = t.replace(/[\s-]/g, '').replace(/^\+/, '');
  const national = digits.startsWith('48') ? digits.slice(2) : digits;
  if (!/^\d{9}$/.test(national)) return t;
  return `+48 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}
