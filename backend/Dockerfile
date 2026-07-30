# Build context is the REPO ROOT, not backend/ — see docker-compose.yml's
# `context: .` for this service. backend/src/lib/agent-package.ts zips a
# built copy of the sibling desktop-agent/ package into every customer's
# subscription download, so that package has to be buildable from right
# here, not just backend/ in isolation the way every other Dockerfile in
# this repo is scoped.

FROM node:20-alpine AS backend-deps
WORKDIR /backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

FROM node:20-alpine AS backend-build
WORKDIR /backend
COPY --from=backend-deps /backend/node_modules ./node_modules
COPY backend/ .
RUN npm run build

FROM node:20-alpine AS desktop-agent-build
WORKDIR /desktop-agent
COPY desktop-agent/package.json desktop-agent/package-lock.json ./
RUN npm ci
COPY desktop-agent/ .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=backend-build /backend/dist ./dist
COPY backend/db ./db
COPY backend/scripts ./scripts

# Placed as a sibling of /app, not inside it — agent-package.ts resolves
# desktop-agent/ by walking up from its own compiled path
# (dist/lib/agent-package.js -> ../../.. ), the same on-disk layout as
# the two packages sitting side by side in this repo.
COPY --from=desktop-agent-build /desktop-agent/dist /desktop-agent/dist
COPY --from=desktop-agent-build /desktop-agent/package.json /desktop-agent/package.json
COPY desktop-agent/README.md /desktop-agent/README.md

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/healthz || exit 1
CMD ["node", "dist/server.js"]
