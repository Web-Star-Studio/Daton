import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/action-plans-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/action-plans-client")>();
  return {
    ...actual,
    useActionPlansSummary: () => ({ data: { effectivenessRatePct: 50, effectivenessEvolution: [] } }),
    useActionPlans: () => ({
      data: [
        { id: 1, status: "completed", effectivenessResult: "effective" },
        { id: 2, status: "completed", effectivenessResult: null },
      ],
    }),
  };
});

import { EficaciaScreen } from "@/pages/app/planos-acao/_components/eficacia-screen";

describe("EficaciaScreen — tiles como atalho", () => {
  it("clicar em 'Aguardando' dispara drill-down com effectiveness=pending", async () => {
    const onDrillDown = vi.fn();
    render(<EficaciaScreen orgId={2} onDrillDown={onDrillDown} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Aguardando/ }));

    expect(onDrillDown).toHaveBeenCalledWith({ effectiveness: "pending" });
  });

  it("clicar em 'Eficazes' dispara drill-down com effectiveness=effective", async () => {
    const onDrillDown = vi.fn();
    render(<EficaciaScreen orgId={2} onDrillDown={onDrillDown} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Eficazes/ }));

    expect(onDrillDown).toHaveBeenCalledWith({ effectiveness: "effective" });
  });
});
