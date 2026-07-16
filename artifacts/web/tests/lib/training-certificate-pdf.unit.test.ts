import { describe, expect, it } from "vitest";
import {
  buildCertificateContent,
  formatCpf,
  formatDateBr,
  formatWorkloadHours,
  type CertificateInput,
} from "@/lib/training-certificate-pdf";

const ISSUE = "2026-07-16";

function input(overrides: Partial<CertificateInput> = {}): CertificateInput {
  return {
    orgName: "Transportes Gabardo",
    employeeName: "João da Silva",
    employeeCpf: "12345678901",
    employeePosition: "Motorista",
    title: "Segurança do Trabalho — NR-35",
    completionDate: "2026-01-10",
    workloadHours: 8,
    institution: "SENAI",
    expirationDate: "2028-01-10",
    competencyName: "Trabalho em altura",
    evaluatorName: "Ana Souza",
    ...overrides,
  };
}

describe("formatCpf", () => {
  it("formata 11 dígitos com máscara", () => {
    expect(formatCpf("12345678901")).toBe("123.456.789-01");
  });
  it("ignora não-dígitos já presentes e formata", () => {
    expect(formatCpf("123.456.789-01")).toBe("123.456.789-01");
  });
  it("devolve null quando não tem 11 dígitos, vazio ou nulo", () => {
    expect(formatCpf("123")).toBeNull();
    expect(formatCpf("")).toBeNull();
    expect(formatCpf(null)).toBeNull();
    expect(formatCpf(undefined)).toBeNull();
  });
});

describe("formatDateBr", () => {
  it("YYYY-MM-DD → DD/MM/YYYY sem deslocamento de fuso", () => {
    expect(formatDateBr("2026-01-10")).toBe("10/01/2026");
    // meia-noite não pode virar o dia anterior (bug clássico de new Date)
    expect(formatDateBr("2026-01-01")).toBe("01/01/2026");
  });
  it("aceita ISO completo (corta o T)", () => {
    expect(formatDateBr("2026-01-10T00:00:00.000Z")).toBe("10/01/2026");
  });
  it("null/vazio → null", () => {
    expect(formatDateBr(null)).toBeNull();
    expect(formatDateBr("")).toBeNull();
  });
});

describe("formatWorkloadHours", () => {
  it("singular só para exatamente 1", () => {
    expect(formatWorkloadHours(1)).toBe("1 hora");
    expect(formatWorkloadHours(2)).toBe("2 horas");
  });
  it("decimal com vírgula pt-BR", () => {
    expect(formatWorkloadHours(1.5)).toBe("1,5 horas");
    expect(formatWorkloadHours(0.5)).toBe("0,5 horas");
  });
  it("ausente/zero/negativo → null", () => {
    expect(formatWorkloadHours(0)).toBeNull();
    expect(formatWorkloadHours(-5)).toBeNull();
    expect(formatWorkloadHours(null)).toBeNull();
    expect(formatWorkloadHours(undefined)).toBeNull();
  });
});

describe("buildCertificateContent", () => {
  it("monta as linhas certas com todos os campos", () => {
    const c = buildCertificateContent(input(), ISSUE);
    expect(c.title).toBe("CERTIFICADO DE CONCLUSÃO");
    expect(c.employeeName).toBe("João da Silva");
    expect(c.subjectLine).toBe("Motorista · CPF 123.456.789-01");
    expect(c.trainingTitle).toBe("Segurança do Trabalho — NR-35");
    expect(c.completionLine).toBe("em 10/01/2026 · carga horária de 8 horas");
    expect(c.extraLines).toEqual([
      "Instituição: SENAI · Validade: 10/01/2028",
      "Competência: Trabalho em altura",
    ]);
    expect(c.signerName).toBe("Ana Souza");
    expect(c.issueLine).toBe("Emitido em 16/07/2026");
    expect(c.footer).toContain("ISO 9001:2015 §7.2");
  });

  it("omite instituição/validade/competência quando vazios", () => {
    const c = buildCertificateContent(
      input({ institution: "", expirationDate: null, competencyName: "  " }),
      ISSUE,
    );
    expect(c.extraLines).toEqual([]);
  });

  it("só instituição (sem validade) numa linha; competência em outra", () => {
    const c = buildCertificateContent(
      input({ expirationDate: null }),
      ISSUE,
    );
    expect(c.extraLines).toEqual([
      "Instituição: SENAI",
      "Competência: Trabalho em altura",
    ]);
  });

  it("omite CPF inválido mas mantém o cargo", () => {
    const c = buildCertificateContent(input({ employeeCpf: "999" }), ISSUE);
    expect(c.subjectLine).toBe("Motorista");
  });

  it("omite a subjectLine inteira quando cargo e CPF vazios", () => {
    const c = buildCertificateContent(
      input({ employeeCpf: null, employeePosition: "  " }),
      ISSUE,
    );
    expect(c.subjectLine).toBeNull();
  });

  it("completionLine omite a carga horária quando ausente", () => {
    const c = buildCertificateContent(input({ workloadHours: 0 }), ISSUE);
    expect(c.completionLine).toBe("em 10/01/2026");
  });

  it("assinatura em branco (null) quando não há avaliador", () => {
    const c = buildCertificateContent(input({ evaluatorName: null }), ISSUE);
    expect(c.signerName).toBeNull();
    expect(c.signerRole).toBe("Responsável");
  });

  it("nome com espaços nas pontas é trimado para exibição", () => {
    const c = buildCertificateContent(input({ employeeName: "  João  " }), ISSUE);
    expect(c.employeeName).toBe("João");
  });

  it("nome do arquivo sanitizado", () => {
    const c = buildCertificateContent(
      input({ title: "NR-35: Trabalho/Altura", employeeName: "Ana <Maria>" }),
      ISSUE,
    );
    expect(c.filename).toBe("Certificado - NR-35- Trabalho-Altura - Ana -Maria-.pdf");
  });
});
