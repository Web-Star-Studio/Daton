/**
 * Espelho, no front, dos tipos de tratativa definidos em `lib/db/src/schema/
 * action-plan-analysis-methods.ts` e no OpenAPI. O front não importa `@workspace/db`
 * (dependência de servidor), e a saída do Orval para a união discriminada não é confiável
 * o bastante para tipar os editores — então estes tipos são a fonte aqui.
 *
 * MANTER EM SINCRONIA com o schema e o OpenAPI. Mudou a forma de um método? Mudou nos três.
 */

export const ANALYSIS_METHOD_KEYS = [
  "five_whys",
  "ishikawa",
  "a3",
  "fmea",
  "fault_tree",
  "kepner_tregoe",
  "rca_apollo",
  "barrier_analysis",
] as const;
export type AnalysisMethodKey = (typeof ANALYSIS_METHOD_KEYS)[number];

export const MAX_WHYS = 5;
export const FMEA_RPN_ALERT = 100;

export const ISHIKAWA_CATEGORIES = [
  "metodo",
  "maquina",
  "mao_de_obra",
  "material",
  "medicao",
  "meio_ambiente",
] as const;
export type IshikawaCategory = (typeof ISHIKAWA_CATEGORIES)[number];
export const ISHIKAWA_CATEGORY_LABELS: Record<IshikawaCategory, string> = {
  metodo: "Método",
  maquina: "Máquina",
  mao_de_obra: "Mão de obra",
  material: "Material",
  medicao: "Medição",
  meio_ambiente: "Meio ambiente",
};

export const KT_DIMENSIONS = ["o_que", "onde", "quando", "extensao"] as const;
export type KTDimension = (typeof KT_DIMENSIONS)[number];
export const KT_DIMENSION_LABELS: Record<KTDimension, string> = {
  o_que: "O quê (identidade)",
  onde: "Onde (localização)",
  quando: "Quando (tempo)",
  extensao: "Extensão (magnitude)",
};

export const BARRIER_TYPES = [
  "fisica",
  "administrativa",
  "humana",
  "procedimental",
] as const;
export type BarrierType = (typeof BARRIER_TYPES)[number];
export const BARRIER_TYPE_LABELS: Record<BarrierType, string> = {
  fisica: "Física",
  administrativa: "Administrativa",
  humana: "Humana",
  procedimental: "Procedimental",
};

export const BARRIER_STATUSES = [
  "ausente",
  "falhou",
  "ineficaz",
  "funcionou",
] as const;
export type BarrierStatus = (typeof BARRIER_STATUSES)[number];
export const BARRIER_STATUS_LABELS: Record<BarrierStatus, string> = {
  ausente: "Ausente",
  falhou: "Falhou",
  ineficaz: "Ineficaz",
  funcionou: "Funcionou",
};

export type FaultTreeGate = "AND" | "OR";
export const FAULT_TREE_GATE_LABELS: Record<FaultTreeGate, string> = {
  AND: "E",
  OR: "OU",
};

export type RcaApolloCauseType = "condition" | "action";
export const RCA_APOLLO_TYPE_LABELS: Record<RcaApolloCauseType, string> = {
  condition: "Condição",
  action: "Ação",
};

/** Escalas do FMEA. O texto de cada nível é o que impede o usuário de "chutar" o número. */
export const FMEA_SEVERITY_SCALE: Record<number, string> = {
  1: "1 — Sem efeito perceptível",
  2: "2 — Efeito muito leve",
  3: "3 — Efeito leve",
  4: "4 — Incômodo menor",
  5: "5 — Incômodo moderado",
  6: "6 — Degradação de desempenho",
  7: "7 — Perda de função principal",
  8: "8 — Perda total de função",
  9: "9 — Risco de segurança com aviso",
  10: "10 — Risco de segurança sem aviso",
};
export const FMEA_OCCURRENCE_SCALE: Record<number, string> = {
  1: "1 — Improvável",
  2: "2 — Muito rara",
  3: "3 — Rara",
  4: "4 — Baixa",
  5: "5 — Ocasional",
  6: "6 — Moderada",
  7: "7 — Frequente",
  8: "8 — Alta",
  9: "9 — Muito alta",
  10: "10 — Quase certa",
};
export const FMEA_DETECTION_SCALE: Record<number, string> = {
  1: "1 — Detecção quase certa",
  2: "2 — Detecção muito alta",
  3: "3 — Detecção alta",
  4: "4 — Detecção moderadamente alta",
  5: "5 — Detecção moderada",
  6: "6 — Detecção baixa",
  7: "7 — Detecção muito baixa",
  8: "8 — Detecção remota",
  9: "9 — Detecção muito remota",
  10: "10 — Detecção quase impossível",
};

export type FiveWhysData = { whys: string[] };
export type IshikawaData = {
  causes: Array<{ id: string; category: IshikawaCategory; text: string }>;
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

export type AnalysisData =
  | FiveWhysData
  | IshikawaData
  | A3Data
  | FmeaData
  | FaultTreeData
  | KepnerTregoeData
  | RcaApolloData
  | BarrierAnalysisData;

export type ActionPlanAnalysis =
  | { key: "five_whys"; data: FiveWhysData }
  | { key: "ishikawa"; data: IshikawaData }
  | { key: "a3"; data: A3Data }
  | { key: "fmea"; data: FmeaData }
  | { key: "fault_tree"; data: FaultTreeData }
  | { key: "kepner_tregoe"; data: KepnerTregoeData }
  | { key: "rca_apollo"; data: RcaApolloData }
  | { key: "barrier_analysis"; data: BarrierAnalysisData };

/** RPN = S × O × D. `null` enquanto faltar qualquer um dos três. */
export function fmeaRpn(
  row: Pick<FmeaRow, "severity" | "occurrence" | "detection">,
): number | null {
  if (!row.severity || !row.occurrence || !row.detection) return null;
  return row.severity * row.occurrence * row.detection;
}

/** Id estável de linha/nó. Gerado no cliente; só precisa ser único dentro da tratativa. */
export function newId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `id-${Math.random().toString(36).slice(2, 10)}`
  );
}
