import { requireUser } from '@/lib/auth/requireUser';
import { numerRzymski } from '@/lib/domena/rejony';

export default async function StronaPar() {
  const u = await requireUser();
  const zakres = u.rejonId === null ? 'cała wspólnota' : `rejon ${numerRzymski(u.rejonId)}`;

  return (
    <main style={{ padding: 32 }}>
      <h1>Pary wspólnoty</h1>
      <p>
        Zalogowano jako <strong>{u.rola}</strong> — {zakres}.
      </p>
      <form action="/wyloguj" method="post">
        <button type="submit">Wyloguj</button>
      </form>
    </main>
  );
}
