import { redirect } from 'next/navigation';
import { canImport } from '@/lib/auth/permissions';
import { requireUser } from '@/lib/auth/requireUser';
import { ViewHeader } from '../ViewHeader';
import { ImportForm } from './ImportForm';

export default async function ImportPage() {
  const u = await requireUser();
  // The nav hides the entry, but the address bar does not respect the nav.
  if (!canImport(u)) redirect('/pary');

  return (
    <>
      <ViewHeader
        title="Import z arkusza"
        subtitle="Wgraj plik XLSX w układzie eksportu — zobaczysz podgląd przed zapisem"
      />
      <ImportForm />
    </>
  );
}
