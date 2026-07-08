#!/usr/bin/env bash

# PostgreSQL Database Migration Script
# Safely copies one database to another using custom-format pg_dump and pg_restore.

set -Eeuo pipefail

show_help() {
  cat << EOF
Usage:
  SOURCE_DATABASE_URL="..." TARGET_DATABASE_URL="..." [CONFIRM_REPLACE_TARGET=true] $0

Options:
  -h, --help    Show this help text.

Environment Variables:
  SOURCE_DATABASE_URL      Required. PostgreSQL connection URL for the source database.
  TARGET_DATABASE_URL      Required. PostgreSQL connection URL for the target database.
  CONFIRM_REPLACE_TARGET   Required to run. Must be set to "true" to authorize dropping the target schema.

Example:
  SOURCE_DATABASE_URL="postgresql://user:pass@host/source_db" \\
  TARGET_DATABASE_URL="postgresql://user:pass@host/target_db" \\
  CONFIRM_REPLACE_TARGET=true \\
  $0
EOF
}

# Handle help flags
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  show_help
  exit 0
fi

# 1. Validate environment
if [[ -z "${SOURCE_DATABASE_URL:-}" ]]; then
  echo "Error: SOURCE_DATABASE_URL is not set." >&2
  show_help
  exit 1
fi

if [[ -z "${TARGET_DATABASE_URL:-}" ]]; then
  echo "Error: TARGET_DATABASE_URL is not set." >&2
  show_help
  exit 1
fi

if [[ "${SOURCE_DATABASE_URL}" == "${TARGET_DATABASE_URL}" ]]; then
  echo "Error: Source and Target database URLs are identical. Refusing to run." >&2
  exit 1
fi

if [[ "${CONFIRM_REPLACE_TARGET:-}" != "true" ]]; then
  echo "Error: CONFIRM_REPLACE_TARGET=true is required to authorize dropping target public schema." >&2
  exit 1
fi

# 2. Validate CLI tools availability
for tool in pg_dump pg_restore psql; do
  if ! command -v "$tool" &> /dev/null; then
    echo "Error: Required tool '$tool' is not installed or not in PATH." >&2
    exit 1
  fi
done

# 3. Create temporary workspace with auto-cleanup
TEMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "${TEMP_DIR}"
}
trap cleanup EXIT

DUMP_FILE="${TEMP_DIR}/db_migration.dump"

echo "=== Starting database migration ==="
echo "Source: $(echo "${SOURCE_DATABASE_URL}" | sed -E 's/:[^@:]+@/:****@/')"
echo "Target: $(echo "${TARGET_DATABASE_URL}" | sed -E 's/:[^@:]+@/:****@/')"
echo "-----------------------------------"

# 4. Dump source database
echo "[1/3] Dumping source database..."
pg_dump --format=custom --no-owner --no-acl --file="${DUMP_FILE}" "${SOURCE_DATABASE_URL}"

# 5. Reset target public schema
echo "[2/3] Resetting target database schema..."
psql "${TARGET_DATABASE_URL}" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

# 6. Restore to target database
echo "[3/3] Restoring dump to target database..."
pg_restore --no-owner --no-acl --dbname="${TARGET_DATABASE_URL}" "${DUMP_FILE}"

echo "-----------------------------------"
echo "=== Database migration completed successfully ==="
EOF
