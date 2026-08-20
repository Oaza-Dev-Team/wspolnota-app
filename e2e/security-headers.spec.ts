import { expect, test } from '@playwright/test';

/**
 * These headers used to live in the Caddyfile. Deploying behind Coolify drops
 * Caddy for Traefik, and the headers would have gone with it — silently,
 * because nothing outside the proxy asserted them. They belong to the
 * application now, and this is what keeps them there across the next change
 * of reverse proxy.
 */
const expected: Record<string, string> = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'permissions-policy':
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

test('every response carries the security headers', async ({ request }) => {
  const headers = (await request.get('/login')).headers();

  for (const [key, value] of Object.entries(expected)) {
    expect(headers[key], `missing or wrong: ${key}`).toBe(value);
  }
});

test('the response does not name the framework', async ({ request }) => {
  const headers = (await request.get('/login')).headers();

  expect(headers['x-powered-by']).toBeUndefined();
});
