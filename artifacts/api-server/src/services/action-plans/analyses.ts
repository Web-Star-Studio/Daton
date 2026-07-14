import { z } from "zod";
import {
  ACTION_PLAN_ANALYSIS_METHOD_KEYS,
  BARRIER_STATUSES,
  BARRIER_TYPES,
  FAULT_TREE_GATES,
  FMEA_SCALE_MAX,
  FMEA_SCALE_MIN,
  ISHIKAWA_CATEGORIES,
  KT_DIMENSIONS,
  MAX_WHYS,
  RCA_APOLLO_CAUSE_TYPES,
  type ActionPlanAnalysis,
  type ActionPlanAnalysisMethodKey,
  type FaultTreeNode,
  type RcaApolloNode,
} from "@workspace/db";

// ─── Zod: uma união discriminada por `key` ───────────────────────────────────
// Escrita à mão de propósito. O OpenAPI descreve a mesma forma (para tipar o
// front), mas a validação de escrita não pode depender de como o Orval resolve
// `oneOf` + `discriminator` — se a geração degradar, o servidor continua estrito.

const trimmed = z.string();
const scale = z.number().int().min(FMEA_SCALE_MIN).max(FMEA_SCALE_MAX);
const whys = z.array(trimmed).max(MAX_WHYS);

const fiveWhysData = z.object({ whys });

const ishikawaData = z.object({
  causes: z.array(
    z.object({
      id: trimmed,
      category: z.enum(ISHIKAWA_CATEGORIES),
      text: trimmed,
    }),
  ),
  selectedCauseId: trimmed.optional(),
  whys,
});

const a3Data = z.object({
  background: trimmed.optional(),
  currentState: trimmed.optional(),
  goal: trimmed.optional(),
  analysis: trimmed.optional(),
  countermeasures: trimmed.optional(),
});

const fmeaData = z.object({
  rows: z.array(
    z.object({
      id: trimmed,
      failureMode: trimmed.optional(),
      effect: trimmed.optional(),
      severity: scale.optional(),
      cause: trimmed.optional(),
      occurrence: scale.optional(),
      currentControl: trimmed.optional(),
      detection: scale.optional(),
      recommendedAction: trimmed.optional(),
    }),
  ),
});

const faultTreeNode: z.ZodType<FaultTreeNode> = z.lazy(() =>
  z.object({
    id: trimmed,
    text: trimmed.optional(),
    gate: z.enum(FAULT_TREE_GATES),
    children: z.array(faultTreeNode),
  }),
);
const faultTreeData = z.object({
  topEvent: trimmed.optional(),
  nodes: z.array(faultTreeNode),
});

const kepnerTregoeData = z.object({
  // As 4 dimensões são linhas FIXAS: exatamente 4, exatamente nesta ordem.
  rows: z
    .array(
      z.object({
        dimension: z.enum(KT_DIMENSIONS),
        is: trimmed.optional(),
        isNot: trimmed.optional(),
        distinction: trimmed.optional(),
        change: trimmed.optional(),
      }),
    )
    .refine(
      (rows) =>
        rows.length === KT_DIMENSIONS.length &&
        rows.every((r, i) => r.dimension === KT_DIMENSIONS[i]),
      {
        message:
          "Kepner-Tregoe exige exatamente as 4 dimensões, na ordem canônica",
      },
    ),
  possibleCauses: z.array(
    z.object({
      id: trimmed,
      text: trimmed.optional(),
      verification: trimmed.optional(),
      verified: z.boolean().optional(),
    }),
  ),
  mostProbableCauseId: trimmed.optional(),
});

const rcaApolloNode: z.ZodType<RcaApolloNode> = z.lazy(() =>
  z.object({
    id: trimmed,
    text: trimmed.optional(),
    type: z.enum(RCA_APOLLO_CAUSE_TYPES),
    evidence: trimmed.optional(),
    children: z.array(rcaApolloNode),
  }),
);
const rcaApolloData = z.object({
  primaryEffect: trimmed.optional(),
  causes: z.array(rcaApolloNode),
});

const barrierAnalysisData = z.object({
  hazard: trimmed.optional(),
  target: trimmed.optional(),
  barriers: z.array(
    z.object({
      id: trimmed,
      name: trimmed.optional(),
      type: z.enum(BARRIER_TYPES).optional(),
      status: z.enum(BARRIER_STATUSES).optional(),
      failureReason: trimmed.optional(),
    }),
  ),
});

