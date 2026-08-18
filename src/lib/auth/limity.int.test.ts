import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { LIMIT_PROB, czyPrzekroczonoLimit, wyczyscProby, zapiszProbe } from './limity';

beforeEach(async () => {
  await prisma.probaLogowania.deleteMany();
});

afterAll(async () => {
  await prisma.probaLogowania.deleteMany();
  await prisma.$disconnect();
});

describe('czyPrzekroczonoLimit', () => {
  it('allows the first attempt', async () => {
    expect(await czyPrzekroczonoLimit('email:a@example.pl')).toBe(false);
  });

  it('blocks once the limit is reached', async () => {
    for (let i = 0; i < LIMIT_PROB; i++) await zapiszProbe('email:a@example.pl');
    expect(await czyPrzekroczonoLimit('email:a@example.pl')).toBe(true);
  });

  it('counts each key separately', async () => {
    for (let i = 0; i < LIMIT_PROB; i++) await zapiszProbe('email:a@example.pl');
    expect(await czyPrzekroczonoLimit('email:b@example.pl')).toBe(false);
  });

  it('ignores attempts older than the window', async () => {
    for (let i = 0; i < LIMIT_PROB; i++) await zapiszProbe('email:a@example.pl');
    await prisma.probaLogowania.updateMany({
      data: { kiedy: new Date(Date.now() - 16 * 60 * 1000) },
    });
    expect(await czyPrzekroczonoLimit('email:a@example.pl')).toBe(false);
  });
});

describe('wyczyscProby', () => {
  it('resets the counter after a successful login', async () => {
    for (let i = 0; i < LIMIT_PROB; i++) await zapiszProbe('email:a@example.pl');
    await wyczyscProby('email:a@example.pl');
    expect(await czyPrzekroczonoLimit('email:a@example.pl')).toBe(false);
  });
});
