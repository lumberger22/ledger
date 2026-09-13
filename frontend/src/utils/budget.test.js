import { describe, it, expect } from "vitest";
import { activeTargetTotal, isOverAllocated } from "./budget";

describe("activeTargetTotal", () => {
  it("sums monthly_target across active categories only", () => {
    const categories = [
      { id: "rent", monthly_target: 2000, archived: false },
      { id: "food", monthly_target: 600, archived: false },
      { id: "old-gym", monthly_target: 50, archived: true },
    ];
    expect(activeTargetTotal(categories)).toBe(2600);
  });

  it("treats an empty draft target as 0 instead of NaN", () => {
    const categories = [{ id: "rent", monthly_target: "", archived: false }];
    expect(activeTargetTotal(categories)).toBe(0);
  });

  it("returns 0 for an empty category list", () => {
    expect(activeTargetTotal([])).toBe(0);
  });
});

describe("isOverAllocated", () => {
  it("is true once active targets exceed a manual income figure", () => {
    expect(isOverAllocated(2000, 2600)).toBe(true);
  });

  it("is false when targets are at or under income", () => {
    expect(isOverAllocated(2600, 2600)).toBe(false);
    expect(isOverAllocated(3000, 2600)).toBe(false);
  });

  it("never blocks when income is empty, null, or not a number", () => {
    expect(isOverAllocated("", 999999)).toBe(false);
    expect(isOverAllocated(null, 999999)).toBe(false);
    expect(isOverAllocated("not-a-number", 999999)).toBe(false);
  });

  it("accepts income as a string, matching a live text-input value", () => {
    expect(isOverAllocated("2000", 2600)).toBe(true);
  });
});
