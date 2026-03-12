/**
 * Timezone utilities for Creator Command.
 *
 * All dates are stored in UTC in the database.
 * All display and input uses the user's IANA timezone (stored in profiles.timezone).
 */

/** Detect the browser's IANA timezone string */
export function detectBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
}

/**
 * Convert a UTC ISO string to a `datetime-local` input value (YYYY-MM-DDTHH:mm)
 * in the given timezone, so the input shows the local time.
 */
export function utcToLocalInput(utcIso: string, tz: string): string {
  const date = new Date(utcIso);
  // Format as YYYY-MM-DDTHH:mm in the target timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  const timeStr = `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
  return `${dateStr}T${timeStr}`;
}

/**
 * Convert a `datetime-local` input value (YYYY-MM-DDTHH:mm, no timezone info)
 * interpreted as being in `tz`, into a UTC ISO string for storage.
 */
export function localInputToUtc(localValue: string, tz: string): string {
  // localValue is like "2026-03-15T09:00"
  // We need to interpret it as being in `tz` and convert to UTC.
  // Strategy: use Intl to find the UTC offset at that moment in the given timezone.
  const [datePart, timePart] = localValue.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = (timePart || '00:00').split(':').map(Number);

  // Create a date assuming UTC first, then adjust for the offset
  const naiveUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Find what time this UTC moment is in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const localInTz = formatter.formatToParts(naiveUtc);
  const get = (type: string) => Number(localInTz.find((p) => p.type === type)?.value ?? '0');
  const tzHour = get('hour') === 24 ? 0 : get('hour');

  const offsetMs =
    Date.UTC(get('year'), get('month') - 1, get('day'), tzHour, get('minute')) -
    naiveUtc.getTime();

  // The actual UTC time is naiveUtc minus the offset
  return new Date(naiveUtc.getTime() - offsetMs).toISOString();
}

/**
 * Format a UTC ISO string for display in the user's timezone.
 * e.g. "Mar 15, 2026 9:00 AM"
 */
export function formatInTz(utcIso: string, tz: string, opts?: Intl.DateTimeFormatOptions): string {
  const defaults: Intl.DateTimeFormatOptions = {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };
  return new Intl.DateTimeFormat('en-US', { ...defaults, ...opts }).format(new Date(utcIso));
}

/**
 * Get the "now" value for a datetime-local input min= attribute
 * in the user's timezone (so they can't schedule in the past).
 */
export function nowAsLocalInput(tz: string): string {
  return utcToLocalInput(new Date().toISOString(), tz);
}

/**
 * Get the hour (0-23) and day-of-week (0=Sun) of a UTC ISO string
 * in the user's timezone. Used for the best-time heatmap.
 */
export function getLocalDayAndHour(utcIso: string, tz: string): { day: number; hour: number } {
  const date = new Date(utcIso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);

  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const hour = Number(hourStr) % 24;

  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const day = days.indexOf(weekdayStr);

  return { day: day >= 0 ? day : 0, hour };
}

/** Common IANA timezones for the settings dropdown */
export const COMMON_TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern Time (ET)' },
  { value: 'America/Chicago',     label: 'Central Time (CT)' },
  { value: 'America/Denver',      label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage',   label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii Time (HT)' },
  { value: 'America/Toronto',     label: 'Toronto (ET)' },
  { value: 'America/Vancouver',   label: 'Vancouver (PT)' },
  { value: 'Europe/London',       label: 'London (GMT/BST)' },
  { value: 'Europe/Paris',        label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin',       label: 'Berlin (CET/CEST)' },
  { value: 'Europe/Amsterdam',    label: 'Amsterdam (CET/CEST)' },
  { value: 'Europe/Madrid',       label: 'Madrid (CET/CEST)' },
  { value: 'Europe/Rome',         label: 'Rome (CET/CEST)' },
  { value: 'Europe/Stockholm',    label: 'Stockholm (CET/CEST)' },
  { value: 'Europe/Zurich',       label: 'Zurich (CET/CEST)' },
  { value: 'Europe/Warsaw',       label: 'Warsaw (CET/CEST)' },
  { value: 'Europe/Moscow',       label: 'Moscow (MSK)' },
  { value: 'Asia/Dubai',          label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata',        label: 'India (IST)' },
  { value: 'Asia/Singapore',      label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo',          label: 'Tokyo (JST)' },
  { value: 'Asia/Seoul',          label: 'Seoul (KST)' },
  { value: 'Asia/Shanghai',       label: 'Shanghai (CST)' },
  { value: 'Asia/Hong_Kong',      label: 'Hong Kong (HKT)' },
  { value: 'Asia/Jakarta',        label: 'Jakarta (WIB)' },
  { value: 'Asia/Bangkok',        label: 'Bangkok (ICT)' },
  { value: 'Australia/Sydney',    label: 'Sydney (AEST/AEDT)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST/AEDT)' },
  { value: 'Australia/Brisbane',  label: 'Brisbane (AEST)' },
  { value: 'Pacific/Auckland',    label: 'Auckland (NZST/NZDT)' },
  { value: 'America/Sao_Paulo',   label: 'São Paulo (BRT)' },
  { value: 'America/Mexico_City', label: 'Mexico City (CST/CDT)' },
  { value: 'America/Bogota',      label: 'Bogotá (COT)' },
  { value: 'America/Lima',        label: 'Lima (PET)' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires (ART)' },
  { value: 'Africa/Cairo',        label: 'Cairo (EET)' },
  { value: 'Africa/Lagos',        label: 'Lagos (WAT)' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg (SAST)' },
  { value: 'UTC',                 label: 'UTC' },
];
