import { describe, expect, it } from "vitest";
import {
  groupByPriority,
  priorityOf,
  formatRelativeDue,
  formatLastAccess,
  itemsByDay,
  URGENCY_META,
  type Pendencia,
} from "@/lib/pendencias-format";

const NOW = new Date(2026, 5, 15, 9, 30, 0); // 2026-06-15 09:30 local

function item(id: string, urgency: Pendencia["urgency"], dueDate: string | null): Pendencia {
  return {
    id,
    source: "action_plan",
    sourceLabel: "Plano de ação",
    title: id,
    statusLabel: "",
    dueDate,
    urgency,
    responsibleUserId: 1,
    link: { route: "/planos-acao/1", ctaLabel: "Ver plano" },
  };
}

describe("priorityOf / URGENCY_META", () => {
  it("maps urgency to priority", () => {
    expect(priorityOf("overdue")).toBe("p1");
    expect(priorityOf("due_soon")).toBe("p2");
    expect(priorityOf("no_due")).toBe("p3");
    expect(priorityOf("upcoming")).toBeNull();
  });
  it("exposes a danger/warning/info badge per actionable urgency", () => {
    expect(URGENCY_META.overdue.badgeVariant).toBe("danger");
    expect(URGENCY_META.due_soon.badgeVariant).toBe("warning");
    expect(URGENCY_META.no_due.badgeVariant).toBe("info");
  });
});

describe("groupByPriority", () => {
  it("groups into p1/p2/p3, drops upcoming, sorts by dueDate asc (nulls last)", () => {
    const items = [
      item("a", "due_soon", "2026-06-18"),
      item("b", "overdue", "2026-06-10"),
      item("c", "overdue", "2026-06-05"),
      item("d", "no_due", null),
      item("e", "upcoming", "2026-08-01"),
    ];
    const g = groupByPriority(items);
    expect(g.p1.map((i) => i.id)).toEqual(["c", "b"]); // earlier due first
    expect(g.p2.map((i) => i.id)).toEqual(["a"]);
    expect(g.p3.map((i) => i.id)).toEqual(["d"]);
    expect(JSON.stringify(g)).not.toContain('"e"'); // upcoming excluded
  });
});

describe("formatRelativeDue", () => {
  it("formats overdue / today / future deadlines in PT-BR", () => {
    expect(formatRelativeDue("2026-06-14", NOW)).toBe("venceu ontem");
    expect(formatRelativeDue("2026-06-10", NOW)).toBe("venceu há 5 dias");
    expect(formatRelativeDue("2026-06-15", NOW)).toBe("vence hoje");
    expect(formatRelativeDue("2026-06-16", NOW)).toBe("vence amanhã");
    expect(formatRelativeDue("2026-06-22", NOW)).toBe("vence em 7 dias");
    expect(formatRelativeDue(null, NOW)).toBe("sem prazo");
  });
});

describe("formatLastAccess", () => {
  it("formats today as time and past days as date", () => {
    expect(formatLastAccess("2026-06-15T08:12:00", NOW)).toBe("hoje às 08:12");
    expect(formatLastAccess("2026-06-12T14:30:00", NOW)).toBe("12/06 às 14:30");
    expect(formatLastAccess(null, NOW)).toBe("—");
  });
});

describe("itemsByDay", () => {
  it("buckets dated items by YYYY-MM-DD and drops null-due items", () => {
    const map = itemsByDay([
      item("a", "overdue", "2026-06-10"),
      item("b", "due_soon", "2026-06-10"),
      item("c", "no_due", null),
      item("d", "upcoming", "2026-07-01T08:00:00.000Z"),
    ]);
    expect(map.get("2026-06-10")?.map((i) => i.id)).toEqual(["a", "b"]);
    expect(map.has("2026-07-01")).toBe(true);
    expect([...map.values()].flat().some((i) => i.id === "c")).toBe(false);
  });
});
