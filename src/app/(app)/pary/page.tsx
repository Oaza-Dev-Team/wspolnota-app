import { requireUser } from '@/lib/auth/requireUser';
import { numerRzymski } from '@/lib/domena/rejony';

export default async function StronaPar() {
  const u = await requireUser();
  const zakres = u.rejonId === null ? 'cała wspólnota' : `rejon ${numerRzymski(u.rejonId)}`;

  return (
    <p>
      Zalogowano jako <strong>{u.rola}</strong> — {zakres}. Lista wchodzi w zadaniu 10.
    </p>
  );
}
