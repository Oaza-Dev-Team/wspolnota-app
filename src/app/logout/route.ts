import { clearSessionCookie } from '@/lib/auth/requireUser';

/**
 * A relative Location rather than NextResponse.redirect, which insists on an
 * absolute URL and so has to be handed one. Building that URL from
 * `request.url` looked right and was: on this machine. Behind a reverse proxy
 * the request no longer knows the address it was reached at, and Next falls
 * back to the container's own listening address — HOSTNAME and PORT from the
 * Dockerfile — so signing out sent people to https://0.0.0.0:3000/login.
 *
 * The browser resolves a relative Location against the address it actually
 * used, which is right by construction and stays right whatever sits in front
 * of the application. Taking no argument is the guarantee: a handler that is
 * never told where it lives cannot be told wrong.
 */
export async function POST(): Promise<Response> {
  await clearSessionCookie();
  return new Response(null, { status: 303, headers: { Location: '/login' } });
}