export const analysisSchema = z.discriminatedUnion("key", [
  z.object({ key: z.literal("five_whys"), data: fiveWhysData }),
  z.object({ key: z.literal("ishikawa"), data: ishikawaData }),
  z.object({ key: z.literal("a3"), data: a3Data }),
  z.object({ key: z.literal("fmea"), data: fmeaData }),
  z.object({ key: z.literal("fault_tree"), data: faultTreeData }),
  z.object({ key: z.literal("kepner_tregoe"), data: kepnerTregoeData }),
  z.object({ key: z.literal("rca_apollo"), data: rcaApolloData }),
  z.object({ key: z.literal("barrier_analysis"), data: barrierAnalysisData }),
]);

export const analysesSchema = z
  .array(analysisSchema)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    for (const item of list) {
      if (seen.has(item.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `A tratativa "${item.key}" aparece mais de uma vez no plano`,
        });
        return;
      }
      seen.add(item.key);
    }
  });

export type ParseResult =
  | { ok: true; value: ActionPlanAnalysis[] }
  | { ok: false; error: string };

export function parseAnalyses(value: unknown): ParseResult {
  const r = analysesSchema.safeParse(value);
  if (!r.success)
    return {
      ok: false,
      error: r.error.issues[0]?.message ?? "Tratativa inválida",
    };
  return { ok: true, value: r.data as ActionPlanAnalysis[] };
}

// ─── `data` vazio de cada método ─────────────────────────────────────────────

/** O estado inicial de uma tratativa recém-adicionada. Deve SEMPRE passar em `parseAnalyses`. */
export function emptyAnalysisData(
  key: ActionPlanAnalysisMethodKey,
): ActionPlanAnalysis["data"] {
  switch (key) {
    case "five_whys":
      return { whys: [] };
    case "ishikawa":
      return { causes: [], whys: [] };
    case "a3":
      return {};
    case "fmea":
      return { rows: [] };
    case "fault_tree":
      return { nodes: [] };
    case "kepner_tregoe":
      // As 4 linhas nascem com a tratativa: a matriz É / NÃO É não é editável em estrutura.
      return {
        rows: KT_DIMENSIONS.map((dimension) => ({ dimension })),
        possibleCauses: [],
      };
    case "rca_apollo":
      return { causes: [] };
    case "barrier_analysis":
      return { barriers: [] };
  }
}

// ─── Normalização ────────────────────────────────────────────────────────────

function clean(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

/** Remove as chaves `undefined` para que o JSON persistido seja canônico
 *  (`{a: undefined}` e `{}` precisam comparar como iguais no diff de versões). */
function compact<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

function normalizeWhys(list: string[]): string[] {
  return list
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, MAX_WHYS);
}

/** Um nó sobrevive se tem texto próprio OU se algum descendente tem — senão sumiria
 *  com filhos preenchidos junto. */
function normalizeTree<T extends { text?: string; children: T[] }>(
  nodes: T[],
): T[] {
  const out: T[] = [];
  for (const node of nodes) {
    const children = normalizeTree(node.children ?? []);
    const text = clean(node.text);
    if (!text && children.length === 0) continue;
    out.push(compact({ ...node, text, children }));
  }
  return out;
}

/**
 * Forma canônica de `analyses`, aplicada NA ESCRITA.
 *
 * Descarta linha / nó / porquê inteiramente vazio (senão um autosave que só passeou
 * pelo formulário viraria uma "versão" no histórico), mas PRESERVA a tratativa cujo
 * `data` ficou vazio: adicionar a tratativa foi uma decisão do usuário, não ruído.
 */
