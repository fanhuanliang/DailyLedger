export const ledgerCore = {
  version: 2,
  sql: `
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('checking','savings','cash','credit_card')),
      opening_date TEXT NOT NULL,
      opening_balance_cents INTEGER NOT NULL,
      archived_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
      archived_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE UNIQUE INDEX categories_active_name_kind ON categories (kind, name) WHERE archived_at IS NULL;

    CREATE TABLE transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income','expense','refund','transfer')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      destination_account_id TEXT REFERENCES accounts(id),
      category_id TEXT REFERENCES categories(id),
      notes TEXT,
      source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','mcp','recurring')),
      import_batch_id TEXT,
      occurrence_id TEXT UNIQUE,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX transactions_account_date ON transactions (account_id, date);
    CREATE INDEX transactions_destination_date ON transactions (destination_account_id, date);
    CREATE INDEX transactions_category ON transactions (category_id);
    CREATE INDEX transactions_date ON transactions (date);
  `,
};
