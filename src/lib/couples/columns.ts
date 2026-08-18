import type { RetreatKind } from '@/generated/prisma/enums';
import { REGION_COUNT, ROMAN } from '@/lib/domain/regions';
import { DEGREES, retreatInfo } from '@/lib/domain/retreats';

export type SheetRow = {
  id: string;
  surname: string;
  wifeName: string;
  husbandName: string;
  email: string;
  phone: string;
  region: string;
  parish: string;
  circle: string;
  degrees: Record<RetreatKind, string>;
  other: string;
  children: string;
  notes: string;
};

/**
 * The single definition of the sheet layout. Export writes by it and import
 * reads by it, so the two cannot drift — the round trip is structural.
 *
 * Headers are Polish because a person reads them in Excel.
 */
export const COLUMNS: readonly { header: string; width: number }[] = [
  { header: 'ID', width: 8 },
  { header: 'Nazwisko', width: 20 },
  { header: 'Imię żony', width: 14 },
  { header: 'Imię męża', width: 14 },
  { header: 'E-mail', width: 28 },
  { header: 'Telefon', width: 17 },
  { header: 'Rejon', width: 8 },
  { header: 'Parafia', width: 30 },
  { header: 'Krąg', width: 20 },
  ...DEGREES.map((d) => ({ header: `${retreatInfo(d).code} (rok / miejsce)`, width: 26 })),
  { header: 'Inne rekolekcje', width: 34 },
  { header: 'Dzieci', width: 28 },
  { header: 'Notatki', width: 34 },
];

const DEGREES_START = 9;

export function rowToCells(row: SheetRow): string[] {
  return [
    row.id,
    row.surname, row.wifeName, row.husbandName,
    row.email, row.phone, row.region, row.parish, row.circle,
    ...DEGREES.map((d) => row.degrees[d] ?? ''),
    row.other, row.children, row.notes,
  ];
}

export function cellsToRow(cells: string[]): SheetRow {
  const at = (i: number) => cells[i] ?? '';
  return {
    id: at(0),
    surname: at(1), wifeName: at(2), husbandName: at(3),
    email: at(4), phone: at(5), region: at(6), parish: at(7), circle: at(8),
    degrees: Object.fromEntries(
      DEGREES.map((d, i) => [d, at(DEGREES_START + i)]),
    ) as Record<RetreatKind, string>,
    other: at(DEGREES_START + DEGREES.length),
    children: at(DEGREES_START + DEGREES.length + 1),
    notes: at(DEGREES_START + DEGREES.length + 2),
  };
}

export function formatDegreeCell(year: number, place: string | null): string {
  return place ? `${year} / ${place}` : String(year);
}

/** Splits on the first separator only, so a place may itself contain one. */
export function parseDegreeCell(text: string): { year: string; place: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const i = trimmed.indexOf('/');
  if (i === -1) return { year: trimmed, place: '' };
  return {
    year: trimmed.slice(0, i).trim(),
    place: trimmed.slice(i + 1).trim(),
  };
}

const OTHER_SEPARATOR = ' | ';

export function formatOtherCell(
  entries: { year: number; place: string | null; name: string | null }[],
): string {
  return entries
    .map((e) => `${e.name ?? ''}; ${e.year}; ${e.place ?? ''}`)
    .join(OTHER_SEPARATOR);
}

export function parseOtherCell(text: string): { name: string; year: string; place: string }[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.split('|').map((chunk) => {
    const [name = '', year = '', place = ''] = chunk.split(';');
    return { name: name.trim(), year: year.trim(), place: place.trim() };
  });
}

export function parseRegionCell(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const asNumber = Number(trimmed);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= REGION_COUNT) {
    return asNumber;
  }

  const upper = trimmed.toUpperCase();
  const index = ROMAN.findIndex((r) => r === upper);
  return index === -1 ? null : index + 1;
}

/** Splits on the last comma: parish names contain commas more often than cities. */
export function parseParishCell(text: string): { name: string; city: string } | null {
  const trimmed = text.trim();
  const i = trimmed.lastIndexOf(',');
  if (i === -1) return null;
  const name = trimmed.slice(0, i).trim();
  const city = trimmed.slice(i + 1).trim();
  return name && city ? { name, city } : null;
}

export function parseCircleCell(text: string): { number: number; patron: string | null } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = /^(\d+)\s*(?:[·\-–—]\s*(.*))?$/.exec(trimmed);
  if (!match) return null;
  const patron = (match[2] ?? '').trim();
  return { number: Number(match[1]), patron: patron || null };
}
