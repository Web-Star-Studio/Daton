/**
 * Resolvedor de competência (compose-on-read) — Fase 1 (elo treinamento↔competência).
 *
 * Responde "o que este colaborador possui" combinando:
 *   (a) competências atestadas à mão (employee_competencies)
 *   (b) competências derivadas de treinamento concluído e válido cujo item de
 *       catálogo é de capacitação/habilitação e aponta para a competência
 *       (training_catalog.evidence_type, Task 1)
 *
 * O ponto central: distingue TRÊS estados por requisito, não dois.
 *   - "atende"          → acquiredLevel >= requiredLevel
 *   - "gap"              → não atende, e é PROVÁVEL (existe item de catálogo
 *                          classificado que poderia provar) ou há atestado manual
 *   - "nao_classificado" → não atende, NÃO é provável e não há atestado manual —
 *                          o sistema simplesmente não sabe avaliar. Isto NUNCA
 *                          vira "gap": marcar como gap o que não se sabe avaliar
 *                          é exatamente o bug que esta task corrige.
 *
 * Antes de qualquer classificação de catálogo (evidence_type = null em todos os
 * itens), nenhum item prova nada: todo requisito nasce "nao_classificado" e todo
 * colaborador "indeterminado". Isso é o critério de aceite, não um bug.
 */
import { and, eq, gte, inArray, isNull, or } from "drizzle-orm";
import {
  db,
  employeeCompetenciesTable,
  employeeTrainingsTable,
  positionCompetencyRequirementsTable,
  positionsTable,
  trainingCatalogTable,
} from "@workspace/db";
import { getProvingEvidenceCodes } from "../training-catalog-options/evidence";

type Db = Pick<typeof db, "select">;

// Itens de catálogo cujo evidence_type COMPROVA a competência-alvo quando
// concluídos e válidos. O conjunto de códigos que provam é gerenciável por org
// (catálogo `training_catalog_options`, kind=evidence_type, proves_competency),
// resolvido em runtime por `getProvingEvidenceCodes`. Códigos fora dele (ex.:
// "conscientizacao") e `null` (não classificado) não provam.

export type RequirementStatus = "atende" | "gap" | "nao_classificado";
export type GapStatus = "ok" | "gap" | "critical" | "indeterminado";

export interface CompetencyEvidence {
  trainingId: number;
  title: string;
  completionDate: string | null;
  expirationDate: string | null;
}

export interface ResolvedRequirement {
  competencyName: string;
  competencyType: string;
  requiredLevel: number;
  acquiredLevel: number;
  status: RequirementStatus;
  source: "manual" | "treinamento" | null;
  evidence: CompetencyEvidence | null;
  gapLevel: number;
  critical: boolean;
  // Id do `employee_competencies` que atesta este requisito à mão, quando
  // existe — populado SEMPRE que há atestado manual casado, mesmo que a
  // `source` resolvida seja "treinamento" (um treino de nível igual/maior
  // vence como fonte, mas o atestado manual continua existindo e o front
  // precisa do id para permitir editá-lo/removê-lo). `null` só quando não há
  // atestado manual nenhum para a chave.
  manualCompetencyId: number | null;
}

export interface EmployeeConformance {
  employeeId: number;
  positionName: string | null;
  requirements: ResolvedRequirement[];
  gapStatus: GapStatus;
}

// ─── Helpers (movidos de employee-learning-aggregates.ts) ─────────────────────
// employee-learning-aggregates.ts reexporta estes dois a partir daqui.

export function normalizeCompetencyText(
  value: string | null | undefined,
): string {
  return (value || "").trim().toLocaleLowerCase("pt-BR");
}

export function buildCompetencyKey(
  name: string | null | undefined,
  type: string | null | undefined,
): string {
  return `${normalizeCompetencyText(name)}::${normalizeCompetencyText(type) || "habilidade"}`;
}

interface TrainingProof {
  level: number;
  evidence: CompetencyEvidence;
}

/**
 * Resolve, em lote, a conformidade de competência de cada colaborador da
 * página contra os requisitos do respectivo cargo — combinando atestados
 * manuais e treinamentos que provam competência (regras 1–5 do brief).
 *
 * Todas as consultas são em lote (uma por passo, com `inArray`) — nunca uma
 * consulta por colaborador, mesmo padrão de `computeCompetencyGapStatusByEmployee`.
 *
 * CONTRATO DE ORG-SCOPING: `employees` DEVE conter apenas colaboradores já
 * restritos à `orgId` informada — esta função confia no chamador. A consulta
 * de `employee_trainings` (passo 5) filtra apenas por `employee_id IN (...)`,
 * pois a tabela não tem coluna `organization_id`; não há proteção adicional
 * aqui contra vazamento cross-org caso o chamador passe IDs de outra
 * organização. Mesmo modelo de `computeCompetencyGapStatusByEmployee`.
 */
