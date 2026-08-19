import { requireUser } from '@/lib/auth/requireUser';
import { buildWorkbook, exportFileName, exportRows } from '@/lib/couples/export';
import { parseFilters } from '@/lib/couples/filters';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  // A route handler is as public as a server action; the session comes first.
  const u = await requireUser();

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filters = parseFilters(params);
  const rows = await exportRows(u, filters);

  const buffer = await buildWorkbook(rows);
  const fileName = exportFileName(new Date());

  // Handing out personal data is an event worth recording — this is the
  // export register the GDPR section calls for.
  await prisma.audit.create({
    data: {
      kind: 'export',
      description: `Wyeksportowano ${rows.length} rekordów do XLSX`,
      accountId: u.id,
    },
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
