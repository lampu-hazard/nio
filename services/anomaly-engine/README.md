# Anomaly Engine Microservice

A high-performance Rust microservice designed for real-time Discord message anomaly and phishing link detection. It communicates with the upstream NestJS orchestrator via low-latency gRPC APIs.

---

## Architectural Features

- **Tonic gRPC Service**: Exposes a low-latency gRPC interface.
- **In-Memory Channel State**: Tracks sliding activity windows (e.g. unique user counts, message rates) using a thread-safe `DashMap`.
- **Automatic State Eviction**: Spawns a background task that evicts inactive channel entries every 1 hour to prevent memory leaks under high multi-guild traffic.
- **Explainable Multi-Detector Output**: Runs independent detectors (Phishing Link, Content Abuse, User Anomaly, and Guild Baseline) returning individual findings, confidence scores, and aggregate decisions.

---

## Technical Specifications

- **gRPC Server Bind Address**: `127.0.0.1:50051`
- **Protobuf API Definitions**: `proto/anomaly/v1/anomaly.proto`
- **Rust Edition**: 2021

---

## Developer Guide

### Prerequisites

You need the Protocol Buffers compiler (`protoc`) installed on your system to generate client/server code:

```bash
# Arch Linux
sudo pacman -S protobuf

# Ubuntu / Debian
sudo apt-get install -y protobuf-compiler
```

### Build & Run Commands

The local service is managed via a dedicated `Makefile`:

- **Start Development Server**: Runs the service locally:
  ```bash
  make dev
  ```
- **Execute Verification Suite**: Runs the unit and integration test suites:
  ```bash
  make test
  ```
- **Compile Optimized Release Binary**: Builds the production binary under `target/release/`:
  ```bash
  make build
  ```
- **Check Compilation**: Verifies code compilation without generating binaries:
  ```bash
  make check
  ```
- **Run Linter & Formatter**: Checks code formatting and clippy rules:
  ```bash
  make fmt
  make lint
  ```

---

## gRPC Integration Details

### Service Methods

```protobuf
service AnomalyEngine {
  rpc AnalyzeMessage(AnalyzeMessageRequest) returns (AnalyzeMessageResponse);
}
```

The NestJS bot orchestrator executes the `AnalyzeMessage` RPC on every incoming Gateway message. 

- **Response SLA**: Designed for sub-10ms response latencies on localhost.
- **Connection Cooldown / Timeout**: Upstream enforces a 200ms deadline timeout. If the microservice is unreachable, NestJS degrades gracefully, bypassing block actions and logging the warning.
