import { z } from "zod/v4";
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { organizationsTable } from "./organizations";

/**
 * As tratativas (métodos de análise de causa) que um plano de ação pode usar.
 *
 * A ESTRUTURA de cada método vive no código (schema + editor no front), por isso a
 * chave é um enum fechado e o catálogo não tem POST nem DELETE: a empresa liga,
 * desliga, renomeia e reordena — mas não inventa um método sem editor.
 *
 * O plano referencia a tratativa por `key`, NÃO pelo id desta tabela. A chave é
 * estável por organização (índice único), então renomear o rótulo propaga sozinho e
 * desativar não quebra plano antigo. (Normas fazem o oposto — lá o rótulo é texto
 * livre do usuário e não tem identidade estável, por isso referenciam por id.)
 */
export const ACTION_PLAN_ANALYSIS_METHOD_KEYS = [
  "five_whys",
  "ishikawa",
  "a3",
  "fmea",
  "fault_tree",
  "kepner_tregoe",
  "rca_apollo",
  "barrier_analysis",
] as const;

export type ActionPlanAnalysisMethodKey =
  (typeof ACTION_PLAN_ANALYSIS_METHOD_KEYS)[number];

export const actionPlanAnalysisMethodKeyEnum = pgEnum(
  "action_plan_analysis_method_key",
  ACTION_PLAN_ANALYSIS_METHOD_KEYS,
);

export const actionPlanAnalysisMethodsTable = pgTable(
  "action_plan_analysis_methods",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    key: actionPlanAnalysisMethodKeyEnum("key").notNull(),
    label: text("label").notNull(),
    active: boolean("active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("action_plan_analysis_method_org_key_unique").on(
      table.organizationId,
      table.key,
    ),
  ],
);

export const insertActionPlanAnalysisMethodSchema = createInsertSchema(
  actionPlanAnalysisMethodsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertActionPlanAnalysisMethod = z.infer<
  typeof insertActionPlanAnalysisMethodSchema
>;
export type ActionPlanAnalysisMethod =
  typeof actionPlanAnalysisMethodsTable.$inferSelect;

// ─── Vocabulários fechados de cada método ────────────────────────────────────

/** Os 6M do diagrama de Ishikawa. */
export const ISHIKAWA_CATEGORIES = [
  "metodo",
  "maquina",
  "mao_de_obra",
  "material",
  "medicao",
  "meio_ambiente",
] as const;
export type IshikawaCategory = (typeof ISHIKAWA_CATEGORIES)[number];

/** As 4 dimensões da matriz É / NÃO É do Kepner-Tregoe. Linhas FIXAS. */
export const KT_DIMENSIONS = ["o_que", "onde", "quando", "extensao"] as const;
export type KTDimension = (typeof KT_DIMENSIONS)[number];

export const BARRIER_TYPES = [
  "fisica",
  "administrativa",
  "humana",
  "procedimental",
] as const;
export type BarrierType = (typeof BARRIER_TYPES)[number];

export const BARRIER_STATUSES = [
  "ausente",
  "falhou",
  "ineficaz",
  "funcionou",
] as const;
export type BarrierStatus = (typeof BARRIER_STATUSES)[number];

/** Portas lógicas da Árvore de Falhas. Só fazem sentido em nó com filhos. */
export const FAULT_TREE_GATES = ["AND", "OR"] as const;
export type FaultTreeGate = (typeof FAULT_TREE_GATES)[number];

/** No RCA Apollo, toda causa é uma Condição (estado) ou uma Ação (evento). */
export const RCA_APOLLO_CAUSE_TYPES = ["condition", "action"] as const;
export type RcaApolloCauseType = (typeof RCA_APOLLO_CAUSE_TYPES)[number];

/** Escalas do FMEA: 1..10. O RPN (S×O×D) é DERIVADO — nunca digitado, nunca persistido. */
export const FMEA_SCALE_MIN = 1;
export const FMEA_SCALE_MAX = 10;
/** Acima disso a linha é destacada como crítica. */
export const FMEA_RPN_ALERT = 100;

// ─── `data` de cada método ───────────────────────────────────────────────────
// Tudo opcional: a ficha salva parcial o tempo todo. Ids de linha/nó são gerados
// no cliente e servem para seleção e reordenação estáveis.

export const MAX_WHYS = 5;

export type FiveWhysData = { whys: string[] };

export type IshikawaData = {
  causes: Array<{ id: string; category: IshikawaCategory; text: string }>;
  /** A causa mais provável — alvo dos 5 porquês. */
  selectedCauseId?: string;
  whys: string[];
};

export type A3Data = {
  background?: string;
  currentState?: string;
  goal?: string;
  analysis?: string;
  countermeasures?: string;
};

export type FmeaRow = {
  id: string;
  failureMode?: string;
  effect?: string;
  severity?: number;
  cause?: string;
  occurrence?: number;
  currentControl?: string;
  detection?: number;
  recommendedAction?: string;
};
export type FmeaData = { rows: FmeaRow[] };

export type FaultTreeNode = {
  id: string;
  text?: string;
  gate: FaultTreeGate;
  children: FaultTreeNode[];
};
export type FaultTreeData = { topEvent?: string; nodes: FaultTreeNode[] };

export type KepnerTregoeData = {
  /** Sempre as 4 dimensões, sempre nesta ordem. */
  rows: Array<{
    dimension: KTDimension;
    is?: string;
    isNot?: string;
    distinction?: string;
    change?: string;
  }>;
  possibleCauses: Array<{
    id: string;
    text?: string;
    verification?: string;
    verified?: boolean;
  }>;
  mostProbableCauseId?: string;
};

export type RcaApolloNode = {
  id: string;
  text?: string;
  type: RcaApolloCauseType;
  evidence?: string;
  children: RcaApolloNode[];
};
export type RcaApolloData = { primaryEffect?: string; causes: RcaApolloNode[] };

export type BarrierAnalysisData = {
  hazard?: string;
  target?: string;
  barriers: Array<{
    id: string;
    name?: string;
    type?: BarrierType;
    status?: BarrierStatus;
    failureReason?: string;
  }>;
};

/** Uma tratativa aplicada a um plano. Discriminada por `key`. */
export type ActionPlanAnalysis =
  | { key: "five_whys"; data: FiveWhysData }
  | { key: "ishikawa"; data: IshikawaData }
  | { key: "a3"; data: A3Data }
  | { key: "fmea"; data: FmeaData }
  | { key: "fault_tree"; data: FaultTreeData }
  | { key: "kepner_tregoe"; data: KepnerTregoeData }
  | { key: "rca_apollo"; data: RcaApolloData }
  | { key: "barrier_analysis"; data: BarrierAnalysisData };
