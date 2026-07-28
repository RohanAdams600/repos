FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# soul.md/identity.md/user.md and the playbooks are read from disk at
# runtime (see src/lib/memory.ts), not bundled into dist/ by tsc.
COPY identity ./identity
COPY playbooks ./playbooks

CMD ["node", "dist/index.js"]
