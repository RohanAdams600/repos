/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces a minimal standalone server (.next/standalone) with only the
  // production node_modules it actually needs — what frontend/Dockerfile
  // copies into the runtime image, instead of shipping the whole tree.
  output: "standalone",
};

module.exports = nextConfig;
