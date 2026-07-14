import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  TrainingWorkloadCell,
  TrainingWorkloadInput,
} from "@/pages/app/aprendizagem/_components/carga-horaria";

/**
 * Replica o padrão de `colaboradores/[id].tsx` (e dos outros dois formulários
 * com o bug): o estado do formulário guarda `workloadHours` como número e
 * converte a cada tecla via `onChange={(v) => setForm({ ...form, workloadHours: Number(v) })}`.
 */
function NumberStateTrainingForm() {
  const [form, setForm] = useState<{ workloadHours: number }>({
    workloadHours: 0,
  });
  return (
    <TrainingWorkloadInput
      value={form.workloadHours}
      onChange={(v) => setForm({ ...form, workloadHours: Number(v) })}
    />
  );
}

describe("carga horária decimal (catálogo/turmas/colaboradores de treinamento)", () => {
  it("exibe 0,33h (pt-BR) e não 0.33h", () => {
    render(<TrainingWorkloadCell hours={0.33} />);
    expect(screen.getByText("0,33h")).toBeInTheDocument();
  });

  it("hora cheia continua sem casa decimal", () => {
    render(<TrainingWorkloadCell hours={8} />);
    expect(screen.getByText("8h")).toBeInTheDocument();
  });

  it("não renderiza nada quando não há carga horária", () => {
    const { container } = render(<TrainingWorkloadCell hours={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("o input aceita decimal (step permite centésimos)", () => {
    render(<TrainingWorkloadInput value={0.33} onChange={() => {}} />);
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveAttribute("step", "0.01");
    expect(input).toHaveAttribute("min", "0");
  });

  it("digitando tecla a tecla, o usuário consegue limpar o campo (que começa em 0) e chegar em 0,33 — sem que o componente reescreva o texto digitado com o valor antigo do formulário (bug real: colaboradores/[id].tsx, colaboradores/treinamentos.tsx, colaboradores/treinamento-detalhe.tsx)", async () => {
    render(<NumberStateTrainingForm />);
    const user = userEvent.setup();
    const input = screen.getByRole("spinbutton");

    // Fluxo real: o campo começa em 0 (padrão do formulário) e o usuário
    // apaga esse 0 tecla a tecla para digitar o valor certo.
    //
    // Nota sobre o repro: em jsdom, digitar "." diretamente após um "0" já
    // existente nunca chega a disparar o evento de input do React — o
    // input[type=number] do jsdom sanitiza "0." antes mesmo de emitir o
    // evento (é um workaround conhecido do @testing-library/user-event para
    // uma limitação do próprio jsdom, não o bug em si). O apagar-e-redigitar
    // abaixo passa pelo MESMO ponto do código-fonte do React
    // (`updateInput`, o caso especial `0 === value && "" === element.value`)
    // que causa o bug relatado com o ponto decimal: quando o texto do campo
    // fica vazio ("") e o valor do form já é 0, o React força
    // `element.value = "0"`, sobrescrevendo o que o usuário acabou de
    // digitar/apagar.
    await user.click(input);
    await user.keyboard("{Backspace}");

    // Sem o fix: o campo "renasce" sozinho como "0" assim que o usuário o
    // limpa — a tecla Backspace é, na prática, ignorada.
    expect(input).toHaveValue(null);

    await user.type(input, "0.33");
    expect(input).toHaveValue(0.33);
  });

  it("ao abrir um treinamento diferente para editar (fora de edição), o campo passa a exibir a carga horária salva — não fica preso ao texto antigo", () => {
    const { rerender } = render(
      <TrainingWorkloadInput value={2} onChange={() => {}} />,
    );
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue(2);

    // Simula abrir outro treinamento para editar: o formulário troca o
    // valor "de fora", sem o campo estar em edição.
    rerender(<TrainingWorkloadInput value={0.33} onChange={() => {}} />);
    expect(input).toHaveValue(0.33);
  });
});
