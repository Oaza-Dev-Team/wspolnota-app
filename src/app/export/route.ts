import { requireUser } from '@/lib/auth/requireUser';
import { buildWorkbook, exportFileName, exportRows } from '@/lib/couples/export';
import { parseFilters } from '@/lib/couples/filters';
import { romanNumeral } from '@/lib/domain/regions';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  // A route handler is as public as a server action; the session comes first.
  const u = await requireUser();

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filters = parseFilters(params);
  const rows = await exportRows(u, filters);

  // Which single region this file holds, if it holds one. A region account is
  // narrowed by listScope whatever the query string says, so its own region is
  // the truth there; for everyone else it is whatever they filtered to.
  const region = u.role === 'region' ? u.regionId : filters.region;

  const buffer = await buildWorkbook(rows);
  const fileName = exportFileName(new Date(), region);

  // Handing out personal data is an event worth recording — this is the
  // export register the GDPR section calls for.
  await prisma.audit.create({
    data: {
      kind: 'export',
      // The register says what left, so it says which part of the community too.
      description:
        `Wyeksportowano ${rows.length} rekordów do XLSX`
        + (region === null ? '' : ` (rejon ${romanNumeral(region)})`),
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
