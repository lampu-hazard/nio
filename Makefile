.PHONY: dev-client dev-server \
	test-client test-server test \
	build-server \
	pull up up-build down restart logs ps

dev-client:
	cd apps/client && bun run dev

dev-server:
	cd apps/server && bun run dev

test-client:
	cd apps/client && bun run typecheck

test-server:
	cd apps/server && bun run test

test: test-client test-server

build-server:
	cd apps/server && bun run build

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
