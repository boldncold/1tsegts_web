import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MenuItem, StoreSettings } from '../types';
import { dishAvailability, isStoreOpen } from '../../convex/lib/availability';

// The availability rules live in convex/lib/availability.ts so the server
// enforces exactly what the menu shows. Re-exported under the names the
// components already use.
export { DEFAULT_STORE_SETTINGS, isStoreOpen } from '../../convex/lib/availability';

export function getDynamicStatus(item: MenuItem, now: Date = new Date()): { isVisible: boolean; isAvailable: boolean } {
  return dishAvailability(item, now);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getMidnightTonight(): number {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type Schedule =
  | { kind: 'today' }
  | { kind: 'weekends' }
  | { kind: 'weekdays' }
  | { kind: 'days'; days: number[] }; // 0=Sun … 6=Sat, sorted

/** A dish's limited availability, if any: today only, or a weekly schedule short of every day. */
export function getSchedule(item: MenuItem): Schedule | null {
  // Today Only (new field or legacy daily_special)
  if (item.todayOnly) return { kind: 'today' };
  if (item.status === 'daily_special' && item.statusUntil && Date.now() < item.statusUntil) return { kind: 'today' };

  if (!item.scheduledDays || item.scheduledDays.length === 0) return null;

  const days = [...item.scheduledDays].sort((a, b) => a - b);
  if (days.length === 7) return null;
  if (days.join(',') === '0,6') return { kind: 'weekends' };
  if (days.join(',') === '1,2,3,4,5') return { kind: 'weekdays' };
  return { kind: 'days', days };
}

/** English schedule label for the admin dashboard. */
export function getScheduleLabel(item: MenuItem): string | null {
  const schedule = getSchedule(item);
  if (!schedule) return null;
  switch (schedule.kind) {
    case 'today': return 'Today Only';
    case 'weekends': return 'Weekends';
    case 'weekdays': return 'Weekdays';
    case 'days':
      return schedule.days.length === 1
        ? `${DAY_SHORT[schedule.days[0]]} Only`
        : schedule.days.map(d => DAY_SHORT[d]).join(' · ');
  }
}

/**
 * When a closed store next opens, in Ulaanbaatar time, by the same rules as
 * isStoreOpen. null while open, or if nothing opens within two weeks.
 */
export function nextOpening(
  settings: StoreSettings,
  now: Date = new Date(),
): { daysAhead: number; weekday: number; hour: number } | null {
  if (isStoreOpen(settings, now)) return null;

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ulaanbaatar',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour);
  // Walk calendar days as UTC dates so no local time zone leaks in.
  const today = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));

  for (let daysAhead = 0; daysAhead <= 14; daysAhead++) {
    const day = new Date(today + daysAhead * 86_400_000);
    const date = day.toISOString().slice(0, 10);
    const weekday = day.getUTCDay();
    if (settings.closedUntil && date <= settings.closedUntil) continue;
    const ignoringClosedDays = settings.noClosedDayUntil && date <= settings.noClosedDayUntil;
    if (!ignoringClosedDays && settings.closedDays.includes(weekday)) continue;
    if (daysAhead === 0 && hour >= settings.openHour) continue;
    return { daysAhead, weekday, hour: settings.openHour };
  }
  return null;
}
