import { hash, verify } from '@node-rs/argon2';

export function zahashuj(haslo: string): Promise<string> {
  return hash(haslo);
}

/**
 * Returns false rather than throwing when the stored hash is malformed or
 * absent — an account in the `oczekuje` state has no hash yet, and a login
 * attempt against it must fail like any other, not crash the action.
 */
export async function sprawdzHaslo(hasz: string, haslo: string): Promise<boolean> {
  try {
    return await verify(hasz, haslo);
  } catch {
    return false;
  }
}
