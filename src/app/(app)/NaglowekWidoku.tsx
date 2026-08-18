import style from './naglowek.module.css';

export function NaglowekWidoku({
  tytul,
  podtytul,
  children,
}: {
  tytul: string;
  podtytul: string;
  children?: React.ReactNode;
}) {
  return (
    <header className={style.naglowek}>
      <div>
        <h1 className={style.tytul}>{tytul}</h1>
        <p className={style.podtytul}>{podtytul}</p>
      </div>
      {children && <div className={style.akcje}>{children}</div>}
    </header>
  );
}
