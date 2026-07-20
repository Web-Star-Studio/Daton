import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetricCards } from "@/pages/app/aprendizagem/gestao/_components/MetricCards";

describe("MetricCards", () => {
  const counts = { vencido: 12, aVencer: 23, pendente: 47, programado: 18, realizadoMes: 84 };

  it("mostra os 5 cards com valores e rótulos", () => {
    render(<MetricCards counts={counts} active="" onToggle={() => {}} />);
    for (const label of ["Vencidos", "A vencer em 30 dias", "Pendentes", "Programados", "Realizados no mês"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("18")).toBeInTheDocument(); // Programados
    expect(screen.getByText("84")).toBeInTheDocument(); // Realizados no mês
  });

  it("clicar em Programados dispara onToggle('programado')", () => {
    const onToggle = vi.fn();
    render(<MetricCards counts={counts} active="" onToggle={onToggle} />);
    fireEvent.click(screen.getByText("Programados"));
    expect(onToggle).toHaveBeenCalledWith("programado");
  });
});
