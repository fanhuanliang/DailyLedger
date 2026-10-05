export const savingsGoals = {
  version: 6,
  sql: `CREATE TABLE savings_goals (
    id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name))>0),
    target_cents INTEGER NOT NULL CHECK(typeof(target_cents)='integer' AND target_cents BETWEEN 1 AND 9007199254740991),
    savings_account_id TEXT NOT NULL REFERENCES accounts(id), deadline TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','archived')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE UNIQUE INDEX one_active_goal_per_account ON savings_goals(savings_account_id) WHERE status='active';`,
};
