/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // Prevent Next.js from bundling native/server-only packages
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark native modules as external to prevent bundling issues
      config.externals = [
        ...(config.externals || []),
        "@libsql/client",
        "ws",
        "better-sqlite3",
        "pdf-parse",
      ];
    }
    return config;
  },
  // Experimental server actions (needed for some Next.js 14 features)
  experimental: {},
};
