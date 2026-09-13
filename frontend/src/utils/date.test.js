import { describe, it, expect } from "vitest";
import { todayIso, formatShortDate } from "./date";

describe("todayIso", () => {
  it("returns today's local calendar date as YYYY-MM-DD", () => {
    const now = new Date();
    const expected = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    expect(todayIso()).toBe(expected);
  });
});

describe("formatShortDate", () => {
  it("formats an ISO date as a short month + day", () => {
    expect(formatShortDate("2026-08-24")).toBe("Aug 24");
  });

  it("does not shift the date across a UTC day boundary", () => {
    // The regression this guards: parsing "YYYY-MM-DD" with `new Date(...)`
    // (UTC midnight) instead of local-date parsing can display the *previous*
    // day in timezones behind UTC. Jan 1st is the sharpest case (year edge).
    expect(formatShortDate("2026-01-01")).toBe("Jan 1");
  });

  it("returns an empty string for missing or malformed input", () => {
    expect(formatShortDate("")).toBe("");
    expect(formatShortDate(null)).toBe("");
    expect(formatShortDate(undefined)).toBe("");
  });
});
