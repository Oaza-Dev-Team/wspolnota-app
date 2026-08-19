import ExcelJS from 'exceljs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Forbidden, type User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { COLUMNS } from './columns';
import { analyzeWorkbook, applyImport, templateWorkbook } from './import';

function asExcelBuffer(buffer: Buffer): Parameters<ExcelJS.Xlsx['load']>[0] {
  return buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0];
}

let admin: User;
let regionVII: User;

beforeAll(async () => {
  const byEmail = async (email: string): Promise<User> => {
    const a = await prisma.account.findUniqueOrThrow({ where: { email } });
    return { id: a.id, role: a.role, regionId: a.regionId };
  };
  admin = await byEmail('admin@example.pl');
  regionVII = await byEmail('rejon7@example.pl');
});

afterEach(async () => {
  const strays = await prisma.couple.findMany({
    where: { surname: { startsWith: 'Importowani' } },
    select: { id: true },
  });
  const ids = strays.map((s) => s.id);
  if (ids.length) {
    await prisma.retreat.deleteMany({ where: { coupleId: { in: ids } } });
    await prisma.audit.deleteMany({ where: { coupleId: { in: ids } } });
    await prisma.couple.deleteMany({ where: { id: { in: ids } } });
  }
});

/** Builds a workbook in memory with the given data rows. */
async function sheetWith(rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Kartoteka');
  sheet.addRow(COLUMNS.map((c) => c.header));
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** A valid row: ID blank, surname, names, region VII, everything else empty. */
function validRow(surname: string, overrides: Record<number, string> = {}): string[] {
  const cells: string[] = new Array(COLUMNS.length).fill('');
  cells[1] = surname;
  cells[2] = 'Zofia';
  cells[3] = 'Jan';
  cells[6] = 'VII';
  for (const [i, v] of Object.entries(overrides)) cells[Number(i)] = v;
  return cells;
}

describe('analyzeWorkbook', () => {
  it('plans a create for a row with no ID', async () => {
    const plan = await analyzeWorkbook(admin, await sheetWith([validRow('Importowani1')]));
    expect(plan.issues).toEqual([]);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it('plans an update for a row whose ID exists', async () => {
    const existing = await prisma.couple.findFirstOrThrow({ where: { deletedAt: null } });
    const plan = await analyzeWorkbook(
      admin,
      await sheetWith([validRow('Importowani2', { 0: String(existing.id) })]),
    );
    expect(plan.issues).toEqual([]);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0]!.coupleId).toBe(existing.id);
  });

  it('reports the row number with every problem', async () => {
    const plan = await analyzeWorkbook(
      admin,
      await sheetWith([validRow('Importowani3'), validRow('')]),
    );
    expect(plan.issues).toHaveLength(1);
    // Row 1 is the header, so the second data row is sheet row 3.
    expect(plan.issues[0]!.row).toBe(3);
    expect(plan.issues[0]!.message).toContain('nazwisko');
  });

  it('rejects an unknown region', async () => {
    const plan = await analyzeWorkbook(
      admin,
      await sheetWith([validRow('Importowani4', { 6: 'XII' })]),
    );
    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0]!.message).toContain('rejon');
  });

  it('rejects an ID that does not exist', async () => {
    const plan = await analyzeWorkbook(
      admin,
      await sheetWith([validRow('Importowani5', { 0: '999999999' })]),
    );
    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0]!.message).toContain('nie istnieje');
  });

  it('reads the degree columns into retreat entries', async () => {
    const plan = await analyzeWorkbook(
      admin,
      await sheetWith([validRow('Importowani6', { 9: '2014 / Krościenko' })]),
    );
    expect(plan.issues).toEqual([]);
    expect(plan.toCreate[0]!.data.retreats).toEqual([
      { kind: 'ONZ_I', year: 2014, place: 'Krościenko', name: null },
    ]);
  });

  it('reads the other-retreats column', async () => {
    const plan = await analyzeWorkbook(
      admin,
      await sheetWith([validRow('Importowani7', { 16: 'Ewangelizacyjne; 2019; Chmielno' })]),
    );
    expect(plan.issues).toEqual([]);
    expect(plan.toCreate[0]!.data.retreats).toEqual([
      { kind: 'INNE', year: 2019, place: 'Chmielno', name: 'Ewangelizacyjne' },
    ]);
  });

  it('skips entirely blank rows rather than reporting them', async () => {
    const blank: string[] = new Array(COLUMNS.length).fill('');
    const plan = await analyzeWorkbook(
      admin,
      await sheetWith([validRow('Importowani8'), blank]),
    );
    expect(plan.issues).toEqual([]);
    expect(plan.toCreate).toHaveLength(1);
  });

  // Import is admin-only, so a region account never reaches the row checks.
  // The per-row canEdit guard stays as defence in depth for the day that changes.
  it('refuses a region account outright', async () => {
    await expect(
      analyzeWorkbook(regionVII, await sheetWith([validRow('Importowani9')])),
    ).rejects.toThrow(Forbidden);
  });

  it('refuses a circle given without a parish', async () => {
    const plan = await analyzeWorkbook(
      admin,
      await sheetWith([validRow('Importowani12', { 8: '4 · św. Rity' })]),
    );
    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0]!.message).toContain('parafii');
  });
});

