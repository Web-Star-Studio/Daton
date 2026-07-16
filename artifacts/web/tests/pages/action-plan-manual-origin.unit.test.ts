import { describe, expect, it } from "vitest";
import { SOURCE_MODULE_LABELS } from "@/lib/action-plans-client";
import {
  DEFAULT_MANUAL_ORIGIN,
  MANUAL_ORIGIN_OPTIONS,
  actionTypeForManualOrigin,
} from "@/pages/app/planos-acao/_components/manual-origin";

describe("origens escolhíveis ao criar a ação dentro do módulo", () => {
  it("oferece exatamente as três origens, na ordem do listbox", () => {
    expect(MANUAL_ORIGIN_OPTIONS).toEqual(["improvement", "corrective", "norm_requirement"]);
  });

  it("usa Melhoria de Processo como padrão", () => {
    expect(DEFAULT_MANUAL_ORIGIN).toBe("improvement");
  });

  it("não oferece a origem legada 'manual'", () => {
    expect(MANUAL_ORIGIN_OPTIONS).not.toContain("manual");
  });

  it("tem rótulo em português para cada origem (usado no badge, no filtro e no painel)", () => {
    expect(SOURCE_MODULE_LABELS.improvement).toBe("Melhoria de Processo");
    expect(SOURCE_MODULE_LABELS.corrective).toBe("Corretiva");
    expect(SOURCE_MODULE_LABELS.norm_requirement).toBe("Não atendimento a requisito da norma");
    // A origem legada continua rotulada — 5 planos antigos ainda a usam.
    expect(SOURCE_MODULE_LABELS.manual).toBe("Manual");
  });
});

describe("actionTypeForManualOrigin", () => {
  it("sugere Melhoria para a origem Melhoria de Processo", () => {
    expect(actionTypeForManualOrigin("improvement")).toBe("improvement");
  });

  it("sugere Corretiva para a origem Corretiva", () => {
    expect(actionTypeForManualOrigin("corrective")).toBe("corrective");
  });

  it("sugere Corretiva para lacuna de requisito da norma", () => {
    expect(actionTypeForManualOrigin("norm_requirement")).toBe("corrective");
  });
});
