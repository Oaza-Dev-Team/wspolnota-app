import type { RetreatKind } from '@/generated/prisma/enums';
import { DEGREES, highestDegree, retreatInfo } from '@/lib/domain/retreats';

/**
 * The badge from the handoff: furthest degree plus how many other degrees the
 * couple has, e.g. "ORAR II +4". INNE counts as having entries but is never
 * the headline — it is not a step on the formation path.
 */
export function formationBadge(kinds: RetreatKind[]): { text: string; hasRetreats: boolean } {
  if (kinds.length === 0) return { text: '—', hasRetreats: false };

  const highest = highestDegree(kinds);
  if (highest === null) {
    // Only INNE entries.
    return { text: retreatInfo('INNE').code, hasRetreats: true };
  }

  const held = new Set(DEGREES.filter((d) => kinds.includes(d)));
  const others = held.size - 1;
  const code = retreatInfo(highest).code;

  return {
    text: others > 0 ? `${code} +${others}` : code,
    hasRetreats: true,
  };
}
