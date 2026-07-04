# nio — Discord Bot & Analytics Monorepo

`nio` adalah ekosistem manajemen server Discord modern yang terdiri dari dashboard web manajemen, bot orkestrasi NestJS, serta microservices berbasis Rust dengan komunikasi internal berkinerja tinggi menggunakan gRPC.

---

## Arsitektur Sistem

Monorepo ini dibagi menjadi dua area utama: `apps` (aplikasi web dan backend utama) dan `services` (mesin analisis berkinerja tinggi).

```
                            +-----------------------------------+
                            |        Browser (Next.js)          |
                            |          [apps/client]            |
                            +-----------------+-----------------+
                                              |
                                              | REST API / HTTP
                                              v
+------------------+        +-----------------+-----------------+
|   Discord API    |<======>|   NestJS Orchestrator (Bot)       |
+------------------+        |          [apps/server]            |
                            +--------+------------------+-------+
                                     |                  |
                       gRPC (50051)  |                  | gRPC (3003)
                                     v                  v
                            +--------+--------+   +-----+-----------+
                            | Anomaly Engine  |   | Slowmode Engine |
                            | [services/...]  |   | [services/...]  |
                            +-----------------+   +-----------------+
```

### Repositori Struktur

- **`apps/client`**: Aplikasi dashboard administrasi berbasis **Next.js (React + Tailwind CSS)** untuk mengonfigurasi pengaturan server Discord, melihat log audit, dan mengelola panel peran mandiri (self-roles).
- **`apps/server`**: Backend utama dan pengendali bot Discord berbasis **NestJS (TypeScript)**. Bertugas berinteraksi dengan API Discord, mengelola database PostgreSQL via Prisma, dan mengorkestrasi microservices.
- **`services/slowmode-engine`**: Layanan **Rust** yang menghitung ambang batas aktivitas chat secara real-time dan menyarankan tingkat *slowmode* dinamis (Sepi, Sedang, Rame) menggunakan state in-memory.
- **`services/anomaly-engine`**: Layanan **Rust** berbasis **gRPC** yang memindai pesan secara real-time dari ancaman link phishing, anomali aktivitas pengguna, dan anomali perilaku server (guild baseline).

---

## Kebutuhan Sistem & Dependensi

Untuk menjalankan monorepo ini secara lokal, pastikan Anda memiliki perkakas berikut:

- **Runtime**: [Bun](https://bun.sh/) (untuk aplikasi JavaScript/TypeScript)
- **Rust Toolchain**: [Rustup & Cargo](https://rustup.rs/) (versi stable terbaru)
- **Database**: PostgreSQL
- **Orkestrasi gRPC**: `protoc` (Protocol Buffer Compiler) terpasang di sistem (dibutuhkan untuk kompilasi `.proto` di Rust)

---

## Panduan Memulai Cepat (Quick Start)

### 1. Setup Variabel Lingkungan (.env)

Salin berkas contoh `.env` di direktori `apps/server/.env` dan sesuaikan nilainya:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/nio_db"
DISCORD_BOT_TOKEN="your_discord_bot_token"
DISCORD_CLIENT_ID="your_discord_client_id"
DISCORD_CLIENT_SECRET="your_discord_client_secret"
SLOWMODE_ENGINE_URL="http://127.0.0.1:3003"
ANOMALY_ENGINE_URL="127.0.0.1:50051"
```

### 2. Migrasi Database

Lakukan inisialisasi skema database PostgreSQL menggunakan Prisma:

```bash
cd apps/server
bun install
bunx prisma db push
```

### 3. Menjalankan Layanan (Development Mode)

Gunakan perintah `Makefile` di root repositori untuk menjalankan layanan secara paralel di terminal Anda:

```bash
# Menjalankan Next.js Dashboard (Port 3000)
make dev-client

# Menjalankan NestJS Server & Bot (Port 3002)
make dev-server

# Menjalankan Rust Dynamic Slowmode (Port 3003)
make dev-slowmode

# Menjalankan Rust Anomaly Engine (Port 50051)
make dev-anomaly
```

---

## Protokol Komunikasi Internal

Komunikasi antar-layanan di dalam ekosistem `nio` mengikuti aturan berikut:

1. **gRPC Pertama (Internal)**: Setiap komunikasi *service-to-service* yang sensitif terhadap performa (seperti analisis pesan instan pada anomaly/phishing) wajib menggunakan protokol **gRPC**. Kontrak didefinisikan menggunakan Protocol Buffers (`.proto`).
2. **REST API (Eksternal)**: Komunikasi publik atau client-to-server (misalnya dashboard web ke server NestJS) tetap menggunakan protokol **HTTP/JSON REST API**.

### Kontrak protobuf Anomaly Engine

Kontrak gRPC untuk Anomaly Engine didefinisikan pada `/services/anomaly-engine/proto/anomaly/v1/anomaly.proto`:

```protobuf
service AnomalyEngine {
  rpc AnalyzeMessage(AnalyzeMessageRequest) returns (AnalyzeMessageResponse);
}
```

NestJS memanggil endpoint ini dengan batas waktu (timeout/deadline) **200ms** untuk memastikan performa pengiriman pesan di Discord tetap instan meskipun layanan Rust mengalami gangguan.

---

## Manajemen Perintah Monorepo (Makefile)

Perintah global tersedia di root repositori untuk menguji dan membangun proyek:

| Perintah | Deskripsi |
| --- | --- |
| `make dev-client` | Menjalankan Next.js dashboard lokal |
| `make dev-server` | Menjalankan bot & API NestJS lokal |
| `make dev-slowmode` | Menjalankan mesin slowmode Rust lokal |
| `make dev-anomaly` | Menjalankan mesin anomali gRPC Rust lokal |
| `make test` | Menjalankan semua test suite (TypeScript typecheck + Jest + Cargo test) |
| `make test-anomaly` | Menjalankan pengujian integrasi gRPC Rust |
| `make build-slowmode` | Kompilasi rilis binary untuk slowmode-engine |
| `make build-anomaly` | Kompilasi rilis binary untuk anomaly-engine |

---

## Pengujian

Anda dapat memverifikasi seluruh komponen monorepo bekerja dengan benar dengan menjalankan perintah pengujian terpadu:

```bash
make test
```

Ini akan menjalankan:
1. Pemeriksaan tipe (typecheck) TypeScript pada frontend dashboard.
2. Pengujian unit Jest pada backend NestJS.
3. Cargo test untuk pengujian unit & integrasi pada `slowmode-engine`.
4. Cargo test untuk verifikasi skenario anomali gRPC pada `anomaly-engine`.

---

## Lisensi

Proyek ini dilisensikan di bawah Lisensi MIT. Lihat file [LICENSE](LICENSE) di masing-masing subdirektori untuk informasi lebih lanjut.
