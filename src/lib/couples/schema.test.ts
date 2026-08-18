import { describe, expect, it } from 'vitest';
import { coupleSchema, retreatSchema, saveSchema } from './schema';

const validCouple = {
  wifeName: 'Anna', husbandName: 'Piotr', surname: 'Kowalscy',
  email: 'kowalscy@example.pl', phone: '+48 601 202 303',
  regionId: 7, circleId: '12', newCircle: null, parishId: '3', newParish: null,
  children: 'Marysia 2014', notes: '',
};

describe('coupleSchema', () => {
  it('accepts a fully filled couple', () => {
    expect(coupleSchema.safeParse(validCouple).success).toBe(true);
  });

  // The only hard requirement from the acceptance checklist.
  it('requires a surname', () => {
    const result = coupleSchema.safeParse({ ...validCouple, surname: '   ' });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toBe('Podaj nazwisko');
  });

  it('treats blank optional fields as absent rather than as empty strings', () => {
    const parsed = coupleSchema.parse({ ...validCouple, email: '', phone: '', children: '' });
    expect(parsed.email).toBeNull();
    expect(parsed.phone).toBeNull();
    expect(parsed.children).toBeNull();
  });

  it('rejects a malformed e-mail but allows none at all', () => {
    expect(coupleSchema.safeParse({ ...validCouple, email: 'not-an-email' }).success).toBe(false);
    expect(coupleSchema.safeParse({ ...validCouple, email: '' }).success).toBe(true);
  });

  it('rejects a region outside the range', () => {
    expect(coupleSchema.safeParse({ ...validCouple, regionId: 12 }).success).toBe(false);
    expect(coupleSchema.safeParse({ ...validCouple, regionId: 0 }).success).toBe(false);
  });

  it('refuses a circle given both by id and as a new one', () => {
    expect(coupleSchema.safeParse({
      ...validCouple, circleId: '12',
      newCircle: { number: 4, patron: 'św. Rity', parishId: '3' },
    }).success).toBe(false);
  });
});

describe('retreatSchema', () => {
  it('accepts a degree entry without a name', () => {
    expect(retreatSchema.safeParse({
      kind: 'ONZ_I', year: 2014, place: 'Krościenko', name: '',
    }).success).toBe(true);
  });

  it('requires a name for INNE', () => {
    const result = retreatSchema.safeParse({
      kind: 'INNE', year: 2014, place: 'Chmielno', name: '',
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toBe('Podaj nazwę rekolekcji');
  });

  it('keeps the year inside the range the database enforces', () => {
    expect(retreatSchema.safeParse({ kind: 'ONZ_I', year: 1969, place: '', name: '' }).success)
      .toBe(false);
    expect(retreatSchema.safeParse({ kind: 'ONZ_I', year: 2101, place: '', name: '' }).success)
      .toBe(false);
  });
});

describe('saveSchema', () => {
  it('validates the couple and its entries together', () => {
    expect(saveSchema.safeParse({
      couple: validCouple,
      retreats: [{ kind: 'ONZ_I', year: 2014, place: 'Krościenko', name: '' }],
    }).success).toBe(true);
  });

  it('fails when any entry is invalid', () => {
    expect(saveSchema.safeParse({
      couple: validCouple,
      retreats: [{ kind: 'INNE', year: 2014, place: '', name: '' }],
    }).success).toBe(false);
  });
});
