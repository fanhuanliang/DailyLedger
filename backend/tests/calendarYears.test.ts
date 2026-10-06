import {isValidCalendarDate} from '../src/lib/calendarDate';
test('four-digit calendar years below100 validate without JavaScript1900 remapping',()=>{
 expect(isValidCalendarDate('0001-01-01')).toBe(true);expect(isValidCalendarDate('0099-02-28')).toBe(true);
 expect(isValidCalendarDate('0000-01-01')).toBe(false);expect(isValidCalendarDate('0099-02-29')).toBe(false);expect(isValidCalendarDate('0100-02-29')).toBe(false);expect(isValidCalendarDate('0400-02-29')).toBe(true);
});
