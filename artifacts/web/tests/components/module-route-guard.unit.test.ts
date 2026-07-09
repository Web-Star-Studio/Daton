import { describe, expect, it } from "vitest";
import { matchesGuardedPath } from "@/components/layout/module-route-guard";

describe("matchesGuardedPath", () => {
  it("matches a prefix route and everything nested under it", () => {
    expect(matchesGuardedPath("/kpi", "/kpi")).toBe(true);
    expect(matchesGuardedPath("/kpi/indicadores", "/kpi")).toBe(true);
  });

  it("matches an exact route only at the index", () => {
    expect(matchesGuardedPath("/planos-acao", "/planos-acao", true)).toBe(true);
    expect(matchesGuardedPath("/planos-acao/478", "/planos-acao", true)).toBe(false);
  });

  // wouter serves the hub for "/planos-acao/" too, so a bare equality check would
  // let a user without the module walk past the guard by typing the trailing slash.
  it("treats a trailing slash as the same exact route", () => {
    expect(matchesGuardedPath("/planos-acao/", "/planos-acao", true)).toBe(true);
    expect(matchesGuardedPath("/planos-acao///", "/planos-acao", true)).toBe(true);
  });

  it("does not match a sibling route that merely shares the prefix string", () => {
    expect(matchesGuardedPath("/planos-acao-antigo", "/planos-acao", true)).toBe(false);
    expect(matchesGuardedPath("/kpi-legado", "/kpi")).toBe(false);
  });
});
