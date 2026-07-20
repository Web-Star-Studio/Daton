import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const listEmployeesMock = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useListEmployees: (...args: unknown[]) => listEmployeesMock(...args),
  getListEmployeesQueryKey: () => ["employees"],
}));

// Importado depois do mock — o picker resolve o hook gerado no topo do módulo.
const { EmployeePicker } = await import(
  "@/pages/app/aprendizagem/turmas/employee-picker"
);

function mockEmployees(
  names: { id: number; name: string }[],
  total = names.length,
) {
  listEmployeesMock.mockReturnValue({
    data: {
      data: names,
      pagination: { page: 1, pageSize: 50, total, totalPages: 1 },
    },
    isLoading: false,
  });
}

function Harness({ enrolledIds }: { enrolledIds?: Set<number> }) {
  const [selected, setSelected] = useState<number[]>([]);
  return (
    <>
      <EmployeePicker
        orgId={1}
        selected={selected}
        onChange={setSelected}
        enrolledIds={enrolledIds}
      />
      <output data-testid="selected">{selected.join(",")}</output>
    </>
  );
}

describe("EmployeePicker (inscrição em turma)", () => {
  it("marca quem já está inscrito e impede reinscrever", async () => {
    mockEmployees([
      { id: 1, name: "Juliana Ferreira" },
      { id: 2, name: "Marcos Almeida" },
    ]);
    render(<Harness enrolledIds={new Set([1])} />);

    const boxes = screen.getAllByRole("checkbox");
    // Juliana já está na turma: aparece travada e marcada, não some da lista.
    expect(boxes[0]).toBeChecked();
    expect(boxes[0]).toBeDisabled();
    expect(screen.getByText("Já inscrito")).toBeInTheDocument();
    // Marcos continua selecionável.
    expect(boxes[1]).not.toBeChecked();
    expect(boxes[1]).not.toBeDisabled();
  });

  it("seleciona e desmarca colaboradores", async () => {
    mockEmployees([
      { id: 1, name: "Juliana Ferreira" },
      { id: 2, name: "Marcos Almeida" },
    ]);
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("checkbox", { name: /Marcos/ }));
    expect(screen.getByTestId("selected")).toHaveTextContent("2");

    await user.click(screen.getByRole("checkbox", { name: /Juliana/ }));
    expect(screen.getByTestId("selected")).toHaveTextContent("2,1");

    await user.click(screen.getByRole("checkbox", { name: /Marcos/ }));
    expect(screen.getByTestId("selected")).toHaveTextContent("1");
  });

  it("avisa quando a busca trunca a lista (org grande)", () => {
    // Em org grande a primeira página não traz todo mundo: sem esse aviso o
    // operador acha que o colaborador não existe porque não veio na lista.
    mockEmployees([{ id: 1, name: "Juliana Ferreira" }], 1860);
    render(<Harness />);
    expect(screen.getByText(/mostrando 1 de 1860/i)).toBeInTheDocument();
  });

  it("não avisa truncamento quando a lista está completa", () => {
    mockEmployees([{ id: 1, name: "Juliana Ferreira" }]);
    render(<Harness />);
    expect(screen.queryByText(/refine a busca/i)).not.toBeInTheDocument();
  });
});
