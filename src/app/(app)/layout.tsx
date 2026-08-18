import { requireUser } from '@/lib/auth/requireUser';

export default async function LayoutAplikacji({ children }: { children: React.ReactNode }) {
  // Full shell (sidebar, role-dependent navigation) arrives in Plan 2.
  await requireUser();
  return <>{children}</>;
}
