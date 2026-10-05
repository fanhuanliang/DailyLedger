export const annualBudgets = {
  version: 5,
  sql: `
    CREATE TABLE annual_budgets (
      id TEXT NOT NULL UNIQUE, year INTEGER PRIMARY KEY CHECK(year BETWEEN 1 AND 9999),
      overall_limit_cents INTEGER CHECK(overall_limit_cents IS NULL OR (typeof(overall_limit_cents)='integer' AND overall_limit_cents BETWEEN 0 AND 9007199254740991)),
      revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE category_budgets (
      id TEXT PRIMARY KEY, year INTEGER NOT NULL REFERENCES annual_budgets(year), category_id TEXT NOT NULL REFERENCES categories(id),
      limit_cents INTEGER NOT NULL CHECK(typeof(limit_cents)='integer' AND limit_cents BETWEEN 0 AND 9007199254740991),
      revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(year,category_id)
    );
  `,
};
