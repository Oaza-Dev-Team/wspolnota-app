import ExcelJS from 'exceljs';
import { Forbidden, type User, canEdit, canImport } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { DEGREES } from '@/lib/domain/retreats';
import {
  COLUMNS, cellsToRow, parseCircleCell, parseDegreeCell, parseOtherCell,
  parseParishCell, parseRegionCell,
} from './columns';
import { createCouple, updateCouple } from './save';
import { type SaveInput, saveSchema } from './schema';

export type ImportIssue = { row: number; message: string };

export type PreparedRow = {
  rowNumber: number;
  coupleId: bigint | null;
  data: SaveInput;
};

export type ImportPlan = {
  toCreate: PreparedRow[];
  toUpdate: PreparedRow[];
  issues: ImportIssue[];
};

/**
 * exceljs declares its own Buffer type, which TypeScript does not consider
 * identical to Node's Buffer<ArrayBufferLike>. The bytes are the same.
 */
function asExcelBuffer(buffer: Buffer): Parameters<ExcelJS.Xlsx['load']>[0] {
  return buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0];
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in value) return String(value.text);
  if (typeof value === 'object' && 'result' in value) return String(value.result ?? '');
  if (typeof value === 'object' && 'richText' in value) {
    return value.richText.map((r) => r.text).join('');
  }
  return String(value);
}

/**
 * Reads the workbook and decides what would happen, without touching the
 * database. The preview the user confirms is exactly this plan.
 */
export async function analyzeWorkbook(u: User, buffer: Buffer): Promise<ImportPlan> {
  if (!canImport(u)) throw new Forbidden('Import jest dostępny tylko dla administratora');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(asExcelBuffer(buffer));
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { toCreate: [], toUpdate: [], issues: [{ row: 0, message: 'Pusty plik' }] };
  }

  const plan: ImportPlan = { toCreate: [], toUpdate: [], issues: [] };

  // Row 1 is the header, so data starts at 2 and issue rows carry sheet numbers.
  for (let n = 2; n <= sheet.rowCount; n++) {
    const sheetRow = sheet.getRow(n);
    const cells = COLUMNS.map((_, i) => cellText(sheetRow.getCell(i + 1).value).trim());
    if (cells.every((c) => c === '')) continue;

    const row = cellsToRow(cells);
    const issue = (message: string) => plan.issues.push({ row: n, message });

    const regionId = parseRegionCell(row.region);
    if (regionId === null) {
      issue(`Nieznany rejon: „${row.region}"`);
      continue;
    }

    if (!canEdit(u, { regionId })) {
      issue(`Nie masz uprawnień do rejonu ${row.region}`);
      continue;
    }

    let coupleId: bigint | null = null;
    if (row.id !== '') {
      if (!/^\d+$/.test(row.id)) {
        issue(`Niepoprawne ID: „${row.id}"`);
        continue;
      }
      const existing = await prisma.couple.findFirst({
        where: { id: BigInt(row.id), deletedAt: null },
        select: { id: true, regionId: true },
      });
      if (!existing) {
        issue(`Para o ID ${row.id} nie istnieje`);
        continue;
      }
      if (!canEdit(u, { regionId: existing.regionId })) {
        issue(`Nie masz uprawnień do pary o ID ${row.id}`);
        continue;
      }
      coupleId = existing.id;
    }

    const retreats: SaveInput['retreats'] = [];
    let entryProblem = false;

    for (const degree of DEGREES) {
      const parsed = parseDegreeCell(row.degrees[degree] ?? '');
      if (!parsed) continue;
      const year = Number(parsed.year);
      if (!Number.isInteger(year)) {
        issue(`Niepoprawny rok w kolumnie ${degree}: „${parsed.year}"`);
        entryProblem = true;
        continue;
      }
      retreats.push({ kind: degree, year, place: parsed.place, name: '' });
    }

    for (const other of parseOtherCell(row.other)) {
      const year = Number(other.year);
      if (!Number.isInteger(year)) {
        issue(`Niepoprawny rok w „Inne rekolekcje": „${other.year}"`);
        entryProblem = true;
        continue;
      }
      if (!other.name) {
        issue('Wpis w „Inne rekolekcje" bez nazwy');
        entryProblem = true;
        continue;
      }
      retreats.push({ kind: 'INNE', year, place: other.place, name: other.name });
    }

    if (entryProblem) continue;

    const parish = parseParishCell(row.parish);
    const circle = parseCircleCell(row.circle);

    if (circle && !parish) {
      issue('Krąg podany bez parafii — nowy krąg musi wiedzieć, do której parafii należy');
      continue;
    }

    const parsed = saveSchema.safeParse({
      couple: {
        wifeName: row.wifeName,
        husbandName: row.husbandName,
        surname: row.surname,
        email: row.email,
        phone: row.phone,
        regionId,
        circleId: null,
        // Null parishId means "the parish this same save creates" — see save.ts.
        newCircle: circle
          ? { number: circle.number, patron: circle.patron ?? '', parishId: null }
          : null,
        parishId: null,
        newParish: parish,
        children: row.children,
        notes: row.notes,
      },
      retreats,
    });

    if (!parsed.success) {
      issue(parsed.error.issues[0]?.message ?? 'Niepoprawne dane w wierszu');
      continue;
    }

    // With no ID column the row still has to be recognised, or importing the
    // same file twice would double every couple. Identity is both first names
    // plus the surname, inside one region.
    let matchedId = coupleId;
    if (matchedId === null) {
      const c = parsed.data.couple;
      const matches = await prisma.couple.findMany({
        where: {
          deletedAt: null,
          regionId: c.regionId,
          surname: { equals: c.surname, mode: 'insensitive' },
          wifeName: { equals: c.wifeName, mode: 'insensitive' },
          husbandName: { equals: c.husbandName, mode: 'insensitive' },
        },
        select: { id: true },
        take: 2,
      });

      // Two couples with the same names in one region is rare but possible.
      // Guessing which one the row means would silently overwrite a family's
      // record, so the row is refused and the user points with an ID instead.
      if (matches.length > 1) {
        issue(
          'Więcej niż jedna para o tych imionach i nazwisku w tym rejonie — '
          + 'wskaż konkretną kolumną ID',
        );
        continue;
      }
      if (matches.length === 1) matchedId = matches[0]!.id;
    }

    const prepared: PreparedRow = { rowNumber: n, coupleId: matchedId, data: parsed.data };
    if (matchedId === null) plan.toCreate.push(prepared);
    else plan.toUpdate.push(prepared);
  }

  return plan;
}

export async function applyImport(
  u: User,
  plan: ImportPlan,
): Promise<{ created: number; updated: number }> {
  if (!canImport(u)) throw new Forbidden('Import jest dostępny tylko dla administratora');
  if (plan.issues.length > 0) {
    throw new Error('Plan importu zawiera błędy — popraw plik i wgraj ponownie');
  }

  // Row by row through the same write layer the form uses, so the audit trail
  // and the permission checks are identical to a manual edit.
  for (const row of plan.toCreate) {
    await createCouple(u, row.data);
  }
  for (const row of plan.toUpdate) {
    await updateCouple(u, row.coupleId!, row.data);
  }

  return { created: plan.toCreate.length, updated: plan.toUpdate.length };
}

export async function templateWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kartoteka DK';

  const sheet = workbook.addWorksheet('Kartoteka');
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
