export const initialSettings = {
  version: 1,
  sql: `CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    household_timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    currency TEXT NOT NULL CHECK (currency = 'USD'),
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ); INSERT INTO settings (id, currency) VALUES (1, 'USD');`
};
