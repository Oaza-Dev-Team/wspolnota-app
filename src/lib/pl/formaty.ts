export function formatDaty(d: Date): string {
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
export function formatTelefonu(t: string): string {
  const cyfry = t.replace(/[\s-]/g, '').replace(/^\+/, '');
  const krajowy = cyfry.startsWith('48') ? cyfry.slice(2) : cyfry;
  if (!/^\d{9}$/.test(krajowy)) return t;
  return `+48 ${krajowy.slice(0, 3)} ${krajowy.slice(3, 6)} ${krajowy.slice(6)}`;
}
