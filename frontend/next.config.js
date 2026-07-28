/** @type {import('next').NextConfig} */

// GitHub Pages serves this repo at https://<user>.github.io/repos/, a
// project subpath — every asset/link needs that prefix or it 404s. Set
// by .github/workflows/deploy-pages.yml at build time; unset (falsy) for
// every other build (local dev, Docker, Vercel), which serve from the
// root and don't need it.
const isGithubPagesBuild = process.env.NEXT_PUBLIC_DEPLOY_TARGET === "github-pages";
const basePath = isGithubPagesBuild ? "/repos" : "";

const nextConfig = {
  reactStrictMode: true,
  // 'export': fully static HTML/CSS/JS, no Node server needed — required
  // for GitHub Pages, which only serves static files.
  // 'standalone': a minimal Node server (.next/standalone) — what
  // frontend/Dockerfile and Vercel use, since they can run a real server
  // and this build gets the full framework (SSR, dynamic routes).
  output: isGithubPagesBuild ? "export" : "standalone",
  basePath,
  images: { unoptimized: isGithubPagesBuild },
};

module.exports = nextConfig;
