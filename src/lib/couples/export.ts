import ExcelJS from 'exceljs';
import type { RetreatKind } from '@/generated/prisma/enums';
import type { User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { romanNumeral } from '@/lib/domain/regions';
import { DEGREES } from '@/lib/domain/retreats';
import {
  COLUMNS, type SheetRow, formatDegreeCell, formatOtherCell, rowToCells,
} from './columns';
import type { Filters } from './filters';
import { whereForExport } from './queries';

function circleLabel(number: number, patron: string | null): string {
  return patron ? `${number} · ${patron}` : String(number);
}

/**
 * Every matching couple, not one page: the checklist requires the export to
 * cover the filtered list. Scope comes from the same whereForExport as the
 * list, so a region account cannot widen it through the query string.
 */
export async function exportRows(u: User, f: Filters): Promise<SheetRow[]> {
  const records = await prisma.couple.findMany({
    where: whereForExport(u, f),
    orderBy: [{ surname: 'asc' }, { wifeName: 'asc' }],
    select: {
      id: true, surname: true, wifeName: true, husbandName: true,
      email: true, phone: true, regionId: true, children: true, notes: true,
      parish: { select: { name: true, city: true } },
      circle: {
        select: {
          number: true, patron: true,
          parish: { select: { name: true, city: true } },
        },
      },
      retreats: { select: { kind: true, year: true, place: true, name: true } },
    },
  });

  return records.map((r) => {
    const parish = r.parish ?? r.circle?.parish ?? null;

    const degrees = Object.fromEntries(DEGREES.map((d) => [d, ''])) as Record<RetreatKind, string>;
    for (const entry of r.retreats) {
      if (entry.kind === 'INNE') continue;
      degrees[entry.kind] = formatDegreeCell(entry.year, entry.place);
    }

    return {
      id: String(r.id),
      surname: r.surname,
      wifeName: r.wifeName,
      husbandName: r.husbandName,
      email: r.email ?? '',
      phone: r.phone ?? '',
      region: romanNumeral(r.regionId),
      parish: parish ? `${parish.name}, ${parish.city}` : '',
      circle: r.circle ? circleLabel(r.circle.number, r.circle.patron) : '',
      degrees,
      other: formatOtherCell(r.retreats.filter((e) => e.kind === 'INNE')),
      children: r.children ?? '',
      notes: r.notes ?? '',
    };
  });
}

export async function buildWorkbook(rows: SheetRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kartoteka DK';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Kartoteka');
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));

  sheet.getRow(1).font = { bold: true };
  // The header stays visible while scrolling three hundred rows.
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of rows) {
    sheet.addRow(rowToCells(row));
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function exportFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `kartoteka-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.xlsx`;
}
