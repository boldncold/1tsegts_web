import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MenuItem, StoreSettings } from '../types';

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  openHour: 11,
  closeHour: 19,
  closedDays: [1],        // Monday
  closedUntil: null,
  noClosedDayUntil: null,
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getMidnightTonight(): number {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getScheduleLabel(item: MenuItem): string | null {
  // Today Only (new field or legacy daily_special)
  if (item.todayOnly) return 'Today Only';
  if (item.status === 'daily_special' && item.statusUntil && Date.now() < item.statusUntil) return 'Today Only';

  if (!item.scheduledDays || item.scheduledDays.length === 0) return null;

  const days = [...item.scheduledDays].sort((a, b) => a - b);
  if (days.length === 7) return null;
  if (days.join(',') === '0,6') return 'Weekends';
  if (days.join(',') === '1,2,3,4,5') return 'Weekdays';
  if (days.length === 1) return `${DAY_SHORT[days[0]]} Only`;
  return days.map(d => DAY_SHORT[d]).join(' · ');
}

export function getDynamicStatus(item: MenuItem): { isVisible: boolean, isAvailable: boolean } {
  const now = Date.now();
  const todayDOW = new Date().getDay(); // 0=Sun … 6=Sat

  // Today Only
  if (item.todayOnly) {
    if (item.statusUntil && now < item.statusUntil) {
      return { isVisible: true, isAvailable: true };
    }
    return { isVisible: false, isAvailable: false };
  }

  // Recurring weekly schedule
  if (item.scheduledDays && item.scheduledDays.length > 0) {
    if (!item.scheduledDays.includes(todayDOW)) {
      return { isVisible: false, isAvailable: false };
    }
  }

  if (!item.status) {
    return { isVisible: true, isAvailable: item.available };
  }

  switch (item.status) {
    case 'hidden':
      return { isVisible: false, isAvailable: false };

    case 'available':
      return { isVisible: true, isAvailable: true };

    case 'sold_out_today':
      if (item.statusUntil && now < item.statusUntil) {
        return { isVisible: true, isAvailable: false };
      }
      return { isVisible: true, isAvailable: true };

    case 'daily_special': // backward compat for existing Firestore docs
      if (item.statusUntil && now < item.statusUntil) {
        return { isVisible: true, isAvailable: true };
      }
      return { isVisible: false, isAvailable: false };

    default:
      return { isVisible: true, isAvailable: item.available };
  }
}

export function isStoreOpen(settings: StoreSettings = DEFAULT_STORE_SETTINGS): boolean {
  const now = new Date();

  // Current date in Ulaanbaatar as YYYY-MM-DD (lexicographically comparable)
  const currentDateUB = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ulaanbaatar',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);

  // Forced closure override
  if (settings.closedUntil && currentDateUB <= settings.closedUntil) return false;

  // Get hour (0-23) in Ulaanbaatar
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ulaanbaatar',
    hour: 'numeric',
    hour12: false,
  }).format(now);

  // Get weekday index (0=Sun … 6=Sat) in Ulaanbaatar
  const weekdayShort = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ulaanbaatar',
    weekday: 'short',
  }).format(now);
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayShort);

  // hour12: false can return "24" for midnight in some environments
  const hour = hourStr === '24' ? 0 : parseInt(hourStr, 10);

  // Check closed days unless the "no closed day" override is active
  const ignoringClosedDays =
    settings.noClosedDayUntil && currentDateUB <= settings.noClosedDayUntil;
  if (!ignoringClosedDays && settings.closedDays.includes(weekdayIndex)) return false;

  if (hour >= settings.openHour && hour < settings.closeHour) return true;

  return false;
}
