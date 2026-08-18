import { canImport } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { templateWorkbook } from '@/lib/couples/import';

export async function GET() {
  // A route handler is as public as a server action; the session comes first.
  const u = await requireUser();
  if (!canImport(u)) return new Response('Brak uprawnień', { status: 403 });

  const buffer = await templateWorkbook();
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="kartoteka-szablon.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
