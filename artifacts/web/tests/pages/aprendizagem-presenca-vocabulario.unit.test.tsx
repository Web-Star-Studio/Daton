import { describe, expect, it } from "vitest";
import {
  toAttendance,
  ATTENDANCE_LABEL,
  ATTENDANCE_PENDING_LABEL,
} from "@/pages/app/aprendizagem/turmas/attendance";

/**
 * A aba Presença e o assistente de encerramento precisam nomear o mesmo estado
 * do mesmo jeito. O estado indefinido é o que fazia a turma fechar sem gerar
 * registro de treinamento — se ele não tiver nome, some da tela.
 */
describe("vocabulário de presença (aba × assistente)", () => {
  it("reconhece os dois estados definidos", () => {
    expect(toAttendance("presente")).toBe("presente");
    expect(toAttendance("faltou")).toBe("faltou");
  });

  it("tudo que não for presente/faltou é indefinido", () => {
    // O banco tem NULL; a API pode devolver undefined; string vazia já
    // apareceu em produção noutros campos do LMS. Nenhum deles é "faltou".
    expect(toAttendance(null)).toBeUndefined();
    expect(toAttendance(undefined)).toBeUndefined();
    expect(toAttendance("")).toBeUndefined();
    expect(toAttendance("PRESENTE")).toBeUndefined();
    expect(toAttendance("presenca")).toBeUndefined();
  });

  it("o estado indefinido tem nome próprio, e não é vazio nem travessão", () => {
    expect(ATTENDANCE_PENDING_LABEL).toBe("Pendente");
    expect(ATTENDANCE_PENDING_LABEL).not.toBe("—");
    expect(ATTENDANCE_PENDING_LABEL.trim()).not.toBe("");
  });

  it("os rótulos cobrem os dois estados definidos", () => {
    expect(ATTENDANCE_LABEL.presente).toBe("Presente");
    expect(ATTENDANCE_LABEL.faltou).toBe("Faltou");
  });
});
