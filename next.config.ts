import type { NextConfig } from 'next';

/**
 * Moved here from the Caddyfile when the deployment went behind Coolify's
 * Traefik. They live with the application rather than with the proxy because
 * the proxy is the part that keeps changing, and these are not its decisions
 * to make. `e2e/security-headers.spec.ts` asserts them against a production
 * build.
 */
const securityHeaders = [
  // The app is served over HTTPS only. Two years, subdomains included.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  // The registry holds article 9 data; no reason for a browser to hand any of
  // these capabilities to the page.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  // Standalone emits a self-contained server with only the modules it actually
  // uses, so the production image does not carry node_modules or the sources.
  output: 'standalone',
  // Caddy stripped its own `Server` header; Traefik and Next add none, so the
  // only thing left to withhold is the framework name.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
