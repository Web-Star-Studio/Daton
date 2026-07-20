import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DadosCards } from "@/pages/app/aprendizagem/colaboradores/_components/DadosCards";

const emp = {
  cpf: "***.123.***-**",
  gender: "Masculino",
  birthDate: "1990-07-14",
  email: "f@ex.com",
  phone: "(41) 90000-0000",
  department: "Qualidade",
  position: "Analista",
  unitName: "Matriz",
  admissionDate: "2019-03-12",
  contractType: "clt",
} as never;

describe("DadosCards", () => {
  it("mostra os dois cards e os campos que existem", () => {
    render(<DadosCards employee={emp} />);
    expect(screen.getByText("Dados pessoais")).toBeInTheDocument();
    expect(screen.getByText("Dados profissionais")).toBeInTheDocument();
    expect(screen.getByText("Masculino")).toBeInTheDocument();
    expect(screen.getByText("Qualidade")).toBeInTheDocument();
    // NÃO renderiza rótulos de campos inexistentes
    expect(screen.queryByText(/matr[íi]cula/i)).toBeNull();
    expect(screen.queryByText(/sal[áa]rio/i)).toBeNull();
    expect(screen.queryByText(/etnia/i)).toBeNull();
  });
});
