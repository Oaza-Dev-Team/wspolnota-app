import { kolorRejonu, numerRzymski } from '@/lib/domena/rejony';
import style from './plakietki.module.css';

export function PlakietkaRejonu({ rejon, sufiks }: { rejon: number; sufiks?: string }) {
  return (
    <span
      className={`${style.plakietka} ${style.rejon}`}
      style={{ '--kolor-rejonu': kolorRejonu(rejon) } as React.CSSProperties}
    >
      {numerRzymski(rejon)}
      {sufiks ? ` · ${sufiks}` : ''}
    </span>
  );
}
