import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { COLUMNS } from './columns';
import { buildWorkbook, exportFileName, exportRows } from './export';
import { parseFilters } from './filters';

/**
 * exceljs declares its own Buffer type, which TypeScript does not consider
 * identical to Node's Buffer<ArrayBufferLike>. The bytes are the same; only
 * the declaration differs.
 */
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

afterAll(async () => {
  await prisma.$disconnect();
});

describe('exportRows', () => {
  // The checklist requires the export to cover the filtered list, not one page.
  it('returns every matching couple, not just the first page', async () => {
    const rows = await exportRows(admin, parseFilters({}));
    expect(rows).toHaveLength(300);
  });

  it('respects the filters', async () => {
    const rows = await exportRows(admin, parseFilters({ region: '3' }));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(300);
    expect(rows.every((r) => r.region === 'III')).toBe(true);
  });

  // Scope is not a filter the user can widen.
  it('narrows a region account to its own region even without a filter', async () => {
    const rows = await exportRows(regionVII, parseFilters({}));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.region === 'VII')).toBe(true);
  });

  it('ignores a region filter pointing outside the account scope', async () => {
    const rows = await exportRows(regionVII, parseFilters({ region: '3' }));
    expect(rows.every((r) => r.region === 'VII')).toBe(true);
  });

  it('fills the degree columns from the retreat entries', async () => {
    const rows = await exportRows(admin, parseFilters({ formation: 'ONZ_I' }));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.degrees.ONZ_I !== '')).toBe(true);
  });

  it('leaves the degree columns blank for a couple with no entries', async () => {
    const rows = await exportRows(admin, parseFilters({ formation: 'none' }));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.degrees.ONZ_I).toBe('');
    expect(rows[0]!.other).toBe('');
  });
});

describe('buildWorkbook', () => {
  it('writes a real xlsx that reads back with the expected shape', async () => {
    const rows = await exportRows(admin, parseFilters({ region: '3' }));
    const buffer = await buildWorkbook(rows);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(asExcelBuffer(buffer));
    const sheet = workbook.worksheets[0]!;

    // Header row plus one row per couple.
    expect(sheet.rowCount).toBe(rows.length + 1);

    const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
    expect(headers).toEqual(COLUMNS.map((c) => c.header));
  });

  it('starts with the zip signature of an xlsx, not text', async () => {
    const buffer = await buildWorkbook(await exportRows(admin, parseFilters({ region: '3' })));
    // "PK" — an xlsx is a zip container. A CSV renamed to .xlsx would not be.
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('keeps Polish characters intact through a round trip', async () => {
    const rows = await exportRows(admin, parseFilters({ q: 'Bagińscy' }));
    expect(rows.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(asExcelBuffer(await buildWorkbook(rows)));
    const sheet = workbook.worksheets[0]!;

    const surnames: string[] = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
      surnames.push(String(sheet.getRow(i).getCell(2).value ?? ''));
    }
    expect(surnames.every((s) => s === 'Bagińscy')).toBe(true);
  });
});

describe('exportFileName', () => {
  it('carries the date so downloads do not collide', () => {
    expect(exportFileName(new Date('2026-08-19T21:12:00'))).toBe('kartoteka-2026-08-19.xlsx');
  });
});
