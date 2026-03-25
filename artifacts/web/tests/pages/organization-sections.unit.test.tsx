import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OrganizacaoDepartmentsPage from "@/pages/app/organizacao/departamentos";
import OrganizacaoPositionsPage from "@/pages/app/organizacao/cargos";

const organizacaoPageMock = vi.fn(
  ({ section }: { section?: string }) => <div>Página organizacional: {section}</div>,
);

vi.mock("@/pages/app/organizacao", () => ({
  __esModule: true,
  default: (props: { section?: string }) => organizacaoPageMock(props),
}));

describe("organization section routes", () => {
  it("renders the departments route with the correct section", () => {
    render(<OrganizacaoDepartmentsPage />);

    expect(organizacaoPageMock).toHaveBeenCalledWith(
      expect.objectContaining({ section: "departamentos" }),
    );
    expect(
      screen.getByText("Página organizacional: departamentos"),
    ).toBeInTheDocument();
  });

  it("renders the positions route with the correct section", () => {
    render(<OrganizacaoPositionsPage />);

    expect(organizacaoPageMock).toHaveBeenCalledWith(
      expect.objectContaining({ section: "cargos" }),
    );
    expect(screen.getByText("Página organizacional: cargos")).toBeInTheDocument();
  });
});
