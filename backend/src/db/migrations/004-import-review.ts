export const importReview = {
  version: 4,
  sql: `
    CREATE TABLE import_previews (
      id TEXT PRIMARY KEY, expires_at TEXT NOT NULL, payload_hash TEXT NOT NULL,
      rows_json TEXT NOT NULL, review_json TEXT NOT NULL, ledger_revision TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE import_batches (
      id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE,
      preview_id TEXT NOT NULL UNIQUE REFERENCES import_previews(id),
      source_label TEXT, payload_hash TEXT NOT NULL, request_hash TEXT NOT NULL,
      committed_at TEXT NOT NULL, result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX import_previews_expiry ON import_previews(expires_at);
  `,
};
