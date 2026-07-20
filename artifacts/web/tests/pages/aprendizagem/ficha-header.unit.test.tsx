import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FichaHeader } from "@/pages/app/aprendizagem/colaboradores/_components/FichaHeader";

describe("FichaHeader", () => {
  it("mostra nome, cargo e os 4 contadores", () => {
    render(
      <FichaHeader
        name="Fulano de Tal"
        position="Analista"
        contractLabel="CLT"
        department="Qualidade"
        unitName="Matriz"
        trainings={[
          { status: "concluido" },
          { status: "pendente" },
          { status: "vencido" },
        ]}
      />,
    );
    expect(screen.getByText("Fulano de Tal")).toBeInTheDocument();
    // 4 contadores: Total 3 / Feitos 1 / Pendentes 1 / Vencidos 1
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Feitos")).toBeInTheDocument();
    expect(screen.getByText("Pendentes")).toBeInTheDocument();
    expect(screen.getByText("Vencidos")).toBeInTheDocument();
    expect(screen.getByText("FT")).toBeInTheDocument(); // iniciais no avatar
  });
});
