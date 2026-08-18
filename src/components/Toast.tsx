'use client';

import { useEffect, useState } from 'react';
import style from './toast.module.css';

const VISIBLE_MS = 2600;

export function Toast({ text }: { text: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  // role="status" with aria-live="polite" so a screen reader announces the
  // result without stealing focus from wherever the user is.
  return (
    <p className={style.toast} role="status" aria-live="polite">
      {text}
    </p>
  );
}
