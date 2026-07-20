import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RegistrarConclusaoForm } from "@/pages/app/aprendizagem/colaboradores/_components/RegistrarConclusaoForm";

const base = {
  status: "pendente",
  completionDate: "",
  expirationDate: "",
  instructor: "",
  notApplicableReason: "",
};

describe("RegistrarConclusaoForm — Não aplicável", () => {
  it("oferece a opção Não aplicável", () => {
    render(
      <RegistrarConclusaoForm
        form={base as never}
        onChange={() => {}}
        instructorOptions={[]}
      />,
    );
    expect(
      screen.getByRole("option", { name: "Não aplicável" }),
    ).toBeInTheDocument();
  });

  it("com NA selecionado, mostra o campo de motivo e sinaliza obrigatoriedade quando vazio", () => {
    render(
      <RegistrarConclusaoForm
        form={{ ...base, status: "nao_aplicavel" } as never}
        onChange={() => {}}
        instructorOptions={[]}
      />,
    );
    expect(
      screen.getByLabelText(/Motivo da não aplicabilidade/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/obrigatório/i)).toBeInTheDocument();
  });

  it("sem NA, o campo de motivo não aparece", () => {
    render(
      <RegistrarConclusaoForm
        form={base as never}
        onChange={() => {}}
        instructorOptions={[]}
      />,
    );
    expect(
      screen.queryByLabelText(/Motivo da não aplicabilidade/i),
    ).not.toBeInTheDocument();
  });

  it("selecionar NA emite a mudança de status", () => {
    const onChange = vi.fn();
    render(
      <RegistrarConclusaoForm
        form={base as never}
        onChange={onChange}
        instructorOptions={[]}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Status/i), {
      target: { value: "nao_aplicavel" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: "nao_aplicavel" }),
    );
  });
});
