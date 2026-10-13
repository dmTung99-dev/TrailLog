# Used by both environments: `docker compose up` locally, and Render for staging.

FROM node:20-slim AS build
WORKDIR /app
# Prisma's query engine needs OpenSSL; bcrypt compiles natively during npm ci.
RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
EXPOSE 3000
# Apply pending migrations on every boot, then start. `prisma` is a runtime
# dependency (not dev) precisely so this works after `npm prune`.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
