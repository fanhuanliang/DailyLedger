export const recurringSchedules={version:7,sql:`
 CREATE TABLE recurring_templates (
 id TEXT PRIMARY KEY,name TEXT NOT NULL CHECK(length(trim(name))>0),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),ended_on TEXT,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 CREATE TABLE recurring_versions (
 id TEXT PRIMARY KEY,template_id TEXT NOT NULL REFERENCES recurring_templates(id),effective_date TEXT NOT NULL,generation_from TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents)='integer' AND amount_cents BETWEEN 1 AND 9007199254740991),
 type TEXT NOT NULL CHECK(type IN ('income','expense')),account_id TEXT NOT NULL REFERENCES accounts(id),category_id TEXT NOT NULL REFERENCES categories(id),description TEXT NOT NULL,
 cadence TEXT NOT NULL CHECK(cadence IN ('weekly','biweekly','monthly','yearly')),anchor_date TEXT NOT NULL,end_date TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(template_id,effective_date));
 CREATE TABLE occurrences (
 id TEXT PRIMARY KEY,template_id TEXT NOT NULL REFERENCES recurring_templates(id),due_date TEXT NOT NULL,version_id TEXT NOT NULL REFERENCES recurring_versions(id),
 status TEXT NOT NULL DEFAULT 'unconfirmed' CHECK(status IN ('unconfirmed','confirmed','skipped')),revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(template_id,due_date));
 CREATE INDEX occurrences_due_status ON occurrences(due_date,status);
 CREATE TRIGGER reopen_deleted_recurring_transaction AFTER DELETE ON transactions WHEN OLD.occurrence_id IS NOT NULL BEGIN
 UPDATE occurrences SET status='unconfirmed',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=OLD.occurrence_id;
 END;
 CREATE TRIGGER preserve_linked_occurrence BEFORE DELETE ON occurrences WHEN EXISTS(SELECT 1 FROM transactions WHERE occurrence_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Linked occurrence must be preserved'); END;
`};
