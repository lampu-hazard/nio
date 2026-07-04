FROM oven/bun:1.2-alpine AS builder

WORKDIR /app

ARG BACKEND_URL=http://nio-server:3002
ENV BACKEND_URL=$BACKEND_URL

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1.2-alpine AS runner

WORKDIR /app

ENV PORT=3000
ENV NODE_ENV=production
ENV BACKEND_URL=http://nio-server:3002

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["bun", "run", "start"]
