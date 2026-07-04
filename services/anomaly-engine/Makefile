.PHONY: dev test build check fmt lint clean

dev:
	cargo run

test:
	cargo test

build:
	cargo build --release

check:
	cargo check

fmt:
	cargo fmt --all -- --check

lint:
	cargo clippy -- -D warnings

clean:
	cargo clean
