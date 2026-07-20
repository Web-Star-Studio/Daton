import { describe, it, expect } from "vitest";
import {
  buildColaboradorRows,
  buildTurmaRows,
} from "@/pages/app/aprendizagem/gestao/_export";

describe("gestao export row-builders", () => {
  describe("buildColaboradorRows", () => {
    it("labels PT-BR, norma (via catalogMeta) e crítico=Sim (via requirementId)", () => {
      const rows = buildColaboradorRows(
        [
          {
            id: 1,
            employeeName: "Ana",
            employeePosition: "Motorista",
            unitName: "Curitiba",
            title: "NR-35",
            status: "pendente",
            expirationDate: "2026-08-01",
            catalogItemId: 10,
            requirementId: 99,
          } as never,
        ],
        new Map([[10, { normLabels: ["ISO 39001"] }]]),
        new Map([[99, true]]),
      );
      expect(rows[0]).toMatchObject({
        Colaborador: "Ana",
        Cargo: "Motorista",
        Filial: "Curitiba",
        Treinamento: "NR-35",
        Norma: "ISO 39001",
        Situação: "Pendente",
        Crítico: "Sim",
      });
    });

    it("crítico=Não quando requirementId é nulo ou não está marcado como crítico", () => {
      const rows = buildColaboradorRows(
        [
          {
            id: 1,
            employeeName: "Bia",
            employeePosition: "Analista",
            unitName: "Curitiba",
            title: "Integração",
            status: "concluido",
            expirationDate: null,
            catalogItemId: 10,
            requirementId: null,
          } as never,
          {
            id: 2,
            employeeName: "Caio",
            employeePosition: "Analista",
            unitName: "Curitiba",
            title: "Integração",
            status: "concluido",
            expirationDate: null,
            catalogItemId: 10,
            requirementId: 5,
          } as never,
        ],
        new Map([[10, { normLabels: ["ISO 39001"] }]]),
        new Map([[5, false]]),
      );
      expect(rows[0].Crítico).toBe("Não");
      expect(rows[1].Crítico).toBe("Não");
    });

    it("sem catalogItemId no mapa: Norma vazia", () => {
      const rows = buildColaboradorRows(
        [
          {
            id: 1,
            employeeName: "Ana",
            employeePosition: null,
            unitName: null,
            title: "NR-35",
            status: "vencido",
            expirationDate: null,
            catalogItemId: null,
            requirementId: null,
          } as never,
        ],
        new Map(),
        new Map(),
      );
      expect(rows[0]).toMatchObject({
        Cargo: "",
        Filial: "",
        Norma: "",
        Situação: "Vencido",
        Crítico: "Não",
      });
    });
  });

  describe("buildTurmaRows", () => {
    it("inscritos/confirmados/realizados", () => {
      const rows = buildTurmaRows(
        [
          {
            id: 1,
            code: "T04",
            catalogItemId: 5,
            startDate: "2026-04-02",
            unitId: 2,
            status: "realizada",
            participantCount: 24,
            confirmedCount: 24,
            realizadoCount: 23,
          } as never,
        ],
        new Map([[5, "Direção defensiva"]]),
        new Map([[2, "Curitiba"]]),
      );
      expect(rows[0]).toMatchObject({
        Turma: "T04",
        Treinamento: "Direção defensiva",
        Filial: "Curitiba",
        Inscritos: 24,
        Confirmados: 24,
        Realizados: 23,
        Status: "Realizada",
      });
    });
  });
});
