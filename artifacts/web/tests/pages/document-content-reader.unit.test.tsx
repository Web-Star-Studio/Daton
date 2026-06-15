import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocumentContentReader } from "@/components/documents/document-content-reader";

describe("DocumentContentReader", () => {
  it("renderiza títulos e markdown das seções em ordem", () => {
    render(
      <DocumentContentReader
        sections={[
          { id: "b", title: "Segundo", body: "**negrito**", order: 1 },
          { id: "a", title: "Primeiro", body: "texto", order: 0 },
        ]}
      />,
    );
    const headings = screen.getAllByRole("heading");
    expect(headings.map((h) => h.textContent)).toEqual(["Primeiro", "Segundo"]);
    expect(screen.getByText("negrito").tagName).toBe("STRONG");
  });

  it("mostra estado vazio quando não há seções", () => {
    render(<DocumentContentReader sections={[]} />);
    expect(screen.getByText(/nenhum conteúdo/i)).toBeInTheDocument();
  });
});
