FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so
# this has to be a browser-reachable URL, not a docker-internal hostname —
# see docker-compose.yml, which sets it to http://localhost:4000 because
# the backend's port is published to the host.
ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
