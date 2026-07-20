import { describe, expect, it } from "vitest";
import type { LearningSummary } from "@workspace/api-client-react";
import { buildLearningIndicatorsPdf } from "@/pages/app/aprendizagem/indicadores/_export";
import {
  LMS_ALL_METRICS,
  LMS_PRIMARY_METRICS,
  findTarget,
  formatMetricValue,
  metricProgress,
  metricStatus,
} from "@/pages/app/aprendizagem/indicadores/_metrics";

const TARGETS: LearningSummary["targets"] = [
  { metric: "pat_completion", goal: 80, tolerance: 1, direction: "up" },
  { metric: "effectiveness_overall", goal: 80, tolerance: 1, direction: "up" },
  { metric: "mandatory_coverage", goal: 100, tolerance: 2, direction: "up" },
  { metric: "hours_per_employee", goal: 20, tolerance: 2, direction: "up" },
  { metric: "critical_gaps", goal: 0, tolerance: 0, direction: "down" },
  { metric: "expired_trainings", goal: 0, tolerance: 0, direction: "down" },
];

const SUMMARY: LearningSummary = {
  cards: {
    patCompletion: 74,
    effectiveness: 81,
    criticalGaps: 38,
    expiredTrainings: 12,
    mandatoryCoverage: 87,
    hoursPerEmployee: 18,
  },
  targets: TARGETS,
  byUnit: [
    {
      unitId: 1,
      unitName: "Curitiba",
      completion: 88,
      effectiveness: 87,
      gaps: 4,
      status: "ok",
    },
    {
      unitId: 2,
      unitName: "Porto Alegre",
      completion: 22,
      effectiveness: 51,
      gaps: 6,
      status: "critico",
    },
    {
      unitId: 3,
      unitName: "Sem PAT",
      completion: null,
      effectiveness: null,
      gaps: 0,
      status: "sem-dados",
    },
  ],
  byNorm: [
    { norm: "ISO 9001 — Qualidade", effectiveness: 85 },
    { norm: "ISO 39001 — Seg. Viária", effectiveness: 63 },
    { norm: "Norma sem reviews", effectiveness: null },
  ],
  expired: [
    {
      employeeName: "Fulano de Tal",
      unitName: "Curitiba",
      title: "Direção defensiva",
      expirationDate: "2026-03-15",
    },
  ],
  pendingEffectiveness: [
    { employeeName: "Beltrano", title: "NR-35 Trabalho em altura" },
  ],
};

const EMPTY_SUMMARY: LearningSummary = {
  cards: {
    patCompletion: null,
    effectiveness: null,
    criticalGaps: null,
    expiredTrainings: null,
    mandatoryCoverage: null,
    hoursPerEmployee: null,
  },
  targets: TARGETS,
  byUnit: [],
  byNorm: [],
  expired: [],
  pendingEffectiveness: [],
};

describe("_metrics", () => {
  it("cobre os quatro cards do bloco de cumprimento na ordem do mockup", () => {
    expect(LMS_PRIMARY_METRICS.map((m) => m.key)).toEqual([
      "pat_completion",
      "hours_per_employee",
      "mandatory_coverage",
      "critical_gaps",
    ]);
    // Os seis indicadores entram inteiros no relatório exportado.
    expect(LMS_ALL_METRICS).toHaveLength(6);
  });

  it("formata valor conforme a unidade do indicador", () => {
    expect(formatMetricValue(74, "percent")).toBe("74%");
    expect(formatMetricValue(18, "hours")).toBe("18h");
    expect(formatMetricValue(38, "count")).toBe("38");
    expect(formatMetricValue(null, "percent")).toBe("—");
  });

  it("deriva semáforo pela meta e direção", () => {
    const patTarget = findTarget(TARGETS, "pat_completion"); // 80, up, tol 1
    expect(metricStatus(85, patTarget)).toBe("green");
    expect(metricStatus(79.5, patTarget)).toBe("yellow"); // dentro da tolerância
    expect(metricStatus(60, patTarget)).toBe("red");

    const gapsTarget = findTarget(TARGETS, "critical_gaps"); // 0, down, tol 0
    expect(metricStatus(0, gapsTarget)).toBe("green");
    expect(metricStatus(38, gapsTarget)).toBe("red");
  });

  it("não inventa semáforo nem progresso sem meta", () => {
    expect(metricStatus(50, undefined)).toBeNull();
    expect(metricProgress(50, undefined)).toBeNull();
    expect(metricStatus(null, findTarget(TARGETS, "pat_completion"))).toBeNull();
  });

  it("em indicador de meta zero a barra sinaliza desvio, não proporção", () => {
    const gapsTarget = findTarget(TARGETS, "critical_gaps");
    expect(metricProgress(0, gapsTarget)).toBe(0);
    expect(metricProgress(38, gapsTarget)).toBe(100);
  });

  it("limita o progresso a 100% quando a meta é superada", () => {
    const patTarget = findTarget(TARGETS, "pat_completion");
    expect(metricProgress(120, patTarget)).toBe(100);
    expect(metricProgress(40, patTarget)).toBe(50);
  });
});

describe("buildLearningIndicatorsPdf", () => {
  it("gera um PDF real (não um print da tela)", () => {
    const doc = buildLearningIndicatorsPdf({
      summary: SUMMARY,
      orgName: "Organização Teste",
      year: 2026,
      unitName: null,
    });

    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);

    const out = doc.output();
    expect(out.startsWith("%PDF-")).toBe(true);
    // Um documento com tiles, gráfico e três tabelas é substancialmente maior
    // que um PDF vazio (~1kB) — guarda contra "gerou, mas em branco".
    expect(out.length).toBeGreaterThan(5000);
  });

  it("desenha o recorte de filial no cabeçalho", () => {
    const doc = buildLearningIndicatorsPdf({
      summary: SUMMARY,
      orgName: "Organização Teste",
      year: 2026,
      unitName: "Porto Alegre",
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it("não quebra quando não há dado nenhum", () => {
    expect(() =>
      buildLearningIndicatorsPdf({
        summary: EMPTY_SUMMARY,
        orgName: undefined,
        year: 2026,
      }),
    ).not.toThrow();
  });
});
