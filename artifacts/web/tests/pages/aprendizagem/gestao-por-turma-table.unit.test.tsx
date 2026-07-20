import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PorTurmaTable } from "@/pages/app/aprendizagem/gestao/_components/PorTurmaTable";

// participantCount é distinto de confirmedCount/approvedCount de propósito:
// valores iguais colidiriam em getByText (texto duplicado na tabela).
const classes = [
  {
    id: 1,
    code: "T04",
    catalogItemId: 5,
    startDate: "2026-04-02",
    unitId: 2,
    status: "realizada",
    participantCount: 26,
    confirmedCount: 24,
    approvedCount: 23,
  },
] as never;

describe("PorTurmaTable", () => {
  it("mostra Inscritos, Confirmados e Realizados", () => {
    render(
      <PorTurmaTable
        classes={classes}
        catalogTitleById={new Map([[5, "Direção defensiva"]])}
        unitNameById={new Map([[2, "Curitiba"]])}
        loading={false}
        error={false}
      />,
    );
    expect(screen.getByText("Direção defensiva")).toBeInTheDocument();
    expect(screen.getByText("26")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("Realizada")).toBeInTheDocument();
  });
});
