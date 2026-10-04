import 'dotenv/config';
import { openDatabase } from './db/connection';
import { createApp } from './app';

const port = Number(process.env.PORT ?? '5010');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
const timezone = process.env.HOUSEHOLD_TIMEZONE ?? 'America/Los_Angeles';
new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
const db = openDatabase(process.env.DB_PATH ?? './data/ledger.db', timezone);

const server = createApp(db, {
  appOrigin: process.env.APP_ORIGIN ?? 'http://127.0.0.1:5173',
  mcpToken: process.env.MCP_TOKEN,
  secureCookies: process.env.COOKIE_SECURE === 'true',
}).listen(port, process.env.HOST ?? '127.0.0.1', () => console.info('DailyLedger API ready.'));
function shutdown() { server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
