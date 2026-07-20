import { describe, it, expect } from "vitest";
import { transformTrainingStatus } from "../scripts/src/migrate/transform";

/**
 * Os únicos status de treinamento que o v2 reconhece — o enum do OpenAPI
 * (`lib/api-spec/openapi.yaml`) e os mapas de rótulo do front.
 *
 * Esta lista é o ponto do teste: a migração já emitiu `em_andamento`,
 * `cancelado` e `expirado`, e o `em_andamento` chegou a produção — nenhuma
 * tela sabia rotulá-lo e ele não era contado nem como pendência nem como
 * concluído, ficando invisível para o RH. Se alguém acrescentar um status novo
 * aqui, tem de acrescentar no contrato também.
 */
const STATUS_DECLARADOS = ["pendente", "concluido", "vencido", "nao_aplicavel"];

describe("transformTrainingStatus", () => {
  it("só emite status declarados no contrato, para qualquer entrada", () => {
    const entradas = [
      null,
      "",
      "Em andamento",
      "em andamento",
      "in_progress",
      "Concluído",
      "concluido",
      "completed",
      "Cancelado",
      "cancelled",
      "Expirado",
      "expired",
      "qualquer coisa inesperada",
      "PENDENTE",
    ];
    for (const entrada of entradas) {
      expect(STATUS_DECLARADOS).toContain(transformTrainingStatus(entrada));
    }
  });

  it("mapeia expirado para 'vencido' (o v2 não tem 'expirado')", () => {
    expect(transformTrainingStatus("expirado")).toBe("vencido");
    expect(transformTrainingStatus("expired")).toBe("vencido");
  });

  it("mapeia 'em andamento' para pendente — não concluído é pendência", () => {
    expect(transformTrainingStatus("em andamento")).toBe("pendente");
    expect(transformTrainingStatus("in_progress")).toBe("pendente");
  });

  it("mapeia cancelado para pendente (o treinamento não aconteceu)", () => {
    expect(transformTrainingStatus("cancelado")).toBe("pendente");
    expect(transformTrainingStatus("cancelled")).toBe("pendente");
  });

  it("preserva concluído", () => {
    expect(transformTrainingStatus("Concluído")).toBe("concluido");
    expect(transformTrainingStatus("completed")).toBe("concluido");
  });

  it("entrada vazia ou desconhecida vira pendente", () => {
    expect(transformTrainingStatus(null)).toBe("pendente");
    expect(transformTrainingStatus("")).toBe("pendente");
    expect(transformTrainingStatus("blergh")).toBe("pendente");
  });
});
