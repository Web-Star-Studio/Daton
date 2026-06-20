import { describe, expect, it } from "vitest";
import { classifyUrgency, urgencyToPriority } from "../../../src/services/pendencias/types";

const NOW = new Date(2026, 5, 15, 10, 0, 0); // 2026-06-15 local

describe("classifyUrgency", () => {
  it("returns no_due for null", () => {
    expect(classifyUrgency(null, NOW, 7)).toBe("no_due");
  });
  it("returns overdue for a past date", () => {
    expect(classifyUrgency("2026-06-14", NOW, 7)).toBe("overdue");
  });
  it("returns due_soon for today", () => {
    expect(classifyUrgency("2026-06-15", NOW, 7)).toBe("due_soon");
  });
  it("returns due_soon at the dueSoonDays boundary", () => {
    expect(classifyUrgency("2026-06-22", NOW, 7)).toBe("due_soon"); // +7
  });
  it("returns upcoming just past the boundary", () => {
    expect(classifyUrgency("2026-06-23", NOW, 7)).toBe("upcoming"); // +8
  });
  it("accepts a Date and full ISO string", () => {
    expect(classifyUrgency(new Date(2026, 5, 14), NOW, 7)).toBe("overdue");
    expect(classifyUrgency("2026-06-20T23:00:00.000Z", NOW, 7)).toBe("due_soon");
  });
});

describe("urgencyToPriority", () => {
  it("maps urgencies to priorities, upcoming hidden", () => {
    expect(urgencyToPriority("overdue")).toBe("p1");
    expect(urgencyToPriority("due_soon")).toBe("p2");
    expect(urgencyToPriority("no_due")).toBe("p3");
    expect(urgencyToPriority("upcoming")).toBeNull();
  });
});
