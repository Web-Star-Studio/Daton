/**
 * Assets seed — populates critical infrastructure assets for the demo organization.
 *
 * Idempotent: removes existing demo assets before re-inserting.
 * Run: pnpm --filter @workspace/scripts seed-assets
 */
import {
  db,
  organizationsTable,
  assetsTable,
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

  // ── Clean previous demo assets ───────────────────────────────────────────
  await db.delete(assetsTable).where(
    inArray(assetsTable.name, DEMO_ASSET_NAMES),
  );

  // ── Load units and employees to link ────────────────────────────────────
  const units = await db
    .select({ id: unitsTable.id, name: unitsTable.name })
    .from(unitsTable)
    .where(eq(unitsTable.organizationId, orgId));

  const employees = await db
    .select({ id: employeesTable.id, name: employeesTable.name })
    .from(employeesTable)
    .where(eq(employeesTable.organizationId, orgId));

  const unitId = (name: string) =>
    units.find((u) => u.name.toLowerCase().includes(name.toLowerCase()))?.id ?? units[0]?.id ?? null;

  const employeeId = (name: string) =>
    employees.find((e) => e.name.toLowerCase().includes(name.toLowerCase()))?.id ?? employees[0]?.id ?? null;

  // ── Seed ─────────────────────────────────────────────────────────────────
  const assets = [
    {
      organizationId: orgId,
      unitId: unitId("produção"),
      name: "Compressor de Ar CP-01",
      assetType: "Equipamento",
      criticality: "alta" as const,
      status: "ativo" as const,
      location: "Galpão A — Setor de Produção",
      impactedProcess: "Produção",
      responsibleId: employeeId("manutenção") ?? employeeId(""),
      description: "Compressor de ar industrial utilizado nas linhas de produção. Requer manutenção preventiva semestral.",
    },
    {
      organizationId: orgId,
      unitId: unitId("produção"),
      name: "Caldeira Industrial CB-01",
      assetType: "Equipamento",
      criticality: "alta" as const,
      status: "ativo" as const,
      location: "Casa de Caldeiras",
      impactedProcess: "Produção",
      responsibleId: employeeId("") ,
      description: "Caldeira a vapor para aquecimento do processo produtivo. NR-13 aplicável.",
    },
    {
      organizationId: orgId,
      unitId: unitId("logística") ?? unitId(""),
      name: "Veículo Operacional VH-01",
      assetType: "Veículo",
      criticality: "media" as const,
      status: "em_manutencao" as const,
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
      criticality: "media" as const,
      status: "ativo" as const,
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
      criticality: "alta" as const,
      status: "ativo" as const,
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
      criticality: "alta" as const,
      status: "ativo" as const,
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
      criticality: "alta" as const,
      status: "ativo" as const,
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
      criticality: "media" as const,
      status: "ativo" as const,
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
      criticality: "alta" as const,
      status: "inativo" as const,
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
      criticality: "baixa" as const,
      status: "ativo" as const,
      location: "Galpão A — Marcenaria",
      impactedProcess: "Produção",
      responsibleId: employeeId(""),
      description: "Serra fita para corte de madeira. NR-12 aplicável.",
    },
  ];

  await db.insert(assetsTable).values(assets);

  console.log(`✓ ${assets.length} ativos cadastrados para a organização #${orgId}`);
  if (units.length === 0) console.log("  ⚠ Nenhuma unidade encontrada — ativos criados sem vínculo de unidade.");
  if (employees.length === 0) console.log("  ⚠ Nenhum colaborador encontrado — ativos criados sem responsável.");

  process.exit(0);
}

seedAssets().catch((err) => {
  console.error(err);
  process.exit(1);
});
