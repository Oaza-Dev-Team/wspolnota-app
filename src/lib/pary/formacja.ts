import type { RodzajRekolekcji } from '@/generated/prisma/enums';
import { STOPNIE, najwyzszyStopien, opisRodzaju } from '@/lib/domena/rekolekcje';

/**
 * The badge from the handoff: furthest degree plus how many other degrees the
 * couple has, e.g. "ORAR II +4". INNE counts as having entries but is never
 * the headline — it is not a step on the formation path.
 */
export function opisFormacji(rodzaje: RodzajRekolekcji[]): { tekst: string; maRekolekcje: boolean } {
  if (rodzaje.length === 0) return { tekst: '—', maRekolekcje: false };

  const najwyzszy = najwyzszyStopien(rodzaje);
  if (najwyzszy === null) {
    // Only INNE entries.
    return { tekst: opisRodzaju('INNE').kod, maRekolekcje: true };
  }

  const posiadaneStopnie = new Set(STOPNIE.filter((s) => rodzaje.includes(s)));
  const pozostale = posiadaneStopnie.size - 1;
  const kod = opisRodzaju(najwyzszy).kod;

  return {
    tekst: pozostale > 0 ? `${kod} +${pozostale}` : kod,
    maRekolekcje: true,
  };
}
