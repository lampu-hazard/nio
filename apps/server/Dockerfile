FROM oven/bun:1.2-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl gcompat

COPY apps/server/package.json apps/server/bun.lock ./
RUN bun install --frozen-lockfile

COPY apps/server/prisma ./prisma/
RUN bun run prisma:generate

COPY apps/server/nest-cli.json apps/server/tsconfig.json apps/server/tsconfig.build.json ./
COPY apps/server/src ./src
RUN bun run build

FROM oven/bun:1.2-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl gcompat

COPY apps/server/package.json apps/server/bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY services/anomaly-engine/proto ./proto

EXPOSE 3002

ENV PORT=3002
ENV NODE_ENV=production
ENV ANOMALY_PROTO_PATH=/app/proto/anomaly/v1/anomaly.proto

CMD ["bun", "dist/main.js"]
