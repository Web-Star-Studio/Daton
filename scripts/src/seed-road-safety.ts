/**
 * Road safety (ISO 39001 · 6.3) seed — populates performance factors (FDs)
 * and their measurement history for the demo organization.
 *
 * Idempotent: skips factors whose code already exists for the org.
 * Run: pnpm --filter @workspace/scripts seed-road-safety
 */
import {
  db,
  organizationsTable,
  roadSafetyFactorMeasurementsTable,
  roadSafetyFactorsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

const YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

type FactorSeed = {
  code: string;
  type: "exposure" | "intermediate" | "final";
  origin: "human" | "vehicle" | "road" | "human_vehicle";
  normItem: string | null;
  name: string;
  analysis: string;
  monitoringForm: string;
  periodicity: string;
  measureUnit: string;
  goal: number;
  gut: [number, number, number];
  controlStatus:
    | "scheduled"
    | "regularized"
    | "non_conforming"
    | "overdue"
    | "in_progress";
  existingControls: string;
  actionPlanRef: string | null;
  /** Monthly values Jan→… for YEAR. */
  values: number[];
  /** When false, the current-month value is dropped (counts as "sem atualização"). */
  updatedThisMonth: boolean;
};

const FACTORS: FactorSeed[] = [
  {
    code: "FD01",
    type: "exposure",
    origin: "human",
    normItem: "6.3a",
    name: "Km rodados por jornada de trabalho",
    analysis:
      "A exposição ao risco cresce proporcionalmente à quilometragem diária. Jornadas longas elevam fadiga e probabilidade de sinistro.",
    monitoringForm: "indicator",
    periodicity: "monthly",
    measureUnit: "km",
    goal: 10000,
    gut: [5, 5, 5],
    controlStatus: "non_conforming",
    existingControls: "Telemetria embarcada e limite contratual de jornada.",
    actionPlanRef: "AC-2026-014",
    values: [9500, 9800, 10100, 12400, 11200],
    updatedThisMonth: true,
  },
  {
    code: "FD02",
    type: "intermediate",
    origin: "road",
    normItem: "6.3c.1",
    name: "Adequação da sinalização e projeto das rotas",
    analysis:
      "Rotas sem sinalização adequada ou com projeto geométrico deficiente aumentam o risco viário.",
    monitoringForm: "internal_audit",
    periodicity: "quarterly",
    measureUnit: "% rotas conformes",
    goal: 100,
    gut: [3, 3, 3],
    controlStatus: "regularized",
    existingControls: "Inspeção trimestral das rotas críticas com checklist.",
    actionPlanRef: null,
    values: [94, 95, 97, 98, 98],
    updatedThisMonth: true,
  },
  {
    code: "FD03",
    type: "intermediate",
    origin: "vehicle",
    normItem: "6.3c.9",
    name: "Remoção de veículos reprovados na inspeção",
    analysis:
      "Veículos reprovados que seguem operando representam risco direto à segurança viária.",
    monitoringForm: "report",
    periodicity: "monthly",
    measureUnit: "veículos",
    goal: 0,
    gut: [4, 3, 3],
    controlStatus: "in_progress",
    existingControls: "Bloqueio de escala para veículos reprovados.",
    actionPlanRef: "AC-2026-021",
    values: [2, 1, 1, 0, 1],
    updatedThisMonth: true,
  },
  {
    code: "FD04",
    type: "intermediate",
    origin: "human",
    normItem: "6.3c.10",
    name: "Tempo de resposta pós-acidente",
    analysis:
      "O tempo até o primeiro atendimento influencia diretamente a gravidade das lesões.",
    monitoringForm: "indicator",
    periodicity: "monthly",
    measureUnit: "min",
    goal: 15,
    gut: [4, 4, 3],
    controlStatus: "scheduled",
    existingControls: "Protocolo de emergência e brigada treinada.",
    actionPlanRef: null,
    values: [22, 20, 19, 18],
    updatedThisMonth: false,
  },
  {
    code: "FD05",
    type: "exposure",
    origin: "human",
    normItem: "6.3a",
    name: "Horas de condução noturna por motorista",
    analysis:
      "A condução noturna eleva a exposição ao risco por menor visibilidade e maior fadiga.",
    monitoringForm: "indicator",
    periodicity: "monthly",
    measureUnit: "h",
    goal: 20,
    gut: [3, 4, 3],
    controlStatus: "in_progress",
    existingControls: "Planejamento de escalas priorizando trechos diurnos.",
    actionPlanRef: "AC-2026-009",
    values: [28, 26, 24, 23, 22],
    updatedThisMonth: true,
  },
  {
    code: "FD06",
    type: "final",
    origin: "human_vehicle",
    normItem: "6.3b",
    name: "Taxa de acidentes com afastamento",
    analysis:
      "Resultado final de segurança — mede acidentes que geraram afastamento de condutores.",
    monitoringForm: "indicator",
    periodicity: "monthly",
    measureUnit: "%",
    goal: 0,
    gut: [5, 4, 4],
    controlStatus: "in_progress",
    existingControls: "Análise de causa raiz para todo acidente registrado.",
    actionPlanRef: "AC-2026-003",
    values: [0.8, 0.5, 0.6, 0.3, 0.2],
    updatedThisMonth: true,
  },
  {
    code: "FD07",
    type: "intermediate",
    origin: "human",
    normItem: "6.3c.3",
    name: "Uso de EPI e cinto de segurança",
    analysis:
      "O uso consistente de equipamentos de proteção reduz a gravidade das lesões em sinistros.",
    monitoringForm: "internal_audit",
    periodicity: "monthly",
    measureUnit: "% conformes",
    goal: 100,
    gut: [4, 5, 3],
    controlStatus: "in_progress",
    existingControls: "Auditoria de campo e campanhas de conscientização.",
    actionPlanRef: "AC-2026-018",
    values: [85, 88, 90, 91, 92],
    updatedThisMonth: true,
  },
  {
    code: "FD08",
    type: "intermediate",
    origin: "human",
    normItem: "6.3c.4",
    name: "Velocidade de condução segura",
    analysis:
      "Excessos de velocidade são fator determinante na ocorrência e gravidade de acidentes.",
    monitoringForm: "indicator",
    periodicity: "monthly",
    measureUnit: "% conformes",
    goal: 95,
    gut: [5, 5, 4],
    controlStatus: "overdue",
    existingControls: "Telemetria com alerta de velocidade e feedback ao condutor.",
    actionPlanRef: "AC-2026-007",
    values: [74, 76, 79, 78],
    updatedThisMonth: false,
  },
  {
    code: "FD09",
    type: "intermediate",
    origin: "human",
    normItem: "6.3c.5",
    name: "Estado de saúde dos condutores",
    analysis:
      "Condições de saúde não monitoradas podem comprometer a aptidão para conduzir.",
    monitoringForm: "report",
    periodicity: "quarterly",
    measureUnit: "ocorrências",
    goal: 0,
    gut: [5, 5, 4],
    controlStatus: "scheduled",
    existingControls: "Exames periódicos e programa de saúde ocupacional.",
    actionPlanRef: "AC-2026-011",
    values: [5, 4, 4, 4],
    updatedThisMonth: false,
  },
  {
    code: "FD10",
    type: "intermediate",
    origin: "human",
    normItem: "6.3c.6",
    name: "Planejamento seguro do percurso",
    analysis:
      "Percursos planejados com rotograma reduzem improvisos e exposição a trechos críticos.",
    monitoringForm: "indicator",
    periodicity: "monthly",
    measureUnit: "% com rotograma",
    goal: 100,
    gut: [4, 3, 3],
    controlStatus: "in_progress",
    existingControls: "Rotograma obrigatório emitido antes de cada viagem.",
    actionPlanRef: null,
    values: [82, 84, 86, 87, 88],
    updatedThisMonth: true,
  },
  {
    code: "FD11",
    type: "intermediate",
    origin: "vehicle",
    normItem: "6.3c.7",
    name: "Segurança e condição dos veículos",
    analysis:
      "A manutenção preventiva mantém os veículos em condição segura de operação.",
    monitoringForm: "internal_audit",
    periodicity: "monthly",
    measureUnit: "% aprovados",
    goal: 100,
    gut: [5, 4, 3],
    controlStatus: "regularized",
    existingControls: "Checklist diário e plano de manutenção preventiva.",
    actionPlanRef: null,
    values: [95, 96, 97, 97, 98],
    updatedThisMonth: true,
  },
  {
    code: "FD12",
    type: "intermediate",
    origin: "human",
    normItem: "6.3c.8",
    name: "Treinamento e habilitação de condutores",
    analysis:
      "Condutores devidamente habilitados e treinados operam com menor risco.",
    monitoringForm: "report",
    periodicity: "semiannual",
    measureUnit: "% habilitados",
    goal: 100,
    gut: [3, 2, 2],
    controlStatus: "regularized",
    existingControls: "Controle de validade de CNH e treinamento de direção defensiva.",
    actionPlanRef: null,
    values: [100, 100, 100, 100, 100],
    updatedThisMonth: true,
  },
  {
    code: "FD13",
    type: "final",
    origin: "human_vehicle",
    normItem: "6.3b",
    name: "Lesões fatais em acidentes de trânsito",
    analysis:
      "Resultado final crítico — meta de zero fatalidades alinhada à visão da norma.",
    monitoringForm: "indicator",
    periodicity: "monthly",
    measureUnit: "fatalidades",
    goal: 0,
    gut: [3, 3, 3],
    controlStatus: "regularized",
    existingControls: "Investigação completa e plano de ação para cada evento grave.",
    actionPlanRef: null,
    values: [0, 0, 0, 0, 0],
    updatedThisMonth: true,
  },
  {
    code: "FD14",
    type: "intermediate",
    origin: "human",
    normItem: null,
    name: "Pausas de descanso cumpridas na jornada",
    analysis:
      "FD adicional — monitora o cumprimento das pausas obrigatórias para controle de fadiga.",
    monitoringForm: "indicator",
    periodicity: "monthly",
    measureUnit: "% conformes",
    goal: 100,
    gut: [3, 3, 2],
    controlStatus: "in_progress",
    existingControls: "Registro de jornada e bloqueio de partida sem pausa mínima.",
    actionPlanRef: "AC-2026-025",
    values: [88, 90, 91, 93, 94],
    updatedThisMonth: true,
  },
];

function referenceDate(month: number): string {
  return `${YEAR}-${String(month).padStart(2, "0")}-15`;
}

async function main() {
  const orgs = await db.select().from(organizationsTable).limit(1);
  if (orgs.length === 0) throw new Error("No organization found — run seed.ts first");
  const orgId = orgs[0].id;
  console.log(`Using org: ${orgs[0].name} (id=${orgId})`);

  let created = 0;
  let skipped = 0;

  for (const fd of FACTORS) {
    const existing = await db
      .select({ id: roadSafetyFactorsTable.id })
      .from(roadSafetyFactorsTable)
      .where(
        and(
          eq(roadSafetyFactorsTable.organizationId, orgId),
          eq(roadSafetyFactorsTable.code, fd.code),
        ),
      );
    if (existing.length > 0) {
      skipped += 1;
      console.log(`  ✓ Factor exists: ${fd.code}`);
      continue;
    }

    const isAdditional = fd.normItem === null;
    const [factor] = await db
      .insert(roadSafetyFactorsTable)
      .values({
        organizationId: orgId,
        code: fd.code,
        type: fd.type,
        origin: fd.origin,
        normItem: fd.normItem,
        isAdditional,
        name: fd.name,
        analysis: fd.analysis,
        monitoringForm: fd.monitoringForm,
        periodicity: fd.periodicity,
        measureUnit: fd.measureUnit,
        goal: String(fd.goal),
        monitoringDetail: null,
        gutGravity: fd.gut[0],
        gutUrgency: fd.gut[1],
        gutTendency: fd.gut[2],
        existingControls: fd.existingControls,
        controlStatus: fd.controlStatus,
        actionPlanRef: fd.actionPlanRef,
      })
      .returning();

    const monthsToInsert = fd.updatedThisMonth
      ? Math.min(fd.values.length, CURRENT_MONTH)
      : Math.min(fd.values.length, CURRENT_MONTH - 1);

    const measurementRows = fd.values
      .slice(0, monthsToInsert)
      .map((value, i) => ({
        organizationId: orgId,
        factorId: factor.id,
        value: String(value),
        referenceDate: referenceDate(i + 1),
      }));

    if (measurementRows.length > 0) {
      await db.insert(roadSafetyFactorMeasurementsTable).values(measurementRows);
    }

    created += 1;
    console.log(`  + Factor created: ${fd.code} — ${fd.name} (${measurementRows.length} lançamentos)`);
  }

  console.log(`\nDone! ${created} factors created, ${skipped} already existed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
