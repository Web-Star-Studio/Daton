import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatusPills } from "@/pages/app/aprendizagem/gestao/_components/StatusPills";

describe("StatusPills", () => {
  it("mostra 6 pills e dispara onToggle com o bucket", () => {
    const onToggle = vi.fn();
    render(<StatusPills active="" onToggle={onToggle} />);
    for (const label of ["Todos", "Vencidos", "A vencer 30d", "Pendentes", "Programados", "Realizados"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByText("Programados"));
    expect(onToggle).toHaveBeenCalledWith("programado");
    fireEvent.click(screen.getByText("Todos"));
    expect(onToggle).toHaveBeenCalledWith("");
  });
});
