# Kartoteka DK — production image.
#
# The shipped layer carries the server and nothing else: no sources, no dev
# dependencies, no build cache. Migrations live in their own stage, run once
# per deployment by a service the app waits on — see the `migrate` target.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall runs prisma generate, which needs the schema present.
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The generated client is imported as @/generated/prisma, so it has to exist
# before next build resolves the imports.
RUN npx prisma generate
# A URL is required for the build to typecheck the Prisma config; nothing
# connects to it, and the real one arrives as an environment variable at runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Migrations run from here, as a one-shot service the app waits on. They cannot
# run inside the slim runner: prisma.config.ts is TypeScript and carries the
# datasource URL, so applying a migration needs the Prisma CLI with its whole
# dependency tree and a TypeScript loader — everything the runner exists to
# leave out. This stage already has all of it.
FROM build AS migrate
WORKDIR /app
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Never root: a compromised render should not own the container.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
