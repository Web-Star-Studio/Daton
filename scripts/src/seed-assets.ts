/**
 * Assets seed — populates assets, maintenance plans, maintenance records,
 * measurement resources, calibrations, and work environment controls
 * for the demo organization (C1–C4 stories).
 *
 * Idempotent: cleans previous demo data before re-inserting.
 * Run: pnpm --filter @workspace/scripts seed-assets
 */
import {
  db,
  organizationsTable,
  assetsTable,
  assetMaintenancePlansTable,
  assetMaintenanceRecordsTable,
  measurementResourcesTable,
  measurementResourceCalibrationsTable,
  workEnvironmentControlsTable,
  workEnvironmentVerificationsTable,
  unitsTable,
  employeesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const DEMO_ORGANIZATION_LEGAL_IDENTIFIER = "12.345.678/0001-90";

const DEMO_ASSET_NAMES = [
  "Compressor de Ar CP-01",
  "Caldeira Industrial CB-01",
  "Veículo Operacional VH-01",
  "Sistema de CFTV",
  "Gerador de Emergência GE-01",
  "Balança de Precisão BP-01",
  "Ar Condicionado Sala de Servidores",
  "Empilhadeira EL-01",
  "Câmara Frigorífica CF-01",
  "Serra Fita SF-01",
];

const DEMO_MEASUREMENT_RESOURCE_NAMES = [
  "Paquímetro Digital PAQ-01",
  "Termômetro de Precisão TMP-01",
  "Manômetro MAN-01",
  "Balança Analítica BAL-02",
  "Multímetro Digital MUL-01",
];

const DEMO_WORK_ENVIRONMENT_TITLES = [
  "Controle de Ruído — Galpão de Produção",
  "Iluminação — Área de Montagem",
  "Temperatura e Umidade — Laboratório",
  "Ergonomia — Estações Administrativas",
  "Qualidade do Ar — Pintura",
];

async function seedAssets() {
  // ── Locate demo org ──────────────────────────────────────────────────────
  const [org] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.legalIdentifier, DEMO_ORGANIZATION_LEGAL_IDENTIFIER));

  if (!org) {
    console.error("Demo organization not found. Run `pnpm --filter @workspace/scripts seed` first.");
    process.exit(1);
  }

  const orgId = org.id;

  // ── Load units and employees ─────────────────────────────────────────────
  const units = await db
    .select({ id: unitsTable.id, name: unitsTable.name })
    .from(unitsTable)
    .where(eq(unitsTable.organizationId, orgId));

  const employees = await db
    .select({ id: employeesTable.id, name: employeesTable.name })
    .from(employeesTable)
    .where(eq(employeesTable.organizationId, orgId));

  const unitId = (hint: string) =>
    units.find((u) => u.name.toLowerCase().includes(hint.toLowerCase()))?.id ??
    units[0]?.id ??
    null;

  const employeeId = (hint: string) =>
    employees.find((e) => e.name.toLowerCase().includes(hint.toLowerCase()))?.id ??
    employees[0]?.id ??
    null;

  // ── Clean previous demo data (order matters for FK cascades) ─────────────
  // Maintenance records and calibrations cascade via plan/resource deletes.
  // asset_maintenance_plans → cascade deletes records
  // assets → cascade deletes plans + records
  // measurement_resources → cascade deletes calibrations
  // work_environment_controls → cascade deletes verifications

  const existingAssets = await db
    .select({ id: assetsTable.id })
    .from(assetsTable)
    .where(inArray(assetsTable.name, DEMO_ASSET_NAMES));

  if (existingAssets.length > 0) {
    await db.delete(assetsTable).where(inArray(assetsTable.name, DEMO_ASSET_NAMES));
  }

  const existingResources = await db
    .select({ id: measurementResourcesTable.id })
    .from(measurementResourcesTable)
    .where(inArray(measurementResourcesTable.name, DEMO_MEASUREMENT_RESOURCE_NAMES));

  if (existingResources.length > 0) {
    await db.delete(measurementResourcesTable).where(
      inArray(measurementResourcesTable.name, DEMO_MEASUREMENT_RESOURCE_NAMES),
    );
  }

  const existingControls = await db
    .select({ id: workEnvironmentControlsTable.id })
    .from(workEnvironmentControlsTable)
    .where(inArray(workEnvironmentControlsTable.title, DEMO_WORK_ENVIRONMENT_TITLES));

  if (existingControls.length > 0) {
    await db.delete(workEnvironmentControlsTable).where(
      inArray(workEnvironmentControlsTable.title, DEMO_WORK_ENVIRONMENT_TITLES),
    );
  }

  // ── 1. Assets (C1) ───────────────────────────────────────────────────────
  const insertedAssets = await db
    .insert(assetsTable)
    .values([
      {
        organizationId: orgId,
        unitId: unitId("produção"),
        name: "Compressor de Ar CP-01",
        assetType: "Equipamento",
        criticality: "alta",
        status: "ativo",
        location: "Galpão A — Setor de Produção",
        impactedProcess: "Produção",
        responsibleId: employeeId("manutenção"),
        description: "Compressor de ar industrial utilizado nas linhas de produção. Requer manutenção preventiva semestral.",
      },
      {
        organizationId: orgId,
        unitId: unitId("produção"),
        name: "Caldeira Industrial CB-01",
        assetType: "Equipamento",
        criticality: "alta",
        status: "ativo",
        location: "Casa de Caldeiras",
        impactedProcess: "Produção",
        responsibleId: employeeId(""),
        description: "Caldeira a vapor para aquecimento do processo produtivo. NR-13 aplicável.",
      },
      {
        organizationId: orgId,
        unitId: unitId("logística") ?? unitId(""),
        name: "Veículo Operacional VH-01",
        assetType: "Veículo",
        criticality: "media",
        status: "em_manutencao",
        location: "Pátio de Veículos",
        impactedProcess: "Logística",
        responsibleId: employeeId(""),
        description: "Caminhão leve utilizado para entregas internas e coleta de materiais.",
      },
      {
        organizationId: orgId,
        unitId: unitId("segurança") ?? unitId(""),
        name: "Sistema de CFTV",
        assetType: "Segurança",
        criticality: "media",
        status: "ativo",
        location: "Toda a unidade",
        impactedProcess: "Segurança Patrimonial",
        responsibleId: employeeId(""),
        description: "Sistema de câmeras de segurança com gravação em nuvem e retenção de 30 dias.",
      },
      {
        organizationId: orgId,
        unitId: unitId(""),
        name: "Gerador de Emergência GE-01",
        assetType: "Infraestrutura",
        criticality: "alta",
        status: "ativo",
        location: "Área Técnica Externa",
        impactedProcess: "Continuidade Operacional",
        responsibleId: employeeId(""),
        description: "Gerador a diesel com autonomia de 8 horas. Acionado automaticamente em caso de falta de energia.",
      },
      {
        organizationId: orgId,
        unitId: unitId("qualidade") ?? unitId(""),
        name: "Balança de Precisão BP-01",
        assetType: "Instrumento de Medição",
        criticality: "alta",
        status: "ativo",
        location: "Laboratório de Qualidade",
        impactedProcess: "Controle de Qualidade",
        responsibleId: employeeId("qualidade") ?? employeeId(""),
        description: "Balança analítica com resolução de 0,001g. Calibração anual obrigatória. Certificado RBC.",
      },
      {
        organizationId: orgId,
        unitId: unitId("ti") ?? unitId(""),
        name: "Ar Condicionado Sala de Servidores",
        assetType: "Infraestrutura",
        criticality: "alta",
        status: "ativo",
        location: "Sala de TI",
        impactedProcess: "Tecnologia da Informação",
        responsibleId: employeeId("ti") ?? employeeId(""),
        description: "Sistema de climatização de precisão para sala de servidores. Operação contínua 24h.",
      },
      {
        organizationId: orgId,
        unitId: unitId("produção"),
        name: "Empilhadeira EL-01",
        assetType: "Veículo",
        criticality: "media",
        status: "ativo",
        location: "Galpão de Estoque",
        impactedProcess: "Movimentação de Materiais",
        responsibleId: employeeId(""),
        description: "Empilhadeira elétrica com capacidade de 2 toneladas. Manutenção preventiva trimestral.",
      },
      {
        organizationId: orgId,
        unitId: unitId("produção"),
        name: "Câmara Frigorífica CF-01",
        assetType: "Equipamento",
        criticality: "alta",
        status: "inativo",
        location: "Área de Armazenamento — Bloco B",
        impactedProcess: "Armazenamento de Insumos",
        responsibleId: employeeId(""),
        description: "Câmara fria para armazenamento de insumos perecíveis. Atualmente desativada para reforma.",
      },
      {
        organizationId: orgId,
        unitId: unitId("produção"),
        name: "Serra Fita SF-01",
        assetType: "Máquina",
        criticality: "baixa",
        status: "ativo",
        location: "Galpão A — Marcenaria",
        impactedProcess: "Produção",
        responsibleId: employeeId(""),
        description: "Serra fita para corte de madeira. NR-12 aplicável.",
      },
    ])
    .returning({ id: assetsTable.id, name: assetsTable.name });

  console.log(`✓ ${insertedAssets.length} ativos inseridos`);

  const assetByName = (name: string) => insertedAssets.find((a) => a.name === name);

  // ── 2. Maintenance Plans (C2) ────────────────────────────────────────────
  const today = new Date();
  const daysFromNow = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
  };
  const daysAgo = (n: number) => daysFromNow(-n);

  const compressorId = assetByName("Compressor de Ar CP-01")?.id;
  const caldeiraId = assetByName("Caldeira Industrial CB-01")?.id;
  const veiculoId = assetByName("Veículo Operacional VH-01")?.id;
  const empilhadeiraId = assetByName("Empilhadeira EL-01")?.id;
  const geradorId = assetByName("Gerador de Emergência GE-01")?.id;

  const plansToInsert = [];

  if (compressorId) {
    plansToInsert.push(
      {
        organizationId: orgId,
        assetId: compressorId,
        title: "Troca de filtro de ar",
        type: "preventiva",
        periodicity: "mensal",
        checklistItems: [
          "Desligar compressor e aguardar despressurização",
          "Remover e inspecionar filtro atual",
          "Instalar novo filtro",
          "Verificar vedações e conexões",
          "Religar e testar funcionamento",
        ],
        responsibleId: employeeId("manutenção"),
        nextDueAt: daysFromNow(5),
        originalNextDueAt: daysFromNow(5),
        isActive: true,
      },
      {
        organizationId: orgId,
        assetId: compressorId,
        title: "Revisão geral semestral",
        type: "preventiva",
        periodicity: "semestral",
        checklistItems: [
          "Verificar nível de óleo",
          "Inspecionar correias e tensores",
          "Limpar condensador",
          "Testar válvula de segurança",
          "Verificar pressão de trabalho",
          "Lubrificar rolamentos",
        ],
        responsibleId: employeeId("manutenção"),
        nextDueAt: daysFromNow(45),
        originalNextDueAt: daysFromNow(45),
        isActive: true,
      },
    );
  }

  if (caldeiraId) {
    plansToInsert.push({
      organizationId: orgId,
      assetId: caldeiraId,
      title: "Inspeção NR-13 anual",
      type: "inspecao",
      periodicity: "anual",
      checklistItems: [
        "Inspeção visual interna e externa",
        "Teste hidrostático",
        "Verificar válvulas de segurança",
        "Checar dispositivos de controle",
        "Emitir laudo técnico",
      ],
      responsibleId: employeeId(""),
      nextDueAt: daysFromNow(90),
      originalNextDueAt: daysFromNow(90),
      isActive: true,
    });
  }

  if (veiculoId) {
    plansToInsert.push(
      {
        organizationId: orgId,
        assetId: veiculoId,
        title: "Revisão preventiva — troca de óleo",
        type: "preventiva",
        periodicity: "trimestral",
        checklistItems: [
          "Trocar óleo do motor",
          "Trocar filtro de óleo",
          "Verificar nível de fluidos",
          "Inspecionar pneus",
          "Verificar sistema de freios",
        ],
        responsibleId: employeeId(""),
        nextDueAt: daysFromNow(-3),
        originalNextDueAt: daysFromNow(-3),
        isActive: true,
      },
      {
        organizationId: orgId,
        assetId: veiculoId,
        title: "Correção — barulho na suspensão",
        type: "corretiva",
        periodicity: "unica",
        checklistItems: [
          "Diagnosticar origem do barulho",
          "Substituir amortecedores dianteiros",
          "Testar após reparo",
        ],
        responsibleId: employeeId(""),
        nextDueAt: daysFromNow(2),
        originalNextDueAt: daysFromNow(2),
        isActive: true,
      },
    );
  }

  if (empilhadeiraId) {
    plansToInsert.push({
      organizationId: orgId,
      assetId: empilhadeiraId,
      title: "Manutenção preventiva trimestral",
      type: "preventiva",
      periodicity: "trimestral",
      checklistItems: [
        "Verificar carga da bateria",
        "Lubrificar garfos e mastro",
        "Checar sistema hidráulico",
        "Inspecionar pneus",
        "Testar freios e buzina",
      ],
      responsibleId: employeeId(""),
      nextDueAt: daysFromNow(20),
      originalNextDueAt: daysFromNow(20),
      isActive: true,
    });
  }

  if (geradorId) {
    plansToInsert.push({
      organizationId: orgId,
      assetId: geradorId,
      title: "Teste de acionamento mensal",
      type: "inspecao",
      periodicity: "mensal",
      checklistItems: [
        "Verificar nível de combustível",
        "Acionar gerador em modo teste",
        "Verificar tensão e frequência de saída",
        "Registrar tempo de partida",
        "Verificar sistema de arrefecimento",
      ],
      responsibleId: employeeId(""),
      nextDueAt: daysFromNow(12),
      originalNextDueAt: daysFromNow(12),
      isActive: true,
    });
  }

  const insertedPlans = plansToInsert.length > 0
    ? await db.insert(assetMaintenancePlansTable).values(plansToInsert).returning({
        id: assetMaintenancePlansTable.id,
        assetId: assetMaintenancePlansTable.assetId,
        title: assetMaintenancePlansTable.title,
      })
    : [];

  console.log(`✓ ${insertedPlans.length} planos de manutenção inseridos`);

  // ── 3. Maintenance Records (C2) ──────────────────────────────────────────
  const recordsToInsert = [];

  // Compressor — completed past executions for the filter-change plan
  const filtroPlano = insertedPlans.find((p) => p.title === "Troca de filtro de ar");
  if (filtroPlano) {
    recordsToInsert.push(
      {
        organizationId: orgId,
        planId: filtroPlano.id,
        assetId: filtroPlano.assetId,
        executedAt: new Date(daysAgo(35)),
        executedById: employeeId("manutenção"),
        status: "concluida" as const,
        notes: "Filtro substituído sem intercorrências. Próxima troca programada conforme plano.",
      },
      {
        organizationId: orgId,
        planId: filtroPlano.id,
        assetId: filtroPlano.assetId,
        executedAt: new Date(daysAgo(65)),
        executedById: employeeId("manutenção"),
        status: "concluida" as const,
        notes: "Filtro com acúmulo elevado de particulados. Avaliada necessidade de troca mais frequente.",
      },
      {
        organizationId: orgId,
        planId: filtroPlano.id,
        assetId: filtroPlano.assetId,
        executedAt: new Date(daysAgo(95)),
        executedById: employeeId(""),
        status: "parcial" as const,
        notes: "Troca realizada parcialmente — filtro secundário em falta no estoque. Pedido de compra emitido.",
      },
    );
  }

  // Caldeira — inspeção realizada com sucesso
  const inspNr13 = insertedPlans.find((p) => p.title === "Inspeção NR-13 anual");
  if (inspNr13) {
    recordsToInsert.push({
      organizationId: orgId,
      planId: inspNr13.id,
      assetId: inspNr13.assetId,
      executedAt: new Date(daysAgo(280)),
      executedById: employeeId(""),
      status: "concluida" as const,
      notes: "Laudo técnico emitido. Nenhuma não-conformidade identificada. Válido por 12 meses.",
    });
  }

  // Veículo — troca de óleo realizada; corretiva ainda em aberto (sem registro)
  const trocaOleo = insertedPlans.find((p) => p.title === "Revisão preventiva — troca de óleo");
  if (trocaOleo) {
    recordsToInsert.push({
      organizationId: orgId,
      planId: trocaOleo.id,
      assetId: trocaOleo.assetId,
      executedAt: new Date(daysAgo(95)),
      executedById: employeeId(""),
      status: "concluida" as const,
      notes: "Troca de óleo 10W40 realizada. Filtro substituído. Pneus com desgaste dentro do limite.",
    });
  }

  // Gerador — teste mensal registrado
  const testeGerador = insertedPlans.find((p) => p.title === "Teste de acionamento mensal");
  if (testeGerador) {
    recordsToInsert.push(
      {
        organizationId: orgId,
        planId: testeGerador.id,
        assetId: testeGerador.assetId,
        executedAt: new Date(daysAgo(18)),
        executedById: employeeId(""),
        status: "concluida" as const,
        notes: "Partida em 8 segundos. Tensão 220V estável. Combustível em 70% do tanque.",
      },
      {
        organizationId: orgId,
        planId: testeGerador.id,
        assetId: testeGerador.assetId,
        executedAt: new Date(daysAgo(48)),
        executedById: employeeId(""),
        status: "concluida" as const,
        notes: "Partida em 10 segundos. Tensão estável. Solicitada revisão do sistema de arrefecimento.",
      },
    );
  }

  if (recordsToInsert.length > 0) {
    await db.insert(assetMaintenanceRecordsTable).values(recordsToInsert);
  }

  console.log(`✓ ${recordsToInsert.length} registros de execução de manutenção inseridos`);

  // ── 4. Measurement Resources + Calibrations (C3) ────────────────────────
  const insertedResources = await db
    .insert(measurementResourcesTable)
    .values([
      {
        organizationId: orgId,
        unitId: unitId("qualidade") ?? unitId(""),
        name: "Paquímetro Digital PAQ-01",
        identifier: "PAT-2021-0041",
        resourceType: "instrumento",
        responsibleId: employeeId("qualidade") ?? employeeId(""),
        validUntil: daysFromNow(180),
        status: "ativo",
        notes: "Paquímetro digital com resolução 0,01mm. Certificado IMETRO vigente.",
      },
      {
        organizationId: orgId,
        unitId: unitId("qualidade") ?? unitId(""),
        name: "Termômetro de Precisão TMP-01",
        identifier: "PAT-2019-0017",
        resourceType: "instrumento",
        responsibleId: employeeId("qualidade") ?? employeeId(""),
        validUntil: daysFromNow(-15),
        status: "vencido",
        notes: "Calibração vencida. Aguardando laboratório credenciado para recalibração.",
      },
      {
        organizationId: orgId,
        unitId: unitId("produção"),
        name: "Manômetro MAN-01",
        identifier: "PAT-2020-0089",
        resourceType: "instrumento",
        responsibleId: employeeId("manutenção"),
        validUntil: daysFromNow(60),
        status: "ativo",
        notes: "Instalado no compressor CP-01. Escala 0-16 bar.",
      },
      {
        organizationId: orgId,
        unitId: unitId("qualidade") ?? unitId(""),
        name: "Balança Analítica BAL-02",
        identifier: "PAT-2022-0003",
        resourceType: "equipamento",
        responsibleId: employeeId("qualidade") ?? employeeId(""),
        validUntil: daysFromNow(270),
        status: "ativo",
        notes: "Resolução 0,0001g. Certificado RBC. Laboratório de referência: IPT-SP.",
      },
      {
        organizationId: orgId,
        unitId: unitId("ti") ?? unitId(""),
        name: "Multímetro Digital MUL-01",
        identifier: "PAT-2023-0055",
        resourceType: "instrumento",
        responsibleId: employeeId("ti") ?? employeeId(""),
        validUntil: daysFromNow(120),
        status: "ativo",
        notes: "Categoria CAT III 600V. Utilizado em verificações elétricas.",
      },
    ])
    .returning({ id: measurementResourcesTable.id, name: measurementResourcesTable.name });

  console.log(`✓ ${insertedResources.length} recursos de medição inseridos`);

  const resourceByName = (name: string) => insertedResources.find((r) => r.name === name);

  // Calibrations
  const calibrationsToInsert = [];

  const paquimetro = resourceByName("Paquímetro Digital PAQ-01");
  if (paquimetro) {
    calibrationsToInsert.push(
      {
        organizationId: orgId,
        resourceId: paquimetro.id,
        calibratedAt: daysAgo(185),
        calibratedById: employeeId("qualidade") ?? employeeId(""),
        certificateNumber: "RBC-2024-08-00412",
        result: "apto" as const,
        nextDueAt: daysFromNow(180),
        notes: "Dentro dos limites de erro máximo permissível.",
      },
      {
        organizationId: orgId,
        resourceId: paquimetro.id,
        calibratedAt: daysAgo(550),
        calibratedById: employeeId("qualidade") ?? employeeId(""),
        certificateNumber: "RBC-2023-07-00287",
        result: "apto" as const,
        nextDueAt: daysAgo(185),
        notes: "Calibração anterior — aprovada.",
      },
    );
  }

  const termometro = resourceByName("Termômetro de Precisão TMP-01");
  if (termometro) {
    calibrationsToInsert.push({
      organizationId: orgId,
      resourceId: termometro.id,
      calibratedAt: daysAgo(380),
      calibratedById: employeeId("qualidade") ?? employeeId(""),
      certificateNumber: "CAL-2023-06-00198",
      result: "apto" as const,
      nextDueAt: daysAgo(15),
      notes: "Aprovado na última calibração. Calibração atual vencida.",
    });
  }

  const manometro = resourceByName("Manômetro MAN-01");
  if (manometro) {
    calibrationsToInsert.push({
      organizationId: orgId,
      resourceId: manometro.id,
      calibratedAt: daysAgo(305),
      calibratedById: employeeId(""),
      certificateNumber: "CAL-2024-06-00099",
      result: "apto" as const,
      nextDueAt: daysFromNow(60),
      notes: "Sem desvios. Próxima calibração em 1 ano.",
    });
  }

  const balanca = resourceByName("Balança Analítica BAL-02");
  if (balanca) {
    calibrationsToInsert.push(
      {
        organizationId: orgId,
        resourceId: balanca.id,
        calibratedAt: daysAgo(95),
        calibratedById: employeeId("qualidade") ?? employeeId(""),
        certificateNumber: "RBC-2025-01-00504",
        result: "apto" as const,
        nextDueAt: daysFromNow(270),
        notes: "Aprovada. Desvio máximo de 0,2mg — dentro do critério de aceitação.",
      },
    );
  }

  if (calibrationsToInsert.length > 0) {
    await db.insert(measurementResourceCalibrationsTable).values(calibrationsToInsert);
  }

  console.log(`✓ ${calibrationsToInsert.length} calibrações inseridas`);

  // ── 5. Work Environment Controls + Verifications (C4) ───────────────────
  const insertedControls = await db
    .insert(workEnvironmentControlsTable)
    .values([
      {
        organizationId: orgId,
        unitId: unitId("produção"),
        factorType: "fisico",
        title: "Controle de Ruído — Galpão de Produção",
        description: "Monitoramento do nível de pressão sonora no galpão principal. Limite: 85 dB(A) para jornada de 8h conforme NR-15.",
        responsibleId: employeeId("segurança") ?? employeeId(""),
        frequency: "trimestral",
        status: "ativo",
      },
      {
        organizationId: orgId,
        unitId: unitId("produção"),
        factorType: "fisico",
        title: "Iluminação — Área de Montagem",
        description: "Verificação da iluminância mínima na área de montagem. Padrão: ≥500 lux conforme NBR 5413.",
        responsibleId: employeeId(""),
        frequency: "semestral",
        status: "ativo",
      },
      {
        organizationId: orgId,
        unitId: unitId("qualidade") ?? unitId(""),
        factorType: "fisico",
        title: "Temperatura e Umidade — Laboratório",
        description: "Monitoramento de temperatura (20–25°C) e umidade relativa (45–65%) no laboratório de qualidade para garantir condições metrológicas.",
        responsibleId: employeeId("qualidade") ?? employeeId(""),
        frequency: "mensal",
        status: "ativo",
      },
      {
        organizationId: orgId,
        unitId: unitId(""),
        factorType: "psicologico",
        title: "Ergonomia — Estações Administrativas",
        description: "Avaliação de postura, mobiliário e organização das estações de trabalho administrativas conforme NR-17.",
        responsibleId: employeeId(""),
        frequency: "anual",
        status: "ativo",
      },
      {
        organizationId: orgId,
        unitId: unitId("produção"),
        factorType: "fisico",
        title: "Qualidade do Ar — Pintura",
        description: "Monitoramento de COVs e partículas na área de pintura. Controle de EPC (exaustão) e EPI (respiradores).",
        responsibleId: employeeId("segurança") ?? employeeId(""),
        frequency: "mensal",
        status: "ativo",
      },
    ])
    .returning({ id: workEnvironmentControlsTable.id, title: workEnvironmentControlsTable.title });

  console.log(`✓ ${insertedControls.length} controles de ambiente de trabalho inseridos`);

  // Verifications
  const verificationsToInsert = [];

  const ruido = insertedControls.find((c) => c.title.includes("Ruído"));
  if (ruido) {
    verificationsToInsert.push(
      {
        organizationId: orgId,
        controlId: ruido.id,
        verifiedAt: new Date(daysAgo(10)),
        verifiedById: employeeId("segurança") ?? employeeId(""),
        result: "adequado" as const,
        notes: "Medição com dosímetro: 82 dB(A) — dentro do limite.",
        actionTaken: null,
      },
      {
        organizationId: orgId,
        controlId: ruido.id,
        verifiedAt: new Date(daysAgo(100)),
        verifiedById: employeeId("segurança") ?? employeeId(""),
        result: "inadequado" as const,
        notes: "Medição: 88 dB(A) — acima do limite. Serra fita com proteção acústica danificada.",
        actionTaken: "Substituída a proteção acústica da serra fita SF-01. Fornecido protetor auricular adicional.",
      },
    );
  }

  const temp = insertedControls.find((c) => c.title.includes("Temperatura"));
  if (temp) {
    verificationsToInsert.push(
      {
        organizationId: orgId,
        controlId: temp.id,
        verifiedAt: new Date(daysAgo(5)),
        verifiedById: employeeId("qualidade") ?? employeeId(""),
        result: "adequado" as const,
        notes: "Temperatura: 22°C, Umidade: 55%. Dentro dos parâmetros.",
        actionTaken: null,
      },
      {
        organizationId: orgId,
        controlId: temp.id,
        verifiedAt: new Date(daysAgo(35)),
        verifiedById: employeeId("qualidade") ?? employeeId(""),
        result: "parcial" as const,
        notes: "Temperatura adequada (23°C) mas umidade em 68% — ligeiramente acima. Desumidificador acionado.",
        actionTaken: "Desumidificador portátil alocado no laboratório. Verificação extraordinária em 7 dias.",
      },
    );
  }

  const ar = insertedControls.find((c) => c.title.includes("Ar —"));
  if (ar) {
    verificationsToInsert.push({
      organizationId: orgId,
      controlId: ar.id,
      verifiedAt: new Date(daysAgo(20)),
      verifiedById: employeeId("segurança") ?? employeeId(""),
      result: "adequado" as const,
      notes: "Exaustão em funcionamento. EPIs verificados e em conformidade.",
      actionTaken: null,
    });
  }

  if (verificationsToInsert.length > 0) {
    await db.insert(workEnvironmentVerificationsTable).values(verificationsToInsert);
  }

  console.log(`✓ ${verificationsToInsert.length} verificações de ambiente inseridas`);

  // ── Summary ──────────────────────────────────────────────────────────────
  if (units.length === 0) console.warn("  ⚠ Nenhuma unidade encontrada — dados criados sem vínculo de unidade.");
  if (employees.length === 0) console.warn("  ⚠ Nenhum colaborador encontrado — dados criados sem responsável.");

  console.log("\nSeed de ativos concluído.");
  process.exit(0);
}

seedAssets().catch((err) => {
  console.error(err);
  process.exit(1);
});
