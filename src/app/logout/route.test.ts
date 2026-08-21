import { expect, it, vi } from 'vitest';

// clearSessionCookie reaches for next/headers' cookie jar, which exists only
// inside a request. Stubbed because this file is about one thing: the shape of
// the redirect the handler answers with.
vi.mock('@/lib/auth/requireUser', () => ({ clearSessionCookie: vi.fn() }));

const { POST } = await import('./route');

it('answers with a relative Location, so nothing about the redirect depends on the request', async () => {
  // The handler used to build an absolute URL from `request.url`. Behind a
  // reverse proxy that resolves to the container's own listening address —
  // HOSTNAME and PORT from the Dockerfile — so signing out sent people to
  // https://0.0.0.0:3000/login. A relative Location is resolved by the browser
  // against the address it actually reached, which is the one that is right by
  // construction. That the handler now needs no argument at all is the point:
  // it cannot be told a wrong address because it is never told one.
  const response = await POST();

  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/login');
});
