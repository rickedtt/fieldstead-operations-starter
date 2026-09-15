import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Electron packages Vinext's self-contained production server so the Windows
  // application does not depend on a separately installed Node.js runtime.
  output: 'standalone',
};

export default nextConfig;
