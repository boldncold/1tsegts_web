/**
 * Whether a dish can be ordered and whether the store is open: the one copy
 * of these rules. The server enforces them when an order is placed
 * (convex/orders.ts, convex/lib/orderPricing.ts); the menu and cart import
 * them through src/lib/utils.ts to show the same answer. Pure, no Convex APIs.
 *
 * Every calendar rule runs on Ulaanbaatar time (UTC+8, no DST). The server
 * runs in UTC and a phone can be set to any zone, so "today" must never come
 * from the machine's clock settings.
 */

export type DishStatus = "available" | "sold_out_today" | "hidden" | "daily_special";

/** The menu fields these rules read; both the Convex row and the client MenuItem have them. */
export interface DishAvailabilityFields {
  available: boolean;
  status?: DishStatus;
  statusUntil?: number;
  scheduledDays?: number[]; // 0=Sun … 6=Sat
  todayOnly?: boolean;
}

export interface StoreHours {
  openHour: number;
  closeHour: number;
  closedDays: number[]; // 0=Sun … 6=Sat
  closedUntil: string | null; // YYYY-MM-DD, closed through this date
  noClosedDayUntil: string | null; // YYYY-MM-DD, closed-day rule suspended through this date
}

export const DEFAULT_STORE_SETTINGS: StoreHours = {
  openHour: 11,
  closeHour: 19,
  closedDays: [1], // Monday
  closedUntil: null,
  noClosedDayUntil: null,
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Date (YYYY-MM-DD), weekday (0=Sun) and hour (0–23) in Ulaanbaatar. */
export function ulaanbaatarClock(now: Date): { date: string; weekday: number; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ulaanbaatar",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS.indexOf(parts.weekday),
    hour: Number(parts.hour) % 24,
  };
}

/**
 * Draft dishes are unpublished: the admin is still preparing them. Specials
 * sit in the Draft category but are published through `pool: "specials"`.
 */
export function isPublished(item: { category: string; pool?: string }): boolean {
  return item.category !== "Draft" || item.pool === "specials";
}

/** Whether a dish shows on the menu, and whether it can be ordered, at `now`. */
export function dishAvailability(
  item: DishAvailabilityFields,
  now: Date = new Date(),
): { isVisible: boolean; isAvailable: boolean } {
  const nowMs = now.getTime();
  const until = item.statusUntil;

  if (item.todayOnly) {
    const on = !!until && nowMs < until;
    return { isVisible: on, isAvailable: on };
  }

  if (item.scheduledDays && item.scheduledDays.length > 0) {
    if (!item.scheduledDays.includes(ulaanbaatarClock(now).weekday)) {
      return { isVisible: false, isAvailable: false };
    }
  }

  switch (item.status) {
    case undefined:
      return { isVisible: true, isAvailable: item.available };
    case "hidden":
      return { isVisible: false, isAvailable: false };
    case "available":
      return { isVisible: true, isAvailable: true };
    case "sold_out_today":
      // Sold out until statusUntil (set to midnight by the dashboard), then back on.
      return { isVisible: true, isAvailable: !(until && nowMs < until) };
    case "daily_special": {
      // Legacy Firestore status: on until statusUntil, then hidden.
      const on = !!until && nowMs < until;
      return { isVisible: on, isAvailable: on };
    }
    default:
      return { isVisible: true, isAvailable: item.available };
  }
}

/** Whether the store takes orders at `now`. */
export function isStoreOpen(settings: StoreHours = DEFAULT_STORE_SETTINGS, now: Date = new Date()): boolean {
  const { date, weekday, hour } = ulaanbaatarClock(now);
  if (settings.closedUntil && date <= settings.closedUntil) return false;
  const ignoringClosedDays = !!settings.noClosedDayUntil && date <= settings.noClosedDayUntil;
  if (!ignoringClosedDays && settings.closedDays.includes(weekday)) return false;
  return hour >= settings.openHour && hour < settings.closeHour;
}
