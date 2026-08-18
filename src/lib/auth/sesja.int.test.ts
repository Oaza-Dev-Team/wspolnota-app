import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  pobierzUzytkownikaZTokena, usunSesje, usunSesjeKonta, usunWygasleSesje, utworzSesje,
} from './sesja';

async function daneTestowe() {
  await prisma.rejon.upsert({ where: { id: 7 }, update: {}, create: { id: 7, numerRzym: 'VII' } });
  return prisma.konto.upsert({
    where: { email: 'sesja@example.pl' },
    update: { status: 'aktywne' },
    create: {
      email: 'sesja@example.pl', nazwa: 'Test Sesji',
      rola: 'rejon', rejonId: 7, status: 'aktywne',
    },
  });
}

beforeEach(async () => {
  await prisma.sesja.deleteMany();
});

afterAll(async () => {
  await prisma.sesja.deleteMany();
  await prisma.konto.deleteMany({ where: { email: 'sesja@example.pl' } });
  await prisma.$disconnect();
});

describe('utworzSesje', () => {
  it('never stores the raw token', async () => {
    const konto = await daneTestowe();
    const token = await utworzSesje(konto.id);
    const wiersze = await prisma.sesja.findMany();
    expect(wiersze).toHaveLength(1);
    expect(wiersze[0]!.tokenHash).not.toBe(token);
  });
});

describe('pobierzUzytkownikaZTokena', () => {
  it('resolves a valid token to the account', async () => {
    const konto = await daneTestowe();
    const token = await utworzSesje(konto.id);
    const u = await pobierzUzytkownikaZTokena(token);
    expect(u).toEqual({ id: konto.id, rola: 'rejon', rejonId: 7 });
  });

  it('returns null for an unknown token', async () => {
    expect(await pobierzUzytkownikaZTokena('zmyslony-token')).toBeNull();
  });

  it('returns null once the session has expired', async () => {
    const konto = await daneTestowe();
    const token = await utworzSesje(konto.id);
    await prisma.sesja.updateMany({ data: { wygasa: new Date(Date.now() - 1000) } });
    expect(await pobierzUzytkownikaZTokena(token)).toBeNull();
  });

  it('returns null when the account has been disabled', async () => {
    const konto = await daneTestowe();
    const token = await utworzSesje(konto.id);
    await prisma.konto.update({ where: { id: konto.id }, data: { status: 'wylaczone' } });
    // This is the reason sessions live in the database rather than a JWT.
    expect(await pobierzUzytkownikaZTokena(token)).toBeNull();
  });
});

describe('session removal', () => {
  it('usunSesje invalidates just that session', async () => {
    const konto = await daneTestowe();
    const a = await utworzSesje(konto.id);
    const b = await utworzSesje(konto.id);
    await usunSesje(a);
    expect(await pobierzUzytkownikaZTokena(a)).toBeNull();
    expect(await pobierzUzytkownikaZTokena(b)).not.toBeNull();
  });

  it('usunSesjeKonta invalidates every session of the account', async () => {
    const konto = await daneTestowe();
    const a = await utworzSesje(konto.id);
    const b = await utworzSesje(konto.id);
    await usunSesjeKonta(konto.id);
    expect(await pobierzUzytkownikaZTokena(a)).toBeNull();
    expect(await pobierzUzytkownikaZTokena(b)).toBeNull();
  });

  it('usunWygasleSesje removes only expired rows', async () => {
    const konto = await daneTestowe();
    const zywy = await utworzSesje(konto.id);
    await utworzSesje(konto.id);

    // Expire the second session only; sessions are created in id order.
    const nowsza = await prisma.sesja.findFirstOrThrow({ orderBy: { id: 'desc' } });
    await prisma.sesja.update({
      where: { id: nowsza.id },
      data: { wygasa: new Date(Date.now() - 1000) },
    });

    expect(await usunWygasleSesje()).toBe(1);
    expect(await pobierzUzytkownikaZTokena(zywy)).not.toBeNull();
  });
});
