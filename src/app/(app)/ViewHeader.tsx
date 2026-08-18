import style from './viewHeader.module.css';

export function ViewHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <header className={style.header}>
      <div>
        <h1 className={style.title}>{title}</h1>
        <p className={style.subtitle}>{subtitle}</p>
      </div>
      {children && <div className={style.actions}>{children}</div>}
    </header>
  );
}
