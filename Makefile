.PHONY: dev-client dev-server dev-slowmode test-client test-server test-slowmode build-server build-slowmode test

dev-client:
	cd apps/client && bun run dev

dev-server:
	cd apps/server && bun run dev

dev-slowmode:
	cd services/slowmode-engine && cargo run

test-client:
	cd apps/client && bun run typecheck

test-server:
	cd apps/server && bun run test

test-slowmode:
	cd services/slowmode-engine && cargo test

build-server:
	cd apps/server && bun run build

build-slowmode:
	cd services/slowmode-engine && cargo build

test: test-client test-server test-slowmode
