/**
 * Operational Planning seed — populates operational plans, checklist items,
 * cycles with readiness executions, and a change record for the demo org.
 *
 * Idempotent: removes existing demo plans before re-inserting.
 * Run: pnpm --filter @workspace/scripts seed-operational-planning
 */
import {
  db,
  organizationsTable,
  unitsTable,
  employeesTable,
  usersTable,
  documentsTable,
  sgqProcessesTable,
  strategicPlanRiskOpportunityItemsTable,
  operationalPlansTable,
  operationalPlanDocumentsTable,
  operationalPlanRiskLinksTable,
  operationalReadinessChecklistsTable,
  operationalPlanRevisionsTable,
  operationalCycleEvidencesTable,
  operationalReadinessExecutionsTable,
  operationalChangesTable,
  operationalChangeRiskLinksTable,
} from "@workspace/db";
import type { OperationalPlanRevisionSnapshot } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const DEMO_ORGANIZATION_LEGAL_IDENTIFIER =
  process.env.SEED_ORG_LEGAL_IDENTIFIER ?? "12.345.678/0001-90";
const SEED_ORG_ID = process.env.SEED_ORG_ID
  ? parseInt(process.env.SEED_ORG_ID, 10)
  : null;

const DEMO_PLAN_TITLES = [
  "Atendimento em Campo — SGI",
  "Instalação de Equipamentos Industriais",
  "Manutenção Preventiva de Frota",
];

