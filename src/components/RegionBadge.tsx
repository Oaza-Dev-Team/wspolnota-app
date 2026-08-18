import { regionColor, romanNumeral } from '@/lib/domain/regions';
import style from './badges.module.css';

export function RegionBadge({ region, suffix }: { region: number; suffix?: string }) {
  return (
    <span
      className={`${style.badge} ${style.region}`}
      style={{ '--region-color': regionColor(region) } as React.CSSProperties}
    >
      {romanNumeral(region)}
      {suffix ? ` · ${suffix}` : ''}
    </span>
  );
}