export async function resolveEmployeeCompetencies(
  database: Db,
  orgId: number,
  employees: { id: number; position: string | null }[],
): Promise<Map<number, EmployeeConformance>> {
  const conformanceMap = new Map<number, EmployeeConformance>();

  if (employees.length === 0) return conformanceMap;

  // ── 1. Resolve unique position names → position rows (org-scoped) ────────
  const positionNames = [
    ...new Set(
      employees.map((e) => e.position).filter((v): v is string => !!v),
    ),
  ];

  const positionByName = new Map<string, typeof positionsTable.$inferSelect>();
  if (positionNames.length > 0) {
    const positions = await database
      .select()
      .from(positionsTable)
      .where(
        and(
          eq(positionsTable.organizationId, orgId),
          inArray(positionsTable.name, positionNames),
        ),
      );
    for (const p of positions) positionByName.set(p.name, p);
  }

  const positionIds = [...positionByName.values()].map((p) => p.id);

  // ── 2. Load competency requirements for the involved positions ───────────
  const requirementsByPositionId = new Map<
    number,
    (typeof positionCompetencyRequirementsTable.$inferSelect)[]
  >();
  if (positionIds.length > 0) {
    const requirements = await database
      .select()
      .from(positionCompetencyRequirementsTable)
      .where(
        inArray(positionCompetencyRequirementsTable.positionId, positionIds),
      );
    for (const req of requirements) {
      const items = requirementsByPositionId.get(req.positionId) ?? [];
      items.push(req);
      requirementsByPositionId.set(req.positionId, items);
    }
  }

  // Códigos de tipo de evidência que provam competência NESTA org (catálogo
  // gerenciável). Vazio ⇒ nenhum item prova nada: todo requisito nasce
  // "nao_classificado" — o mesmo estado de antes de qualquer classificação.
  const provingCodes = await getProvingEvidenceCodes(database, orgId);

  // ── 3. Load the org's "provável" set: distinct target competencies that
  //      SOME classified catalog item could prove — regardless of who has
  //      taken it. This is what separates "não fez" de "não dá pra saber".
  const provableRows =
    provingCodes.length === 0
      ? []
      : await database
          .select({
            targetCompetencies: trainingCatalogTable.targetCompetencies,
          })
          .from(trainingCatalogTable)
          .where(
            and(
              eq(trainingCatalogTable.organizationId, orgId),
              inArray(trainingCatalogTable.evidenceType, provingCodes),
            ),
          );

  // Um item de catálogo pode provar VÁRIAS competências. Cada entrada da lista
  // torna aquela competência "provável". Item com lista vazia não prova nada.
  const provableSet = new Set<string>();
  for (const row of provableRows) {
    for (const comp of row.targetCompetencies ?? []) {
      if (!comp?.name) continue;
      provableSet.add(buildCompetencyKey(comp.name, comp.type));
    }
  }

  const employeeIds = employees.map((e) => e.id);

  // ── 4. Load manually attested competencies (max level wins) ──────────────
  // O valor guarda o `id` da linha de employee_competencies junto do nível,
  // para que o requisito resolvido possa apontar para a linha exata que o
  // atesta (manualCompetencyId) — não só o nível agregado.
  const manualByEmployee = new Map<
    number,
    Map<string, { level: number; id: number }>
  >();
  if (employeeIds.length > 0) {
    const competencies = await database
      .select()
      .from(employeeCompetenciesTable)
      .where(inArray(employeeCompetenciesTable.employeeId, employeeIds));

    for (const comp of competencies) {
      const key = buildCompetencyKey(comp.name, comp.type);
      const byKey = manualByEmployee.get(comp.employeeId) ?? new Map();
      // Presença da chave é o que distingue "há atestado manual" de "não há
      // linha nenhuma" (achado 1) — por isso a primeira ocorrência SEMPRE
      // grava, mesmo com acquiredLevel 0. Entre duplicatas legadas da mesma
      // chave, vence o MAIOR nível; empatando, o MENOR id — o MESMO desempate
      // do endpoint de upsert (`orderBy(desc(acquiredLevel), asc(id))`), para
      // que `manualCompetencyId` aponte para a mesma linha que a edição/remoção
      // vai atingir.
      const cur = byKey.get(key);
      if (
        !cur ||
        comp.acquiredLevel > cur.level ||
        (comp.acquiredLevel === cur.level && comp.id < cur.id)
      ) {
        byKey.set(key, { level: comp.acquiredLevel, id: comp.id });
      }
      manualByEmployee.set(comp.employeeId, byKey);
    }
  }

  // ── 5. Load proving trainings: concluído, não vencido, item de catálogo
  //      classificado (capacitação/habilitação) apontando para uma competência.
  //      Empate: maior nível vence; empatando, conclusão mais recente.
  const trainingByEmployee = new Map<number, Map<string, TrainingProof>>();
  if (employeeIds.length > 0 && provingCodes.length > 0) {
    const today = new Date().toISOString().slice(0, 10);

    const rows = await database
      .select({
        employeeId: employeeTrainingsTable.employeeId,
        trainingId: employeeTrainingsTable.id,
        title: employeeTrainingsTable.title,
        completionDate: employeeTrainingsTable.completionDate,
        expirationDate: employeeTrainingsTable.expirationDate,
        targetCompetencies: trainingCatalogTable.targetCompetencies,
      })
      .from(employeeTrainingsTable)
      .innerJoin(
        trainingCatalogTable,
        eq(employeeTrainingsTable.catalogItemId, trainingCatalogTable.id),
      )
      .where(
        and(
          inArray(employeeTrainingsTable.employeeId, employeeIds),
          eq(employeeTrainingsTable.status, "concluido"),
          or(
            isNull(employeeTrainingsTable.expirationDate),
            gte(employeeTrainingsTable.expirationDate, today),
          ),
          inArray(trainingCatalogTable.evidenceType, provingCodes),
        ),
      );

    for (const row of rows) {
      const evidence: CompetencyEvidence = {
        trainingId: row.trainingId,
        title: row.title,
        completionDate: row.completionDate,
        expirationDate: row.expirationDate,
      };

      // Um treino concluído acende TODAS as competências do seu item de catálogo.
      for (const comp of row.targetCompetencies ?? []) {
        if (!comp?.name) continue;
        const key = buildCompetencyKey(comp.name, comp.type);
        const level = comp.level ?? 1;

        const byKey = trainingByEmployee.get(row.employeeId) ?? new Map();
        const existing = byKey.get(key);
        const better =
          !existing ||
          level > existing.level ||
          (level === existing.level &&
            (row.completionDate ?? "") >
              (existing.evidence.completionDate ?? ""));
        if (better) byKey.set(key, { level, evidence });
        trainingByEmployee.set(row.employeeId, byKey);
      }
    }
  }

  // ── 6. Build requirements[] + derive gapStatus per employee ──────────────
  for (const employee of employees) {
    const position = employee.position
      ? (positionByName.get(employee.position) ?? null)
      : null;
    const posReqs = position
      ? (requirementsByPositionId.get(position.id) ?? [])
      : [];

    const manualForEmployee =
      manualByEmployee.get(employee.id) ??
      new Map<string, { level: number; id: number }>();
    const trainingForEmployee =
      trainingByEmployee.get(employee.id) ?? new Map<string, TrainingProof>();

    const requirements: ResolvedRequirement[] = [];
    let hasCritical = false;
    let hasGap = false;
    let hasIndeterminado = false;

    for (const req of posReqs) {
      const key = buildCompetencyKey(req.competencyName, req.competencyType);
      const manualEntry = manualForEmployee.get(key) ?? null;
      const hasManual = manualEntry !== null;
      const manualLevel = manualEntry?.level ?? 0;
      const manualCompetencyId = manualEntry?.id ?? null;
      const trainingProof = trainingForEmployee.get(key) ?? null;
      const trainingLevel = trainingProof?.level ?? 0;

      const acquiredLevel = Math.max(manualLevel, trainingLevel);
      const provable = provableSet.has(key);

      let status: RequirementStatus;
      if (acquiredLevel >= req.requiredLevel) {
        status = "atende";
      } else if (!provable && !hasManual) {
        status = "nao_classificado";
      } else {
        status = "gap";
      }

      const source: ResolvedRequirement["source"] =
        acquiredLevel === 0
          ? null
          : trainingLevel >= manualLevel && trainingLevel > 0
            ? "treinamento"
            : "manual";

      // Fórmula de criticidade — vive SÓ aqui. `critical` só pode ser true
      // para um requisito que já é "gap" de verdade: nunca para "atende" nem
      // para "nao_classificado" (senão o "não avaliável" contaminaria a
      // contagem de críticos).
      const gapLevel = Math.max(req.requiredLevel - acquiredLevel, 0);
      const critical =
        status === "gap" && (gapLevel >= 2 || req.requiredLevel >= 4);

      if (status === "gap") {
        if (critical) hasCritical = true;
        else hasGap = true;
      } else if (status === "nao_classificado") {
        hasIndeterminado = true;
      }

      requirements.push({
        competencyName: req.competencyName,
        competencyType: req.competencyType,
        requiredLevel: req.requiredLevel,
        acquiredLevel,
        status,
        source,
        evidence:
          source === "treinamento" ? (trainingProof?.evidence ?? null) : null,
        gapLevel,
        critical,
        manualCompetencyId,
      });
    }

    let gapStatus: GapStatus;
    if (hasCritical) gapStatus = "critical";
    else if (hasGap) gapStatus = "gap";
    else if (hasIndeterminado) gapStatus = "indeterminado";
    else gapStatus = "ok";

    conformanceMap.set(employee.id, {
      employeeId: employee.id,
      positionName: position?.name ?? null,
      requirements,
      gapStatus,
    });
  }

  return conformanceMap;
}
