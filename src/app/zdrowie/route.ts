import { prisma } from '@/lib/db';

/**
 * Liveness probe for the container and the reverse proxy.
 *
 * Deliberately outside requireUser(): the orchestrator has no session. It says
 * "up" or "down" and nothing else — no version, no counts, no error text —
 * because an unauthenticated endpoint should not describe the inside of the
 * system to whoever asks.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json(
      { status: 'error' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
