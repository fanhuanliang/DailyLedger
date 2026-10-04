import type Database from 'better-sqlite3';

export function getHouseholdToday(db: Database.Database): string {
  const row = db.prepare('SELECT household_timezone FROM settings WHERE id = 1').get() as { household_timezone: string } | undefined;
  const timezone = row?.household_timezone ?? 'America/Los_Angeles';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}
