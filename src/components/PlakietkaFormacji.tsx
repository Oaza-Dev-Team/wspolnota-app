import type { RodzajRekolekcji } from '@/generated/prisma/enums';
import { opisFormacji } from '@/lib/pary/formacja';
import style from './plakietki.module.css';

export function PlakietkaFormacji({ rodzaje }: { rodzaje: RodzajRekolekcji[] }) {
  const { tekst, maRekolekcje } = opisFormacji(rodzaje);
  return (
    <span className={`${style.plakietka} ${maRekolekcje ? style.formacjaMa : style.formacjaBrak}`}>
      {tekst}
    </span>
  );
}
