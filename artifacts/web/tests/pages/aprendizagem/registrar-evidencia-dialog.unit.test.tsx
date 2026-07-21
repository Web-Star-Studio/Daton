import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createMutateAsync = vi.fn(async () => ({}) as never);
const deleteMutateAsync = vi.fn(async () => ({}) as never);
const createMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useCreateCompetencyRequirementEvidence: (...args: unknown[]) =>
    createMock(...args),
  useDeleteCompetency: (...args: unknown[]) => deleteMock(...args),
}));

import { RegistrarEvidenciaDialog } from "@/pages/app/aprendizagem/colaboradores/_components/RegistrarEvidenciaDialog";

const requirement = {
  competencyName: "Auditor X",
  competencyType: "conhecimento",
  requiredLevel: 3,
  acquiredLevel: 0,
  status: "gap",
  source: "manual",
  evidence: null,
  gapLevel: 3,
  critical: false,
  manualCompetencyId: null,
} as never;

beforeEach(() => {
  createMutateAsync.mockClear();
  deleteMutateAsync.mockClear();
  createMock.mockReset().mockReturnValue({
    mutateAsync: createMutateAsync,
    isPending: false,
  });
  deleteMock.mockReset().mockReturnValue({
    mutateAsync: deleteMutateAsync,
    isPending: false,
  });
});

describe("RegistrarEvidenciaDialog — modo anexar", () => {
  it("mostra nome e tipo travados (sem input editável) e nível inicia no requerido", () => {
    render(
      <RegistrarEvidenciaDialog
        open
        onOpenChange={() => {}}
        requirement={requirement}
        orgId={1}
        empId={2}
        onSuccess={() => {}}
      />,
    );

    expect(screen.getByText("Auditor X")).toBeInTheDocument();
    expect(screen.getByText("Conhecimento")).toBeInTheDocument();

    // Nome/tipo não são editáveis: não há select (tipo) nem input com o
    // valor do nome — só existem os campos de nível e evidência.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Auditor X")).not.toBeInTheDocument();

    const levelInput = screen.getByRole("spinbutton");
    expect(levelInput).toHaveValue(3);

    // Modo anexar: sem competência existente, não há "Remover evidência".
    expect(
      screen.queryByRole("button", { name: /remover evidência/i }),
    ).not.toBeInTheDocument();
  });

  it("ao submeter, chama a mutation com os dados do requisito + nível/evidência preenchidos", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    render(
      <RegistrarEvidenciaDialog
        open
        onOpenChange={() => {}}
        requirement={requirement}
        orgId={1}
        empId={2}
        onSuccess={onSuccess}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(/certificado/i),
      "Certificado ABC",
    );
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(createMutateAsync).toHaveBeenCalledWith({
      orgId: 1,
      empId: 2,
      data: {
        competencyName: "Auditor X",
        competencyType: "conhecimento",
        requiredLevel: 3,
        acquiredLevel: 3,
        evidence: "Certificado ABC",
        attachments: [],
      },
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("desabilita o botão Salvar enquanto a mutation está pendente", () => {
    createMock.mockReturnValue({
      mutateAsync: createMutateAsync,
      isPending: true,
    });

    render(
      <RegistrarEvidenciaDialog
        open
        onOpenChange={() => {}}
        requirement={requirement}
        orgId={1}
        empId={2}
        onSuccess={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /salvar/i })).toBeDisabled();
  });
});

describe("RegistrarEvidenciaDialog — modo edição", () => {
  const existingCompetency = {
    id: 99,
    employeeId: 2,
    name: "Auditor X",
    type: "conhecimento",
    requiredLevel: 3,
    acquiredLevel: 2,
    evidence: "Cert",
    attachments: [],
  } as never;

  it("pré-preenche nível adquirido e evidência com os dados existentes", () => {
    render(
      <RegistrarEvidenciaDialog
        open
        onOpenChange={() => {}}
        requirement={requirement}
        orgId={1}
        empId={2}
        existingCompetency={existingCompetency}
        onSuccess={() => {}}
      />,
    );

    expect(screen.getByRole("spinbutton")).toHaveValue(2);
    expect(screen.getByDisplayValue("Cert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remover evidência/i }),
    ).toBeInTheDocument();
  });

  it("remover evidência chama useDeleteCompetency com o id da competência existente", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <RegistrarEvidenciaDialog
        open
        onOpenChange={() => {}}
        requirement={requirement}
        orgId={1}
        empId={2}
        existingCompetency={existingCompetency}
        onSuccess={onSuccess}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /remover evidência/i }),
    );

    expect(deleteMutateAsync).toHaveBeenCalledWith({
      orgId: 1,
      empId: 2,
      compId: 99,
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
