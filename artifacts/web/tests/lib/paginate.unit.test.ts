import { describe, expect, it } from "vitest";
import { paginateList } from "@/lib/paginate";

const items = Array.from({ length: 840 }, (_, i) => i + 1);

describe("paginateList", () => {
  it("slices the requested page", () => {
    const r = paginateList(items, 1, 24);
    expect(r.pageItems).toHaveLength(24);
    expect(r.pageItems[0]).toBe(1);
    expect(r.pageItems[23]).toBe(24);
    expect(r.total).toBe(840);
    expect(r.totalPages).toBe(35);
    expect(r.page).toBe(1);
  });

  it("slices a middle page", () => {
    const r = paginateList(items, 2, 24);
    expect(r.pageItems[0]).toBe(25);
    expect(r.pageItems[23]).toBe(48);
  });

  it("returns the remainder on the last page", () => {
    const r = paginateList(items.slice(0, 50), 3, 24); // 50 items → 3 pages, last has 2
    expect(r.totalPages).toBe(3);
    expect(r.page).toBe(3);
    expect(r.pageItems).toEqual([49, 50]);
  });

  // A filter can shrink the list under the current page — the helper must clamp,
  // never render an empty page past the end.
  it("clamps a page beyond the end to the last page", () => {
    const r = paginateList(items.slice(0, 30), 99, 24);
    expect(r.page).toBe(2);
    expect(r.pageItems[0]).toBe(25);
  });

  it("clamps a page below 1 to the first page", () => {
    const r = paginateList(items, 0, 24);
    expect(r.page).toBe(1);
    expect(r.pageItems[0]).toBe(1);
  });

  it("reports one empty page for an empty list", () => {
    const r = paginateList([], 1, 24);
    expect(r).toEqual({ pageItems: [], page: 1, total: 0, totalPages: 1 });
  });
});
