import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  TrainingWorkloadCell,
  TrainingWorkloadInput,
} from "@/pages/app/aprendizagem/_components/carga-horaria";

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
});
