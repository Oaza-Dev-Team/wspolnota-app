/**
 * What src/instrumentation.ts does once the server is known to be the Node.js
 * one. Its own module for a build reason, not a tidiness one: Next compiles
 * instrumentation.ts for the edge runtime as well, `process.exit` does not
 * exist there, and Turbopack warns about it — importing this file only under
 * `NEXT_RUNTIME === 'nodejs'` keeps the call out of that bundle entirely.
 */
import { assertAppUrl } from './appUrl';

/**
 * Stops a production instance that cannot sign anybody in, at the moment it
 * starts rather than hours later.
 *
 * Exits rather than throwing. Verified against Next 16.3.1 with the standalone
 * server this image ships: an error raised out of `register()` is reported as
 * "Failed to prepare server" plus an unhandledRejection, and the process then
 * STAYS UP with the port bound — a container that is listening and cannot
 * serve, which is worse than one that is plainly down. The message goes out on
 * its own line first, because the framework's wrapper buries it in a stack
 * trace.
 */
export function checkStartupConfig(): void {
  try {
    assertAppUrl();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
