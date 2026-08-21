/**
 * Runs once when a server instance starts, before it takes its first request
 * (Next.js file convention: instrumentation.ts, `register`).
 *
 * The only thing it does is refuse to start without a usable APP_URL in
 * production. Spec §2 asks for exactly that, and the reason is diagnostic:
 * every consequence of a missing or wrong value appears far from its cause —
 * `/health` answers "ok", pages render, and then a key registration fails with
 * a browser-side error naming nothing. Stopping here turns that into one line
 * in the container log, at the moment the container comes up.
 */
export async function register(): Promise<void> {
  // Called in every runtime, and the check belongs to neither the edge one nor
  // the build: importing it from inside the guard is what keeps it out of both.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { checkStartupConfig } = await import('@/lib/startup');
  checkStartupConfig();
}
