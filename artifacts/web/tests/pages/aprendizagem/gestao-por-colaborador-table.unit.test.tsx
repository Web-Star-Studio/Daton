import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PorColaboradorTable } from "@/pages/app/aprendizagem/gestao/_components/PorColaboradorTable";

const rows = [
  {
    id: 1,
    employeeId: 1,
    employeeName: "Ana",
    employeePosition: "Motorista",
    unitName: "Curitiba",
    title: "NR-35",
    status: "pendente",
    expirationDate: "2026-08-01",
    catalogItemId: 10,
    attachments: [],
    reviewerCount: 0,
  },
] as never;

describe("PorColaboradorTable", () => {
  it("mostra Norma e Crítico do catálogo", () => {
    const meta = new Map([
      [10, { normLabels: ["ISO 39001"], isCritical: true }],
    ]);
    render(
      <PorColaboradorTable
        rows={rows}
        catalogMeta={meta}
        loading={false}
        error={false}
        emptyLabel="—"
      />,
    );
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("ISO 39001")).toBeInTheDocument();
    // marcador de crítico (badge "Crítico")
    expect(screen.getByText(/Crítico/i)).toBeInTheDocument();
  });

  it("treino sem item de catálogo mostra '—' na norma e não é crítico", () => {
    const noCat = [{ ...rows[0], catalogItemId: null }] as never;
    render(
      <PorColaboradorTable
        rows={noCat}
        catalogMeta={new Map()}
        loading={false}
        error={false}
        emptyLabel="—"
      />,
    );
    expect(screen.queryByText(/Crítico/i)).not.toBeInTheDocument();
  });
});
