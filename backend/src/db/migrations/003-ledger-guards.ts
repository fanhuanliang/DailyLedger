const uuidSql = "lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()%4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))";
const defaults = [
  ['Housing', 'expense'], ['Groceries', 'expense'], ['Utilities', 'expense'], ['Transportation', 'expense'],
  ['Dining', 'expense'], ['Healthcare', 'expense'], ['Shopping', 'expense'], ['Entertainment', 'expense'],
  ['Salary', 'income'], ['Other income', 'income'],
] as const;

export const ledgerGuards = {
  version: 3,
  sql: `
    CREATE TRIGGER accounts_money_insert BEFORE INSERT ON accounts
    WHEN typeof(NEW.opening_balance_cents) != 'integer' OR NEW.opening_balance_cents NOT BETWEEN -9007199254740991 AND 9007199254740991
    BEGIN SELECT RAISE(ABORT, 'Opening balance must be safe integer cents'); END;
    CREATE TRIGGER accounts_money_update BEFORE UPDATE OF opening_balance_cents ON accounts
    WHEN typeof(NEW.opening_balance_cents) != 'integer' OR NEW.opening_balance_cents NOT BETWEEN -9007199254740991 AND 9007199254740991
    BEGIN SELECT RAISE(ABORT, 'Opening balance must be safe integer cents'); END;
    CREATE TRIGGER transactions_money_insert BEFORE INSERT ON transactions
    WHEN typeof(NEW.amount_cents) != 'integer' OR NEW.amount_cents NOT BETWEEN 1 AND 9007199254740991
    BEGIN SELECT RAISE(ABORT, 'Transaction amount must be positive safe integer cents'); END;
    CREATE TRIGGER transactions_money_update BEFORE UPDATE OF amount_cents ON transactions
    WHEN typeof(NEW.amount_cents) != 'integer' OR NEW.amount_cents NOT BETWEEN 1 AND 9007199254740991
    BEGIN SELECT RAISE(ABORT, 'Transaction amount must be positive safe integer cents'); END;
    ${defaults.map(([name, kind]) => `INSERT INTO categories (id,name,kind) SELECT ${uuidSql}, '${name}', '${kind}' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = '${name}' AND kind = '${kind}');`).join('\n')}
  `,
};
