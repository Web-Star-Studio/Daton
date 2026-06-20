import { describe, expect, it } from "vitest";
import {
  computeFeedStatus,
  expectedMonthsFor,
  firstOverdueMonth,
} from "../../../src/services/kpi/feed-status";

// Fixed "now" = 2026-06-15 → for the current year, months 1..5 are due (currentMonth-1).
const NOW = new Date(2026, 5, 15);
const empty = (): (number | null)[] => Array(12).fill(null);

describe("firstOverdueMonth (monthly)", () => {
  it("flags the earliest due month that is empty", () => {
    expect(firstOverdueMonth(empty(), "monthly", null, 2026, NOW)).toBe(1);
  });
  it("returns null when all due months are filled", () => {
    const v = empty();
    for (let m = 1; m <= 5; m++) v[m - 1] = 10;
    expect(firstOverdueMonth(v, "monthly", null, 2026, NOW)).toBeNull();
  });
  it("ignores not-yet-due months (June onward)", () => {
    const v = empty();
    for (let m = 1; m <= 5; m++) v[m - 1] = 10; // 1..5 filled; 6.. empty but not due
    expect(firstOverdueMonth(v, "monthly", null, 2026, NOW)).toBeNull();
  });
});

describe("firstOverdueMonth (non-monthly)", () => {
  it("uses referenceMonth for quarterly", () => {
    // quarterly from ref month 1 → expected [1,4,7,10]; due months ≤5 → 1 and 4
    expect(firstOverdueMonth(empty(), "quarterly", 1, 2026, NOW)).toBe(1);
  });
  it("returns null with no referenceMonth", () => {
    expect(firstOverdueMonth(empty(), "annual", null, 2026, NOW)).toBeNull();
  });
});

describe("firstOverdueMonth (year boundaries)", () => {
  it("returns null for a future year", () => {
    expect(firstOverdueMonth(empty(), "monthly", null, 2027, NOW)).toBeNull();
  });
  it("treats a past year as all 12 due", () => {
    expect(firstOverdueMonth(empty(), "monthly", null, 2025, NOW)).toBe(1);
  });
});

describe("computeFeedStatus", () => {
  it("derives fed/overdue from firstOverdueMonth", () => {
    expect(computeFeedStatus(empty(), "monthly", null, 2026, NOW)).toBe("overdue");
    const v = empty();
    for (let m = 1; m <= 5; m++) v[m - 1] = 1;
    expect(computeFeedStatus(v, "monthly", null, 2026, NOW)).toBe("fed");
  });
});

describe("expectedMonthsFor", () => {
  it("maps periodicities to month sets", () => {
    expect(expectedMonthsFor("annual", 3)).toEqual([3]);
    expect(expectedMonthsFor("semiannual", 1)).toEqual([1, 7]);
    expect(expectedMonthsFor("quarterly", 2)).toEqual([2, 5, 8, 11]);
    expect(expectedMonthsFor("monthly", 1)).toEqual([]);
    expect(expectedMonthsFor("annual", null)).toEqual([]);
  });
});
