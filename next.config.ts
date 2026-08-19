import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone emits a self-contained server with only the modules it actually
  // uses, so the production image does not carry node_modules or the sources.
  output: 'standalone',
};

export default nextConfig;
