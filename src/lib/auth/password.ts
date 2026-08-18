import { hash, verify } from '@node-rs/argon2';

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

/**
 * Returns false rather than throwing when the stored hash is malformed or
 * absent — an account in the `pending` state has no hash yet, and a login
 * attempt against it must fail like any other, not crash the action.
 */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}
