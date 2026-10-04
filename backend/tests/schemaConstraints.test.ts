import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/db/connection';

describe('Schema: safe integer cents and required category defaults', () => {
  test.each([1.5, Number.MAX_SAFE_INTEGER + 1])('account insert/update rejects %s', (amount) => {
    const db = openDatabase(':memory:');
    try {
      const id = randomUUID();
      const insert = db.prepare("INSERT INTO accounts(id,name,type,opening_date,opening_balance_cents) VALUES(?, 'Test', 'cash', '2026-01-01', ?)");
      expect(() => insert.run(id, amount)).toThrow();
      insert.run(id, 0);
      expect(() => db.prepare('UPDATE accounts SET opening_balance_cents = ? WHERE id = ?').run(amount, id)).toThrow();
    } finally { db.close(); }
  });
  test.each([1.5, Number.MAX_SAFE_INTEGER + 1])('transaction insert/update rejects %s', (amount) => {
    const db = openDatabase(':memory:');
    try {
      const source = randomUUID(); const destination = randomUUID(); const category = randomUUID(); const id = randomUUID();
      for (const account of [source, destination]) db.prepare("INSERT INTO accounts(id,name,type,opening_date,opening_balance_cents) VALUES(?,'Test','cash','2026-01-01',0)").run(account);
      db.prepare("INSERT INTO categories(id,name,kind) VALUES(?,'Test expense','expense')").run(category);
      const insert = db.prepare("INSERT INTO transactions(id,date,description,type,amount_cents,account_id,destination_account_id) VALUES(?,'2026-01-02','Test','transfer',?,?,?)");
      expect(() => insert.run(id, amount, source, destination)).toThrow();
      insert.run(id, 1, source, destination);
      expect(() => db.prepare('UPDATE transactions SET amount_cents = ? WHERE id = ?').run(amount, id)).toThrow();
    } finally { db.close(); }
  });
  test('seeds required expense and income categories on a real migrated database', () => {
    const db = openDatabase(':memory:');
    try {
      const rows = db.prepare('SELECT name,kind FROM categories').all() as { name: string; kind: string }[];
      expect(rows.filter((row) => row.kind === 'expense').map((row) => row.name)).toEqual(expect.arrayContaining(['Housing','Groceries','Utilities','Transportation','Dining','Healthcare','Shopping','Entertainment']));
      expect(rows.filter((row) => row.kind === 'income').map((row) => row.name)).toEqual(expect.arrayContaining(['Salary','Other income']));
    } finally { db.close(); }
  });
});
