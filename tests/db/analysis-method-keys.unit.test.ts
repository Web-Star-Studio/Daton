import { describe, expect, it } from "vitest";
import {
  ACTION_PLAN_ANALYSIS_METHOD_KEYS,
  ISHIKAWA_CATEGORIES,
  KT_DIMENSIONS,
  BARRIER_TYPES,
  BARRIER_STATUSES,
} from "@workspace/db";

describe("vocabulários fechados das tratativas", () => {
  it("expõe as 8 chaves na ordem canônica", () => {
    expect(ACTION_PLAN_ANALYSIS_METHOD_KEYS).toEqual([
      "five_whys",
      "ishikawa",
      "a3",
      "fmea",
      "fault_tree",
      "kepner_tregoe",
      "rca_apollo",
      "barrier_analysis",
    ]);
  });

  it("Ishikawa tem exatamente as 6M", () => {
    expect(ISHIKAWA_CATEGORIES).toEqual([
      "metodo",
      "maquina",
      "mao_de_obra",
      "material",
      "medicao",
      "meio_ambiente",
    ]);
  });

  it("Kepner-Tregoe tem exatamente as 4 dimensões", () => {
    expect(KT_DIMENSIONS).toEqual(["o_que", "onde", "quando", "extensao"]);
  });

  it("Barreiras têm tipo e status fechados", () => {
    expect(BARRIER_TYPES).toEqual([
      "fisica",
      "administrativa",
      "humana",
      "procedimental",
    ]);
    expect(BARRIER_STATUSES).toEqual([
      "ausente",
      "falhou",
      "ineficaz",
      "funcionou",
    ]);
  });
});
