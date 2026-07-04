FROM oven/bun:1.2-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl gcompat

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY prisma ./prisma/
RUN bun run prisma:generate

COPY . .
RUN bun run build

FROM oven/bun:1.2-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl gcompat

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

EXPOSE 3002

ENV PORT=3002
ENV NODE_ENV=production

CMD ["bun", "dist/main.js"]
