.PHONY: dev-client dev-server dev-slowmode dev-anomaly \
	test-client test-server test-slowmode test-anomaly test \
	build-server build-slowmode build-anomaly \
	pull up up-build down restart logs ps

dev-client:
	cd apps/client && bun run dev

dev-server:
	cd apps/server && bun run dev

dev-slowmode:
	cd services/slowmode-engine && cargo run

dev-anomaly:
	cd services/anomaly-engine && make dev

test-client:
	cd apps/client && bun run typecheck

test-server:
	cd apps/server && bun run test

test-slowmode:
	cd services/slowmode-engine && cargo test

test-anomaly:
	cd services/anomaly-engine && make test

test: test-client test-server test-slowmode test-anomaly

build-server:
	cd apps/server && bun run build

build-slowmode:
	cd services/slowmode-engine && cargo build

build-anomaly:
	cd services/anomaly-engine && make build

pull:
	docker compose pull

up:
	docker compose up -d

up-build:
	docker compose up -d --build

down:
	docker compose down

restart:
	docker compose down && docker compose up -d

logs:
	docker compose logs -f --tail=200

ps:
	docker compose ps
