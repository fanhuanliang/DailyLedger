import { useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import { formatDateInTimeZone } from '../lib/date';

interface SettingsResponse { household_timezone: string; currency: string }

export function useHouseholdToday(): string {
  const [today, setToday] = useState(() => formatDateInTimeZone(new Date(), 'America/Los_Angeles'));

  useEffect(() => {
    let cancelled = false;
    apiGet<SettingsResponse>('/settings').then((result) => {
      if (!cancelled) setToday(formatDateInTimeZone(new Date(), result.data.household_timezone));
    }).catch(() => { /* keep the browser-local fallback if settings cannot be loaded */ });
    return () => { cancelled = true; };
  }, []);

  return today;
}
