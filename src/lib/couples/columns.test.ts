import { describe, expect, it } from 'vitest';
import { DEGREES } from '@/lib/domain/retreats';
import {
  COLUMNS, cellsToRow, formatDegreeCell, formatOtherCell, parseCircleCell,
  parseDegreeCell, parseOtherCell, parseParishCell, parseRegionCell, rowToCells,
} from './columns';

const row = {
  id: '42',
  surname: 'Kowalscy', wifeName: 'Anna', husbandName: 'Piotr',
  email: 'k@example.pl', phone: '+48 601 202 303',
  region: 'VII', parish: 'św. Brygidy, Gdańsk', circle: '3 · św. Rity',
  degrees: Object.fromEntries(DEGREES.map((d) => [d, ''])) as Record<string, string>,
  other: '', children: 'Marysia 2014', notes: '',
};

describe('COLUMNS', () => {
  // ID + 8 base + 7 degrees + other + children + notes.
  it('has one column per field in the agreed order', () => {
    expect(COLUMNS).toHaveLength(1 + 8 + DEGREES.length + 3);
    expect(COLUMNS[0]!.header).toBe('ID');
    expect(COLUMNS[1]!.header).toBe('Nazwisko');
    expect(COLUMNS.at(-1)!.header).toBe('Notatki');
  });

  it('labels the degree columns with their UI codes', () => {
    const headers = COLUMNS.map((c) => c.header);
    expect(headers).toContain('ONŻ I (rok / miejsce)');
    expect(headers).toContain('ORD (rok / miejsce)');
  });
});

describe('rowToCells / cellsToRow', () => {
  it('round-trips a row through the cell array', () => {
    expect(cellsToRow(rowToCells(row))).toEqual(row);
  });

  it('emits exactly one cell per column', () => {
    expect(rowToCells(row)).toHaveLength(COLUMNS.length);
  });
});

describe('formatDegreeCell / parseDegreeCell', () => {
  it('writes year and place separated by a slash', () => {
    expect(formatDegreeCell(2014, 'Krościenko')).toBe('2014 / Krościenko');
  });

  it('writes the year alone when there is no place', () => {
    expect(formatDegreeCell(2014, null)).toBe('2014');
  });

  it('reads both shapes back', () => {
    expect(parseDegreeCell('2014 / Krościenko')).toEqual({ year: '2014', place: 'Krościenko' });
    expect(parseDegreeCell('2014')).toEqual({ year: '2014', place: '' });
  });

  it('treats a blank cell as no entry', () => {
    expect(parseDegreeCell('')).toBeNull();
    expect(parseDegreeCell('   ')).toBeNull();
  });

  it('keeps a place that itself contains a slash', () => {
    // Splits on the first separator only.
    expect(parseDegreeCell('2014 / Kraków / Nowa Huta'))
      .toEqual({ year: '2014', place: 'Kraków / Nowa Huta' });
  });
});

describe('formatOtherCell / parseOtherCell', () => {
  it('joins several entries with a pipe', () => {
    expect(formatOtherCell([
      { year: 2019, place: 'Chmielno', name: 'Ewangelizacyjne' },
      { year: 2021, place: null, name: 'Sesja' },
    ])).toBe('Ewangelizacyjne; 2019; Chmielno | Sesja; 2021; ');
  });

  it('reads them back', () => {
    expect(parseOtherCell('Ewangelizacyjne; 2019; Chmielno | Sesja; 2021; ')).toEqual([
      { name: 'Ewangelizacyjne', year: '2019', place: 'Chmielno' },
      { name: 'Sesja', year: '2021', place: '' },
    ]);
  });

  it('returns nothing for a blank cell', () => {
    expect(parseOtherCell('')).toEqual([]);
  });
});

describe('parseRegionCell', () => {
  it('accepts Roman numerals and plain numbers', () => {
    expect(parseRegionCell('VII')).toBe(7);
    expect(parseRegionCell('7')).toBe(7);
    expect(parseRegionCell(' vii ')).toBe(7);
  });

  it('rejects anything outside the range', () => {
    expect(parseRegionCell('XII')).toBeNull();
    expect(parseRegionCell('0')).toBeNull();
    expect(parseRegionCell('')).toBeNull();
    expect(parseRegionCell('ala')).toBeNull();
  });
});

describe('parseParishCell', () => {
  it('splits on the last comma, so a name may contain one', () => {
    expect(parseParishCell('św. Brygidy, Gdańsk'))
      .toEqual({ name: 'św. Brygidy', city: 'Gdańsk' });
    expect(parseParishCell('NMP Królowej Polski, Gdynia'))
      .toEqual({ name: 'NMP Królowej Polski', city: 'Gdynia' });
  });

  it('returns null when there is no comma or the cell is blank', () => {
    expect(parseParishCell('Gdańsk')).toBeNull();
    expect(parseParishCell('')).toBeNull();
  });
});

describe('parseCircleCell', () => {
  it('reads number and patron', () => {
    expect(parseCircleCell('3 · św. Rity')).toEqual({ number: 3, patron: 'św. Rity' });
    expect(parseCircleCell('3 - św. Rity')).toEqual({ number: 3, patron: 'św. Rity' });
  });

  it('reads a bare number', () => {
    expect(parseCircleCell('3')).toEqual({ number: 3, patron: null });
  });

  it('returns null for a blank or unparseable cell', () => {
    expect(parseCircleCell('')).toBeNull();
    expect(parseCircleCell('św. Rity')).toBeNull();
  });
});
