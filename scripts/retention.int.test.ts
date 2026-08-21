import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/db';
import { AUDIT_RETENTION_MONTHS, WINDOW_MINUTES, auditCutoff, runRetention } from './retention.mts';

const MARK = 'Wpis retencyjny';

let accountId: bigint;

beforeAll(async () => {
  const a = await prisma.account.findUniqueOrThrow({ where: { email: 'admin@example.pl' } });
  accountId = a.id;
});

afterEach(async () => {
  await prisma.audit.deleteMany({ where: { description: { startsWith: MARK } } });
  await prisma.session.deleteMany({ where: { tokenHash: { startsWith: 'retention-test-' } } });
  await prisma.webauthnChallenge.deleteMany({
    where: { challenge: { startsWith: 'retention-test-' } },
  });
  await prisma.loginAttempt.deleteMany({ where: { key: { startsWith: 'retention-test-' } } });
});

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

async function auditAt(at: Date, label: string) {
  await prisma.audit.create({
    data: { kind: 'edit', description: `${MARK} ${label}`, accountId, at },
  });
}

describe('auditCutoff', () => {
  it('sits twenty-four months back', () => {
    expect(auditCutoff(new Date('2026-08-19T12:00:00Z')).getFullYear()).toBe(2024);
    expect(auditCutoff(new Date('2026-08-19T12:00:00Z')).getMonth()).toBe(7);
  });
});

describe('runRetention', () => {
  it('removes audit entries past the retention period and keeps the rest', async () => {
    await auditAt(monthsAgo(AUDIT_RETENTION_MONTHS + 1), 'stary');
    await auditAt(monthsAgo(AUDIT_RETENTION_MONTHS - 1), 'świeży');

    await runRetention();

    const left = await prisma.audit.findMany({
      where: { description: { startsWith: MARK } },
      select: { description: true },
    });
    expect(left).toHaveLength(1);
    expect(left[0]!.description).toContain('świeży');
  });

  it('removes expired sessions and keeps live ones', async () => {
    await prisma.session.createMany({
      data: [
        {
          tokenHash: 'retention-test-expired',
          accountId,
          expiresAt: new Date(Date.now() - 86_400_000),
        },
        {
          tokenHash: 'retention-test-live',
          accountId,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      ],
    });

    await runRetention();

    const left = await prisma.session.findMany({
      where: { tokenHash: { startsWith: 'retention-test-' } },
      select: { tokenHash: true },
    });
    expect(left).toHaveLength(1);
    expect(left[0]!.tokenHash).toBe('retention-test-live');
  });

  it('removes expired WebAuthn challenges and keeps fresh ones', async () => {
    await prisma.webauthnChallenge.createMany({
      data: [
        {
          challenge: 'retention-test-expired',
          purpose: 'authentication',
          expiresAt: new Date(Date.now() - 60_000),
        },
        {
          challenge: 'retention-test-fresh',
          purpose: 'authentication',
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
    });

    await runRetention();

    const left = await prisma.webauthnChallenge.findMany({
      where: { challenge: { startsWith: 'retention-test-' } },
      select: { challenge: true },
    });
    expect(left).toHaveLength(1);
    expect(left[0]!.challenge).toBe('retention-test-fresh');
  });

  // Nothing else empties this table: clearAttempts only clears the bucket
  // that has just signed in, and the key is an IP address — so without this
  // sweep the registry would store addresses for ever, in the one application
  // whose whole justification is careful handling of special-category data.
  it('removes sign-in attempts older than the window and keeps recent ones', async () => {
    await prisma.loginAttempt.createMany({
      data: [
        {
          key: 'retention-test-old',
          at: new Date(Date.now() - (WINDOW_MINUTES + 1) * 60 * 1000),
        },
        { key: 'retention-test-recent', at: new Date() },
      ],
    });

    await runRetention();

    const left = await prisma.loginAttempt.findMany({
      where: { key: { startsWith: 'retention-test-' } },
      select: { key: true },
    });
    expect(left).toHaveLength(1);
    expect(left[0]!.key).toBe('retention-test-recent');
  });

  it('reports what it removed', async () => {
    await auditAt(monthsAgo(AUDIT_RETENTION_MONTHS + 2), 'do skasowania');
    await prisma.loginAttempt.create({
      data: {
        key: 'retention-test-old',
        at: new Date(Date.now() - (WINDOW_MINUTES + 1) * 60 * 1000),
      },
    });

    const result = await runRetention();

    expect(result.audit).toBeGreaterThanOrEqual(1);
    expect(result.sessions).toBeGreaterThanOrEqual(0);
    expect(result.challenges).toBeGreaterThanOrEqual(0);
    expect(result.attempts).toBeGreaterThanOrEqual(1);
  });
});
