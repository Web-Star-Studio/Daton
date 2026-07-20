import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PorPrazoPanel } from "@/pages/app/aprendizagem/gestao/_components/PorPrazoPanel";

describe("PorPrazoPanel", () => {
  const vencidos = {
    total: 12,
    items: [{ id: 1, primary: "Carlos — Dir. defensiva", meta: "Venceu 15/04/26 · Porto Alegre" }],
  };
  const aVencer = {
    total: 23,
    items: [{ id: 2, primary: "Ana — Integração", meta: "Vence 01/07/26 · 8 dias" }],
  };
  const pendentes = {
    total: 47,
    items: [{ id: 3, primary: "Roberto — NR-35", meta: "Aguardando turma" }],
  };

  it("mostra as 3 colunas com contagens e itens", () => {
    render(
      <PorPrazoPanel
        vencidos={vencidos}
        aVencer={aVencer}
        pendentesSemTurma={pendentes}
        onSeeAll={() => {}}
        onCreateClass={() => {}}
      />,
    );
    expect(screen.getByText("Vencidos")).toBeInTheDocument();
    expect(screen.getByText("A vencer em 30 dias")).toBeInTheDocument();
    expect(screen.getByText("Pendentes sem turma")).toBeInTheDocument();
    expect(screen.getByText("Carlos — Dir. defensiva")).toBeInTheDocument();
    expect(screen.getByText("Ana — Integração")).toBeInTheDocument();
    expect(screen.getByText("Roberto — NR-35")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("47")).toBeInTheDocument();
  });

  it("CTA 'Ver todos' de vencidos chama onSeeAll('vencido')", () => {
    const onSeeAll = vi.fn();
    render(
      <PorPrazoPanel
        vencidos={vencidos}
        aVencer={aVencer}
        pendentesSemTurma={pendentes}
        onSeeAll={onSeeAll}
        onCreateClass={() => {}}
      />,
    );
    fireEvent.click(screen.getAllByText(/Ver todos/i)[0]);
    expect(onSeeAll).toHaveBeenCalledWith("vencido");
  });

  it("CTA 'Ver todos' de a vencer chama onSeeAll('a_vencer')", () => {
    const onSeeAll = vi.fn();
    render(
      <PorPrazoPanel
        vencidos={vencidos}
        aVencer={aVencer}
        pendentesSemTurma={pendentes}
        onSeeAll={onSeeAll}
        onCreateClass={() => {}}
      />,
    );
    fireEvent.click(screen.getAllByText(/Ver todos/i)[1]);
    expect(onSeeAll).toHaveBeenCalledWith("a_vencer");
  });

  it("CTA 'Criar turma' chama onCreateClass", () => {
    const onCreateClass = vi.fn();
    render(
      <PorPrazoPanel
        vencidos={vencidos}
        aVencer={aVencer}
        pendentesSemTurma={pendentes}
        onSeeAll={() => {}}
        onCreateClass={onCreateClass}
      />,
    );
    fireEvent.click(screen.getByText(/Criar turma/i));
    expect(onCreateClass).toHaveBeenCalled();
  });

  it("mostra estado vazio quando a coluna não tem itens", () => {
    render(
      <PorPrazoPanel
        vencidos={{ total: 0, items: [] }}
        aVencer={aVencer}
        pendentesSemTurma={pendentes}
        onSeeAll={() => {}}
        onCreateClass={() => {}}
      />,
    );
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });
});