export function normalizeAnalyses(
  list: ActionPlanAnalysis[],
): ActionPlanAnalysis[] {
  return list.map((analysis): ActionPlanAnalysis => {
    switch (analysis.key) {
      case "five_whys":
        return {
          key: "five_whys",
          data: { whys: normalizeWhys(analysis.data.whys ?? []) },
        };

      case "ishikawa": {
        const causes = (analysis.data.causes ?? [])
          .map((c) => ({ ...c, text: c.text?.trim() ?? "" }))
          .filter((c) => c.text !== "");
        const ids = new Set(causes.map((c) => c.id));
        const selectedCauseId = analysis.data.selectedCauseId;
        return {
          key: "ishikawa",
          data: compact({
            causes,
            // Órfão vira `undefined` em vez de erro: a causa selecionada pode ter sido apagada.
            selectedCauseId:
              selectedCauseId && ids.has(selectedCauseId)
                ? selectedCauseId
                : undefined,
            whys: normalizeWhys(analysis.data.whys ?? []),
          }),
        };
      }

      case "a3":
        return {
          key: "a3",
          data: compact({
            background: clean(analysis.data.background),
            currentState: clean(analysis.data.currentState),
            goal: clean(analysis.data.goal),
            analysis: clean(analysis.data.analysis),
            countermeasures: clean(analysis.data.countermeasures),
          }),
        };

      case "fmea": {
        const rows = (analysis.data.rows ?? [])
          .map((r) =>
            compact({
              id: r.id,
              failureMode: clean(r.failureMode),
              effect: clean(r.effect),
              severity: r.severity,
              cause: clean(r.cause),
              occurrence: r.occurrence,
              currentControl: clean(r.currentControl),
              detection: r.detection,
              recommendedAction: clean(r.recommendedAction),
            }),
          )
          .filter((r) => Object.keys(r).length > 1); // sobrou só o `id` → linha vazia
        return { key: "fmea", data: { rows } };
      }

      case "fault_tree":
        return {
          key: "fault_tree",
          data: compact({
            topEvent: clean(analysis.data.topEvent),
            nodes: normalizeTree(analysis.data.nodes ?? []),
          }),
        };

      case "kepner_tregoe": {
        // As 4 linhas são estruturais: reconstrói sempre, para nunca sair uma matriz torta.
        const byDimension = new Map(
          (analysis.data.rows ?? []).map((r) => [r.dimension, r] as const),
        );
        const rows = KT_DIMENSIONS.map((dimension) => {
          const r = byDimension.get(dimension);
          return compact({
            dimension,
            is: clean(r?.is),
            isNot: clean(r?.isNot),
            distinction: clean(r?.distinction),
            change: clean(r?.change),
          });
        });
        const possibleCauses = (analysis.data.possibleCauses ?? [])
          .map((c) =>
            compact({
              id: c.id,
              text: clean(c.text),
              verification: clean(c.verification),
              verified: c.verified,
            }),
          )
          .filter((c) => Object.keys(c).length > 1);
        const ids = new Set(possibleCauses.map((c) => c.id));
        const mostProbableCauseId = analysis.data.mostProbableCauseId;
        return {
          key: "kepner_tregoe",
          data: compact({
            rows,
            possibleCauses,
            mostProbableCauseId:
              mostProbableCauseId && ids.has(mostProbableCauseId)
                ? mostProbableCauseId
                : undefined,
          }),
        };
      }

      case "rca_apollo":
        return {
          key: "rca_apollo",
          data: compact({
            primaryEffect: clean(analysis.data.primaryEffect),
            causes: normalizeTree(analysis.data.causes ?? []),
          }),
        };

      case "barrier_analysis": {
        const barriers = (analysis.data.barriers ?? [])
          .map((b) =>
            compact({
              id: b.id,
              name: clean(b.name),
              type: b.type,
              status: b.status,
              failureReason: clean(b.failureReason),
            }),
          )
          .filter((b) => Object.keys(b).length > 1);
        return {
          key: "barrier_analysis",
          data: compact({
            hazard: clean(analysis.data.hazard),
            target: clean(analysis.data.target),
            barriers,
          }),
        };
      }
    }
  });
}

/** Tem alguma coisa escrita? Usado pelo estágio da timeline e pelo resumo do card. */
export function analysisHasContent(analysis: ActionPlanAnalysis): boolean {
  const [normalized] = normalizeAnalyses([analysis]);
  const data = normalized.data as Record<string, unknown>;
  return Object.values(data).some((v) => {
    if (Array.isArray(v)) {
      // O KT nasce com as 4 linhas vazias — um array de objetos só com `dimension` não é conteúdo.
      return v.some((item) =>
        typeof item === "object" && item !== null
          ? Object.keys(item as object).some(
              (k) => k !== "dimension" && k !== "id",
            )
          : Boolean(item),
      );
    }
    return v !== undefined && v !== null && v !== "";
  });
}
