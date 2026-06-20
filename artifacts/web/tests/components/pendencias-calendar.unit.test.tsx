import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PendenciasCalendar } from "@/components/pendencias/PendenciasCalendar";
import type { Pendencia } from "@/lib/pendencias-format";

function item(id: string, dueDate: string): Pendencia {
  return {
    id, source: "action_plan", sourceLabel: "Plano de ação", title: id,
    statusLabel: "", dueDate, urgency: "overdue", responsibleUserId: 1,
    link: { route: "/planos-acao/1", ctaLabel: "Ver" },
  };
}

describe("PendenciasCalendar", () => {
  it("renders the month label and marks days that have items", () => {
    render(
      <PendenciasCalendar
        items={[item("a", "2026-06-10"), item("b", "2026-06-10")]}
        month={new Date(2026, 5, 1)}
        onMonthChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/junho de 2026/i)).toBeInTheDocument();
    // day 10 cell is labelled with its item count (unambiguous vs. the day-number "2")
    expect(screen.getByLabelText(/Dia 10: 2 pendência/)).toBeInTheDocument();
  });

  it("calls onMonthChange when navigating months", async () => {
    const onMonthChange = vi.fn();
    render(<PendenciasCalendar items={[]} month={new Date(2026, 5, 1)} onMonthChange={onMonthChange} />);
    await userEvent.click(screen.getByLabelText("Próximo mês"));
    expect(onMonthChange).toHaveBeenCalledTimes(1);
    const arg = onMonthChange.mock.calls[0][0] as Date;
    expect(arg.getMonth()).toBe(6); // July (0-indexed)
  });

  it("renders item chips with titles and a +N overflow, and opens the day detail on click", async () => {
    const items = [
      item("Alvará de funcionamento", "2026-06-14"),
      item("Matriz de treinamento", "2026-06-14"),
      item("Plano de contingência", "2026-06-14"),
    ];
    render(
      <PendenciasCalendar items={items} month={new Date(2026, 5, 1)} onMonthChange={vi.fn()} />,
    );
    // First two titles show as chips in the day cell.
    expect(screen.getByText("Alvará de funcionamento")).toBeInTheDocument();
    expect(screen.getByText("Matriz de treinamento")).toBeInTheDocument();
    // Third item overflows into the "+N mais" line.
    expect(screen.getByText("+1 mais")).toBeInTheDocument();
    // The third title is NOT shown as a chip until the day is opened.
    expect(screen.queryByText("Plano de contingência")).not.toBeInTheDocument();
    // Clicking the day opens the detail panel listing the overflow item.
    await userEvent.click(screen.getByLabelText(/Dia 14: 3 pendência/));
    expect(screen.getByText("Plano de contingência")).toBeInTheDocument();
  });
});
