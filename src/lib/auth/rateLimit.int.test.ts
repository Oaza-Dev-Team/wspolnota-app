import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { ATTEMPT_LIMIT, clearAttempts, isRateLimited, recordAttempt } from './rateLimit';

beforeEach(async () => {
  await prisma.loginAttempt.deleteMany();
});

afterAll(async () => {
  await prisma.loginAttempt.deleteMany();
  await prisma.$disconnect();
});

describe('isRateLimited', () => {
  it('allows the first attempt', async () => {
    expect(await isRateLimited('email:a@example.pl')).toBe(false);
  });

  it('blocks once the limit is reached', async () => {
    for (let i = 0; i < ATTEMPT_LIMIT; i++) await recordAttempt('email:a@example.pl');
    expect(await isRateLimited('email:a@example.pl')).toBe(true);
  });

  it('counts each key separately', async () => {
    for (let i = 0; i < ATTEMPT_LIMIT; i++) await recordAttempt('email:a@example.pl');
    expect(await isRateLimited('email:b@example.pl')).toBe(false);
  });

  it('ignores attempts older than the window', async () => {
    for (let i = 0; i < ATTEMPT_LIMIT; i++) await recordAttempt('email:a@example.pl');
    await prisma.loginAttempt.updateMany({ data: { at: new Date(Date.now() - 16 * 60 * 1000) } });
    expect(await isRateLimited('email:a@example.pl')).toBe(false);
  });
});

describe('clearAttempts', () => {
  it('resets the counter after a successful login', async () => {
    for (let i = 0; i < ATTEMPT_LIMIT; i++) await recordAttempt('email:a@example.pl');
    await clearAttempts('email:a@example.pl');
    expect(await isRateLimited('email:a@example.pl')).toBe(false);
  });
});
