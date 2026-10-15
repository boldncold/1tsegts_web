import { describe, expect, test } from "vitest";
import { DEFAULT_STORE_SETTINGS, nextOpening } from "./utils";

// Ulaanbaatar is UTC+8 all year. 2026-10-18 is a Sunday, 10-19 a Monday
// (closed by default), 10-20 a Tuesday.
const ub = (iso: string) => new Date(`${iso}+08:00`);
const settings = DEFAULT_STORE_SETTINGS; // 11:00–19:00, closed Mondays

describe("nextOpening", () => {
  test("is null while the store is open", () => {
    expect(nextOpening(settings, ub("2026-10-20T12:00"))).toBeNull();
  });

  test("before opening, it opens later today", () => {
    expect(nextOpening(settings, ub("2026-10-20T08:30"))).toEqual({ daysAhead: 0, weekday: 2, hour: 11 });
  });

  test("after closing, it opens tomorrow", () => {
    expect(nextOpening(settings, ub("2026-10-20T19:00"))).toEqual({ daysAhead: 1, weekday: 3, hour: 11 });
  });

  test("skips the closed Monday", () => {
    expect(nextOpening(settings, ub("2026-10-18T20:00"))).toEqual({ daysAhead: 2, weekday: 2, hour: 11 });
    expect(nextOpening(settings, ub("2026-10-19T12:00"))).toEqual({ daysAhead: 1, weekday: 2, hour: 11 });
  });

  test("uses Ulaanbaatar's date, not UTC's", () => {
    // 2026-10-20 01:00 in UB is still Monday 17:00 UTC.
    expect(nextOpening(settings, ub("2026-10-20T01:00"))).toEqual({ daysAhead: 0, weekday: 2, hour: 11 });
  });

  test("honours a forced closure through a date", () => {
    const closed = { ...settings, closedUntil: "2026-10-22" };
    expect(nextOpening(closed, ub("2026-10-20T12:00"))).toEqual({ daysAhead: 3, weekday: 5, hour: 11 });
  });

  test("opens on the usual closed day while that rule is suspended", () => {
    const noClosedDay = { ...settings, noClosedDayUntil: "2026-10-19" };
    expect(nextOpening(noClosedDay, ub("2026-10-18T20:00"))).toEqual({ daysAhead: 1, weekday: 1, hour: 11 });
  });
});