describe('analyzeWorkbook — recognising couples without an ID', () => {
  it('updates an existing couple instead of creating a second one', async () => {
    // First pass creates it.
    const first = await analyzeWorkbook(admin, await sheetWith([validRow('Importowani Bis')]));
    await applyImport(admin, first);

    // Second pass of the very same file must recognise it.
    const second = await analyzeWorkbook(admin, await sheetWith([validRow('Importowani Bis')]));
    expect(second.toCreate).toHaveLength(0);
    expect(second.toUpdate).toHaveLength(1);

    await applyImport(admin, second);
    expect(await prisma.couple.count({ where: { surname: 'Importowani Bis' } })).toBe(1);
  });

  it('matches regardless of letter case', async () => {
    await applyImport(admin, await analyzeWorkbook(admin, await sheetWith([validRow('Importowani Case')])));

    const lower = validRow('importowani case');
    lower[2] = 'zofia';
    const plan = await analyzeWorkbook(admin, await sheetWith([lower]));
    expect(plan.toUpdate).toHaveLength(1);
  });

  it('treats a different region as a different couple', async () => {
    await applyImport(admin, await analyzeWorkbook(admin, await sheetWith([validRow('Importowani Rejon')])));

    const elsewhere = validRow('Importowani Rejon', { 6: 'III' });
    const plan = await analyzeWorkbook(admin, await sheetWith([elsewhere]));
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it('treats different first names as a different couple', async () => {
    await applyImport(admin, await analyzeWorkbook(admin, await sheetWith([validRow('Importowani Imiona')])));

    const otherNames = validRow('Importowani Imiona', { 2: 'Barbara' });
    const plan = await analyzeWorkbook(admin, await sheetWith([otherNames]));
    expect(plan.toCreate).toHaveLength(1);
  });

  // Overwriting the wrong family's record is worse than refusing the row.
  it('refuses the row when two couples share the names, rather than guessing', async () => {
    const twice = [validRow('Importowani Blizniacy'), validRow('Importowani Blizniacy')];
    // Applying two identical rows in one file would already collapse to one,
    // so the pair is planted directly.
    await prisma.couple.createMany({
      data: [
        { surname: 'Importowani Blizniacy', wifeName: 'Zofia', husbandName: 'Jan', regionId: 7 },
        { surname: 'Importowani Blizniacy', wifeName: 'Zofia', husbandName: 'Jan', regionId: 7 },
      ],
    });

    const plan = await analyzeWorkbook(admin, await sheetWith([twice[0]!]));
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.issues[0]!.message).toContain('Więcej niż jedna para');
  });

  it('ignores a soft-deleted couple when matching', async () => {
    await applyImport(admin, await analyzeWorkbook(admin, await sheetWith([validRow('Importowani Kosz')])));
    await prisma.couple.updateMany({
      where: { surname: 'Importowani Kosz' },
      data: { deletedAt: new Date() },
    });

    // The record is in the bin, so the row describes a couple that is not there.
    const plan = await analyzeWorkbook(admin, await sheetWith([validRow('Importowani Kosz')]));
    expect(plan.toCreate).toHaveLength(1);
  });
});

describe('applyImport', () => {
  it('creates the planned couples and records the audit', async () => {
    const plan = await analyzeWorkbook(
      admin,
      await sheetWith([validRow('Importowani10'), validRow('Importowani11')]),
    );
    const before = await prisma.audit.count({ where: { kind: 'create' } });

    const result = await applyImport(admin, plan);

    expect(result).toEqual({ created: 2, updated: 0 });
    expect(await prisma.couple.count({
      where: { surname: { startsWith: 'Importowani' }, deletedAt: null },
    })).toBe(2);
    expect(await prisma.audit.count({ where: { kind: 'create' } })).toBe(before + 2);
  });

  it('creates the parish and circle a row introduces', async () => {
    const plan = await analyzeWorkbook(admin, await sheetWith([
      validRow('Importowani13', { 7: 'św. Testowa, Testowo', 8: '77 · św. Testowej' }),
    ]));
    expect(plan.issues).toEqual([]);
    await applyImport(admin, plan);

    const couple = await prisma.couple.findFirstOrThrow({
      where: { surname: 'Importowani13' },
      select: { circle: { select: { number: true, parish: { select: { name: true } } } } },
    });
    expect(couple.circle!.number).toBe(77);
    expect(couple.circle!.parish.name).toBe('św. Testowa');

    await prisma.circle.deleteMany({ where: { number: 77, regionId: 7 } });
    await prisma.parish.deleteMany({ where: { name: 'św. Testowa' } });
  });

  it('refuses to apply a plan that still has issues', async () => {
    const plan = await analyzeWorkbook(admin, await sheetWith([validRow('')]));
    await expect(applyImport(admin, plan)).rejects.toThrow();
  });
});

describe('templateWorkbook', () => {
  it('contains the headers and no data rows', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(asExcelBuffer(await templateWorkbook()));
    const sheet = workbook.worksheets[0]!;

    expect(sheet.rowCount).toBe(1);
    const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
    expect(headers).toEqual(COLUMNS.map((c) => c.header));
  });
});
