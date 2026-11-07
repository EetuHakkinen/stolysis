# syntax=docker/dockerfile:1

ARG NODE_VERSION=24-alpine

# ---- deps: install all dependencies (postinstall runs `prisma generate`) ----
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ---- builder: build the standalone Next.js app ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/app/generated ./app/generated
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- migrate: Prisma CLI for running `prisma migrate deploy` on start ----
FROM node:${NODE_VERSION} AS migrate
WORKDIR /migrate
RUN npm init -y >/dev/null && npm install --omit=dev --no-audit --no-fund prisma@7.10.1 dotenv@17.2.3

# ---- runner: minimal production image ----
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

COPY --from=migrate --chown=nextjs:nodejs /migrate/node_modules /migrate/node_modules
COPY --chown=nextjs:nodejs prisma.config.ts /migrate/prisma.config.ts
COPY --chown=nextjs:nodejs prisma /migrate/prisma
COPY --chown=nextjs:nodejs docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
