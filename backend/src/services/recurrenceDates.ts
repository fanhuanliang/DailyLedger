export interface Schedule {
    cadence: 'weekly' | 'biweekly' | 'monthly' | 'yearly';
    anchorDate: string;
    effectiveDate: string;
    endDate: string | null;
}
function utcDate(year: number, month: number, day: number): Date {
    const date = new Date(0);
    date.setUTCFullYear(year, month, day);
    date.setUTCHours(0, 0, 0, 0);
    return date;
}
function format(date: Date): string {
    const year = date.getUTCFullYear();
    return year > 9999 ? '~' : `${String(year).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
export function addCalendarDays(value: string, days: number): string {
    const [year, month, day] = value.split('-').map(Number) as [
        number,
        number,
        number
    ];
    return format(utcDate(year, month - 1, day + days));
}
export function recurrenceDates(schedule: Schedule, from: string, to: string): string[] {
    const lower = [schedule.anchorDate, schedule.effectiveDate, from].sort().at(-1)!;
    const upper = schedule.endDate && schedule.endDate < to ? schedule.endDate : to;
    if (lower > upper) {
        return [];
    }
    const [year, month, day] = schedule.anchorDate.split('-').map(Number) as [
        number,
        number,
        number
    ];
    const [fromYear, fromMonth] = lower.split('-').map(Number) as [
        number,
        number
    ];
    const weekly = schedule.cadence === 'weekly' || schedule.cadence === 'biweekly';
    const step = schedule.cadence === 'weekly' ? 7 : 14;
    let index = weekly ? Math.max(0, Math.floor((Date.parse(lower + 'T00:00:00Z') - Date.parse(schedule.anchorDate + 'T00:00:00Z')) / (86400000 * step))) : schedule.cadence === 'monthly' ? Math.max(0, (fromYear - year) * 12 + fromMonth - month) : Math.max(0, fromYear - year);
    const dates: string[] = [];
    for (let attempts = 0; attempts <= 10000; attempts++, index++) {
        let candidate: string;
        if (weekly) {
            candidate = addCalendarDays(schedule.anchorDate, index * step);
        }
        else {
            const targetYear = schedule.cadence === 'yearly' ? year + index : year + Math.floor((month - 1 + index) / 12);
            const targetMonth = schedule.cadence === 'yearly' ? month - 1 : (month - 1 + index) % 12;
            const lastDay = utcDate(targetYear, targetMonth + 1, 0).getUTCDate();
            candidate = format(utcDate(targetYear, targetMonth, Math.min(day, lastDay)));
        }
        if (candidate > upper) {
            return dates;
        }
        if (candidate >= lower) {
            dates.push(candidate);
        }
    }
    throw new Error('Schedule exceeds 10000 occurrences in this range.');
}
