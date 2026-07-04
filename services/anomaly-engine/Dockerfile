FROM rust:1.75-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends protobuf-compiler && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/anomaly-engine

COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
COPY build.rs ./
RUN mkdir -p proto/anomaly/v1 && touch proto/anomaly/v1/anomaly.proto
RUN cargo build --release
RUN rm -rf src proto

COPY proto ./proto
COPY src ./src
RUN touch build.rs && touch src/main.rs
RUN cargo build --release

FROM debian:bookworm-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/anomaly-engine/target/release/nio-anomaly-engine /usr/local/bin/anomaly-engine

EXPOSE 50051

CMD ["anomaly-engine"]
