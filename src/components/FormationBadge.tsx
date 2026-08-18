import type { RetreatKind } from '@/generated/prisma/enums';
import { formationBadge } from '@/lib/couples/formation';
import style from './badges.module.css';

export function FormationBadge({ kinds }: { kinds: RetreatKind[] }) {
  const { text, hasRetreats } = formationBadge(kinds);
  return (
    <span className={`${style.badge} ${hasRetreats ? style.formationSome : style.formationNone}`}>
      {text}
    </span>
  );
}