async function seedOperationalPlanning() {
  // ── Locate org ───────────────────────────────────────────────────────────
  const [org] = SEED_ORG_ID
    ? await db
        .select({ id: organizationsTable.id })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, SEED_ORG_ID))
    : await db
        .select({ id: organizationsTable.id })
        .from(organizationsTable)
        .where(eq(organizationsTable.legalIdentifier, DEMO_ORGANIZATION_LEGAL_IDENTIFIER));

  if (!org) {
    console.error(
      SEED_ORG_ID
        ? `Organization id=${SEED_ORG_ID} not found.`
        : `Organization with legalIdentifier="${DEMO_ORGANIZATION_LEGAL_IDENTIFIER}" not found. ` +
          "Run `pnpm --filter @workspace/scripts seed` first, or pass SEED_ORG_ID=<id>.",
    );
    process.exit(1);
  }
  const orgId = org.id;

  // ── Load reference data ──────────────────────────────────────────────────
  const units = await db
    .select({ id: unitsTable.id, name: unitsTable.name })
    .from(unitsTable)
    .where(eq(unitsTable.organizationId, orgId));

  const employees = await db
    .select({ id: employeesTable.id, name: employeesTable.name })
    .from(employeesTable)
    .where(eq(employeesTable.organizationId, orgId));

  const seedUserEmail = process.env.SEED_USER_EMAIL;
  const adminUser = seedUserEmail
    ? await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, seedUserEmail))
        .then((r) => r[0] ?? null)
    : await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.organizationId, orgId))
        .limit(1)
        .then((r) => r[0] ?? null);

  const processes = await db
    .select({ id: sgqProcessesTable.id, name: sgqProcessesTable.name })
    .from(sgqProcessesTable)
    .where(eq(sgqProcessesTable.organizationId, orgId));

  const docs = await db
    .select({ id: documentsTable.id, title: documentsTable.title, status: documentsTable.status })
    .from(documentsTable)
    .where(eq(documentsTable.organizationId, orgId));

  const risks = await db
    .select({
      id: strategicPlanRiskOpportunityItemsTable.id,
      title: strategicPlanRiskOpportunityItemsTable.title,
    })
    .from(strategicPlanRiskOpportunityItemsTable)
    .where(eq(strategicPlanRiskOpportunityItemsTable.organizationId, orgId));

  const unitId = (hint: string) =>
    units.find((u) => u.name.toLowerCase().includes(hint.toLowerCase()))?.id ??
    units[0]?.id ??
    null;

  const employeeId = (hint: string) =>
    employees.find((e) => e.name.toLowerCase().includes(hint.toLowerCase()))?.id ??
    employees[0]?.id ??
    null;

  const processId = (hint: string) =>
    processes.find((p) => p.name.toLowerCase().includes(hint.toLowerCase()))?.id ??
    processes[0]?.id ??
    null;

  const createdById = adminUser?.id ?? null;

  if (!createdById) {
    console.error(
      seedUserEmail
        ? `User "${seedUserEmail}" not found. Check SEED_USER_EMAIL.`
        : `No user found for org id=${orgId}. Pass SEED_USER_EMAIL=<email>.`,
    );
    process.exit(1);
  }

  // ── Clean previous demo data ─────────────────────────────────────────────
  const existing = await db
    .select({ id: operationalPlansTable.id })
    .from(operationalPlansTable)
    .where(inArray(operationalPlansTable.title, DEMO_PLAN_TITLES));

  if (existing.length > 0) {
    const ids = existing.map((r) => r.id);
    await db.delete(operationalPlansTable).where(inArray(operationalPlansTable.id, ids));
    console.log(`Removed ${ids.length} existing demo plan(s).`);
  }

  // ── Plan 1 — Atendimento em Campo ────────────────────────────────────────
  console.log("Inserting: Atendimento em Campo — SGI...");

  const p1ProcessId = processId("campo") ?? processId("atendimento");
  const p1UnitId    = unitId("sul") ?? unitId("campo");
  const p1RespId    = employeeId("ana") ?? employeeId("carlos");
  const approvedDoc = docs.find((d) => d.status === "approved") ?? docs[0];
  const firstRisk   = risks[0] ?? null;
  const firstEmp    = employees[0] ?? null;

  const p1ChecklistItems = [
    { title: "EPI completo disponível",          instructions: "Verificar capacete, luvas, colete e botina antes do deslocamento.", isCritical: true,  sortOrder: 1 },
    { title: "Documento de procedimento vigente", instructions: "Confirmar revisão aplicável e validade antes da execução.",         isCritical: true,  sortOrder: 2 },
    { title: "Veículo inspecionado",              instructions: "Verificar combustível, pneus e kit de segurança veicular.",         isCritical: false, sortOrder: 3 },
  ];

  const p1Snapshot: OperationalPlanRevisionSnapshot = {
    title: "Atendimento em Campo — SGI",
    planCode: "OP-001",
    processId: p1ProcessId ?? null,
    unitId: p1UnitId ?? null,
    responsibleId: p1RespId ?? null,
    serviceType: "Operação assistida",
    scope: "Planejar e controlar a execução do serviço de atendimento em campo com conformidade SGI.",
    sequenceDescription: "1. Receber demanda. 2. Validar prontidão. 3. Deslocar. 4. Executar. 5. Registrar evidências.",
    executionCriteria: "Checklist 100% concluído, documento vigente e EPI disponível.",
    requiredResources: ["Equipe técnica (2 pessoas)", "Veículo operacional", "Kit de ferramentas"],
    inputs: ["Ordem de serviço aprovada", "Ficha do cliente"],
    outputs: ["Relatório de atendimento", "Evidência fotográfica", "Assinatura do cliente"],
    esgConsiderations: "Verificar requisitos ambientais do local. Usar EPI completo.",
    readinessBlockingEnabled: true,
    status: "active",
    documentIds: approvedDoc ? [approvedDoc.id] : [],
    riskOpportunityItemIds: firstRisk ? [firstRisk.id] : [],
    checklistItems: p1ChecklistItems,
  };

  const [plan1] = await db
    .insert(operationalPlansTable)
    .values({
      organizationId: orgId,
      title: "Atendimento em Campo — SGI",
      planCode: "OP-001",
      processId: p1ProcessId,
      unitId: p1UnitId,
      responsibleId: p1RespId,
      serviceType: "Operação assistida",
      scope: p1Snapshot.scope,
      sequenceDescription: p1Snapshot.sequenceDescription,
      executionCriteria: p1Snapshot.executionCriteria,
      requiredResources: p1Snapshot.requiredResources,
      inputs: p1Snapshot.inputs,
      outputs: p1Snapshot.outputs,
      esgConsiderations: p1Snapshot.esgConsiderations,
      readinessBlockingEnabled: true,
      status: "active",
      currentRevisionNumber: 1,
      createdById,
      updatedById: createdById,
    })
    .returning();

  await db.insert(operationalPlanRevisionsTable).values({
    planId: plan1.id,
    revisionNumber: 1,
    changeSummary: "Criação inicial do plano.",
    changedById: createdById,
    snapshot: p1Snapshot,
  });

  if (approvedDoc) {
    await db.insert(operationalPlanDocumentsTable).values({
      planId: plan1.id,
      documentId: approvedDoc.id,
    });
  }

  if (firstRisk) {
    await db.insert(operationalPlanRiskLinksTable).values({
      planId: plan1.id,
      riskOpportunityItemId: firstRisk.id,
    });
  }

  const [chk1, chk2, chk3] = await db
    .insert(operationalReadinessChecklistsTable)
    .values(p1ChecklistItems.map((item) => ({ planId: plan1.id, ...item })))
    .returning();

  // Cycle 1 — concluído
  const [cycle1] = await db
    .insert(operationalCycleEvidencesTable)
    .values({
      organizationId: orgId,
      planId: plan1.id,
      cycleCode: "CICLO-2026-01",
      cycleDate: new Date("2026-03-15"),
      status: "completed",
      evidenceSummary:
        "Atendimento realizado com sucesso. Checklist concluído antes da execução. " +
        "Cliente assinou o relatório de conclusão.",
      externalReference: "OS-7821",
      attachments: [],
      createdById,
      updatedById: createdById,
    })
    .returning();

  await db.insert(operationalReadinessExecutionsTable).values([
    {
      organizationId: orgId,
      cycleEvidenceId: cycle1.id,
      checklistItemId: chk1.id,
      status: "ok" as const,
      executedById: firstEmp?.id ?? null,
      executedAt: new Date("2026-03-15T07:30:00Z"),
      evidenceNote: "Todos os EPIs verificados e em condições de uso.",
      attachments: [],
    },
    {
      organizationId: orgId,
      cycleEvidenceId: cycle1.id,
      checklistItemId: chk2.id,
      status: "ok" as const,
      executedById: firstEmp?.id ?? null,
      executedAt: new Date("2026-03-15T07:32:00Z"),
      evidenceNote: "Procedimento OP-001 Rev.1 vigente confirmado.",
      attachments: [],
    },
    {
      organizationId: orgId,
      cycleEvidenceId: cycle1.id,
      checklistItemId: chk3.id,
      status: "ok" as const,
      executedById: firstEmp?.id ?? null,
      executedAt: new Date("2026-03-15T07:35:00Z"),
      evidenceNote: "Veículo inspecionado, combustível OK, pneus em boas condições.",
      attachments: [],
    },
  ]);

  // Cycle 2 — planejado com itens críticos pendentes (demonstra bloqueio)
  const [cycle2] = await db
    .insert(operationalCycleEvidencesTable)
    .values({
      organizationId: orgId,
      planId: plan1.id,
      cycleCode: "CICLO-2026-02",
      cycleDate: new Date("2026-04-20"),
      status: "planned",
      evidenceSummary: null,
      externalReference: "OS-8104",
      attachments: [],
      createdById,
      updatedById: createdById,
    })
    .returning();

  // Apenas o veículo inspecionado — EPI e Documento ainda pendentes (bloqueio ativo)
  await db.insert(operationalReadinessExecutionsTable).values({
    organizationId: orgId,
    cycleEvidenceId: cycle2.id,
    checklistItemId: chk3.id,
    status: "ok" as const,
    executedById: firstEmp?.id ?? null,
    executedAt: new Date("2026-04-20T08:00:00Z"),
    evidenceNote: "Veículo verificado.",
    attachments: [],
  });

  // Change record vinculado ao ciclo 1
  const [change1] = await db
    .insert(operationalChangesTable)
    .values({
      organizationId: orgId,
      planId: plan1.id,
      cycleEvidenceId: cycle1.id,
      title: "Substituição de rota por restrição de acesso",
      reason: "Cliente informou interdição da rota principal 2h antes do atendimento.",
      impactLevel: "high",
      impactDescription:
        "Acréscimo de 40 min no deslocamento e necessidade de revalidar disponibilidade da equipe.",
      mitigationAction:
        "Utilizou rota alternativa via BR-116. Equipe comunicada com 1h de antecedência. " +
        "Prontidão revalidada antes do novo deslocamento.",
      decision: "approved",
      requestedById: createdById,
      approvedById: createdById,
      approvedAt: new Date("2026-03-15T08:10:00Z"),
    })
    .returning();

  if (firstRisk) {
    await db.insert(operationalChangeRiskLinksTable).values({
      changeId: change1.id,
      riskOpportunityItemId: firstRisk.id,
    });
  }

  // ── Plan 2 — Instalação de Equipamentos ──────────────────────────────────
  console.log("Inserting: Instalação de Equipamentos Industriais...");

  const p2ProcessId = processId("instalação") ?? processId("manut");
  const p2UnitId    = unitId("norte") ?? unitId("produção");
  const p2RespId    = employeeId("pedro") ?? employeeId("carlos");

  const p2Snapshot: OperationalPlanRevisionSnapshot = {
    title: "Instalação de Equipamentos Industriais",
    planCode: "OP-002",
    processId: p2ProcessId ?? null,
    unitId: p2UnitId ?? null,
    responsibleId: p2RespId ?? null,
    serviceType: "Serviço especializado",
    scope: "Planejar e executar a instalação de equipamentos industriais com conformidade técnica.",
    sequenceDescription: "1. Conferir NF. 2. Inspecionar embalagem. 3. Posicionar. 4. Conectar e testar. 5. Emitir laudo.",
    executionCriteria: "Instalado conforme layout, testado em carga nominal e laudo assinado.",
    requiredResources: ["Técnico especializado", "Ferramental certificado", "Guindaste (quando necessário)"],
    inputs: ["Nota fiscal", "Manual do fabricante", "Layout aprovado"],
    outputs: ["Laudo de instalação", "Termo de aceite", "Registro fotográfico"],
    esgConsiderations: "Descartar embalagens conforme PGRS. Verificar NR-12 antes da energização.",
    readinessBlockingEnabled: true,
    status: "active",
    documentIds: [],
    riskOpportunityItemIds: [],
    checklistItems: [
      { title: "NR-12 verificada para o equipamento", instructions: "Confirmar dispositivos de proteção antes da energização.", isCritical: true,  sortOrder: 1 },
      { title: "Layout de instalação aprovado",       instructions: "Checar aprovação do responsável de engenharia.",           isCritical: true,  sortOrder: 2 },
      { title: "Ferramental certificado disponível",  instructions: "Verificar certificado de calibração das ferramentas.",     isCritical: false, sortOrder: 3 },
    ],
  };

  const [plan2] = await db
    .insert(operationalPlansTable)
    .values({
      organizationId: orgId,
      title: p2Snapshot.title,
      planCode: "OP-002",
      processId: p2ProcessId,
      unitId: p2UnitId,
      responsibleId: p2RespId,
      serviceType: p2Snapshot.serviceType,
      scope: p2Snapshot.scope,
      sequenceDescription: p2Snapshot.sequenceDescription,
      executionCriteria: p2Snapshot.executionCriteria,
      requiredResources: p2Snapshot.requiredResources,
      inputs: p2Snapshot.inputs,
      outputs: p2Snapshot.outputs,
      esgConsiderations: p2Snapshot.esgConsiderations,
      readinessBlockingEnabled: true,
      status: "active",
      currentRevisionNumber: 1,
      createdById,
      updatedById: createdById,
    })
    .returning();

  await db.insert(operationalPlanRevisionsTable).values({
    planId: plan2.id,
    revisionNumber: 1,
    changeSummary: "Criação inicial do plano.",
    changedById: createdById,
    snapshot: p2Snapshot,
  });

  await db
    .insert(operationalReadinessChecklistsTable)
    .values(p2Snapshot.checklistItems.map((item) => ({ planId: plan2.id, ...item })));

  // ── Plan 3 — Manutenção de Frota ─────────────────────────────────────────
  console.log("Inserting: Manutenção Preventiva de Frota...");

  const p3ProcessId = processId("manut") ?? processId("frota");
  const p3UnitId    = unitId("leste") ?? unitId("logística");
  const p3RespId    = employeeId("mariana") ?? employeeId("ana");

  const p3Snapshot: OperationalPlanRevisionSnapshot = {
    title: "Manutenção Preventiva de Frota",
    planCode: "OP-003",
    processId: p3ProcessId ?? null,
    unitId: p3UnitId ?? null,
    responsibleId: p3RespId ?? null,
    serviceType: "Manutenção",
    scope: "Planejar e executar manutenção preventiva periódica da frota operacional conforme plano de manutenção.",
    sequenceDescription: "1. Programar revisão. 2. Executar checklist. 3. Substituir itens de desgaste. 4. Registrar. 5. Liberar.",
    executionCriteria: "Todos os itens verificados e assinados. Sticker de próxima revisão afixado.",
    requiredResources: ["Mecânico habilitado", "Peças de reposição", "Fossa ou elevador"],
    inputs: ["Histórico de manutenção do veículo", "Plano de manutenção vigente"],
    outputs: ["Checklist assinado", "Nota de serviço", "Atualização do histórico"],
    esgConsiderations: "Descartar óleo lubrificante em coletores certificados.",
    readinessBlockingEnabled: false,
    status: "active",
    documentIds: [],
    riskOpportunityItemIds: [],
    checklistItems: [
      { title: "Veículo com quilometragem dentro do intervalo de revisão", instructions: null, isCritical: false, sortOrder: 1 },
      { title: "Peças de reposição disponíveis em estoque",               instructions: null, isCritical: false, sortOrder: 2 },
      { title: "Mecânico responsável identificado e disponível",          instructions: null, isCritical: true,  sortOrder: 3 },
    ],
  };

  const [plan3] = await db
    .insert(operationalPlansTable)
    .values({
      organizationId: orgId,
      title: p3Snapshot.title,
      planCode: "OP-003",
      processId: p3ProcessId,
      unitId: p3UnitId,
      responsibleId: p3RespId,
      serviceType: p3Snapshot.serviceType,
      scope: p3Snapshot.scope,
      sequenceDescription: p3Snapshot.sequenceDescription,
      executionCriteria: p3Snapshot.executionCriteria,
      requiredResources: p3Snapshot.requiredResources,
      inputs: p3Snapshot.inputs,
      outputs: p3Snapshot.outputs,
      esgConsiderations: p3Snapshot.esgConsiderations,
      readinessBlockingEnabled: false,
      status: "active",
      currentRevisionNumber: 1,
      createdById,
      updatedById: createdById,
    })
    .returning();

  await db.insert(operationalPlanRevisionsTable).values({
    planId: plan3.id,
    revisionNumber: 1,
    changeSummary: "Criação inicial do plano.",
    changedById: createdById,
    snapshot: p3Snapshot,
  });

  await db
    .insert(operationalReadinessChecklistsTable)
    .values(p3Snapshot.checklistItems.map((item) => ({ planId: plan3.id, ...item })));

  console.log("\n✓ Seed concluído:");
  console.log(`  OP-001 — Atendimento em Campo — SGI (2 ciclos, 1 mudança)`);
  console.log(`  OP-002 — Instalação de Equipamentos Industriais`);
  console.log(`  OP-003 — Manutenção Preventiva de Frota`);
}

seedOperationalPlanning().catch((err) => {
  console.error(err);
  process.exit(1);
});
