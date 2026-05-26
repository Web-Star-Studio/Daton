// Seed regulatory documents into a specific organization (default: #3 Indústria Aurora Demo LTDA).
//
// Safe to re-run: wipes any existing regulatory documents for the target org
// before inserting the demo set. Skips entirely if the org has no units.
//
// Responsável is always a user (with login account) — see memory
// `responsavel-must-be-user`. We pick users from `users` table directly.
//
// Dates are computed relative to "today" so the demo always shows realistic
// status distribution (vencidos / a_vencer / vigentes) regardless of when the
// seed runs.

import { eq, count } from "drizzle-orm";
import {
  db,
  organizationsTable,
  unitsTable,
  usersTable,
  regulatoryDocumentsTable,
  regulatoryDocumentRenewalsTable,
} from "@workspace/db";

const ORG_ID = Number(process.argv[2] ?? 3);

async function pickUnit(name: string): Promise<number> {
  const rows = await db
    .select({ id: unitsTable.id, name: unitsTable.name })
    .from(unitsTable)
    .where(eq(unitsTable.organizationId, ORG_ID));
  const match = rows.find((u) => u.name.toLowerCase().includes(name.toLowerCase()));
  if (!match) throw new Error(`Filial "${name}" não encontrada na org #${ORG_ID}`);
  return match.id;
}

async function pickUser(matcher: string): Promise<number | null> {
  // Tries name first, then email, case-insensitive contains.
  const rows = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.organizationId, ORG_ID));
  const needle = matcher.toLowerCase();
  const match = rows.find((u) => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle));
  return match?.id ?? null;
}

function isoOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function statusFor(expirationOffsetDays: number, alertDays = 30): "vigente" | "a_vencer" | "vencido" {
  if (expirationOffsetDays < 0) return "vencido";
  if (expirationOffsetDays <= alertDays) return "a_vencer";
  return "vigente";
}

async function main() {
  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, ORG_ID));
  if (!org) throw new Error(`Org #${ORG_ID} não encontrada`);
  console.log(`\nSeed alvo: #${org.id} ${org.name}`);

  const [{ value: unitCount }] = await db
    .select({ value: count() })
    .from(unitsTable)
    .where(eq(unitsTable.organizationId, ORG_ID));
  if (unitCount === 0) {
    console.log("Org não tem filiais — abortando seed.");
    process.exit(0);
  }

  // --- Wipe existing regulatory docs for this org (idempotent reseed) ---
  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(regulatoryDocumentsTable)
    .where(eq(regulatoryDocumentsTable.organizationId, ORG_ID));

  if (existing > 0) {
    console.log(`Removendo ${existing} documento(s) regulatório(s) existente(s) (cascade nas renovações + anexos)...`);
    await db.delete(regulatoryDocumentsTable).where(eq(regulatoryDocumentsTable.organizationId, ORG_ID));
  }

  // --- Resolve filiais & users ---
  const sede = await pickUnit("Sede Principal");
  const rj = await pickUnit("Rio de Janeiro");
  const bh = await pickUnit("Belo Horizonte");

  // Demo identities: pick varied responsibles to exercise the alert routing.
  // datondemo gets the 3 docs that trigger alerts (1 vencido + 2 a vencer) so
  // logging in as datondemo shows the bell populated with 3 notifications.
  const carlos = await pickUser("Carlos");      // admin
  const ana = await pickUser("Ana Oliveira");   // operator
  const mariana = await pickUser("Mariana");    // operator
  const datondemo = await pickUser("datondemo"); // org_admin — the test login

  console.log(`Filiais: Sede=${sede}, RJ=${rj}, BH=${bh}`);
  console.log(`Responsáveis (users): Carlos=${carlos}, Ana=${ana}, Mariana=${mariana}, datondemo=${datondemo}`);

  // --- Documents (curated demo set) ---
  type DocDef = {
    unitId: number;
    identifierType: "licenca_ambiental" | "avcb" | "alvara" | "outorga" | "certidao" | "outro";
    documentNumber: string;
    issuingBody: string;
    processNumber?: string;
    responsibleUserId: number | null;
    issueOffsetDays: number;
    expirationOffsetDays: number;
    renewalRequired: boolean;
    notes?: string;
    explicitRenewals?: Array<{
      status: "nao_iniciado" | "em_andamento" | "protocolado" | "renovado" | "indeferido";
      scheduledStartOffsetDays?: number;
      protocolDeadlineOffsetDays?: number;
      protocolNumber?: string;
      newExpirationOffsetDays?: number;
      notes?: string;
    }>;
  };

  const definitions: DocDef[] = [
    {
      unitId: sede,
      identifierType: "avcb",
      documentNumber: "AVCB-2026-001",
      issuingBody: "CB-PMSP",
      processNumber: "CBPMSP-12345/2026",
      responsibleUserId: carlos,
      issueOffsetDays: -120,
      expirationOffsetDays: 240,
      renewalRequired: true,
      notes: "Vistoria realizada após reforma do galpão de estoque.",
    },
    {
      unitId: rj,
      identifierType: "avcb",
      documentNumber: "AVCB-2025-RJ-088",
      issuingBody: "CBMERJ",
      processNumber: "CBMERJ-2025-7841",
      responsibleUserId: datondemo, // ⚠️ alert-trigger
      issueOffsetDays: -340,
      expirationOffsetDays: 20,
      renewalRequired: true,
      notes: "Necessário iniciar processo de renovação com vistoria prévia.",
      explicitRenewals: [
        {
          status: "em_andamento",
          scheduledStartOffsetDays: -10,
          notes: "Engenheiro responsável agendado para vistoria preliminar.",
        },
      ],
    },
    {
      unitId: sede,
      identifierType: "licenca_ambiental",
      documentNumber: "LO-2026-1042",
      issuingBody: "CETESB",
      processNumber: "CETESB-2026-001042",
      responsibleUserId: carlos,
      issueOffsetDays: -180,
      expirationOffsetDays: 365,
      renewalRequired: true,
      notes: "Licença de Operação renovada após apresentação do PGRS.",
      explicitRenewals: [
        {
          status: "renovado",
          scheduledStartOffsetDays: -240,
          protocolDeadlineOffsetDays: -200,
          protocolNumber: "CETESB-PROT-2025-9981",
          newExpirationOffsetDays: 365,
          notes: "Renovação aprovada com PGRS atualizado.",
        },
      ],
    },
    {
      unitId: bh,
      identifierType: "alvara",
      documentNumber: "ALV-BH-2024-3321",
      issuingBody: "Prefeitura de Belo Horizonte",
      processNumber: "PBH-2024-33214",
      responsibleUserId: datondemo, // ⚠️ alert-trigger (vencido)
      issueOffsetDays: -380,
      expirationOffsetDays: -15,
      renewalRequired: true,
      notes: "URGENTE: alvará expirado, processo de renovação protocolado.",
      explicitRenewals: [
        {
          status: "protocolado",
          scheduledStartOffsetDays: -45,
          protocolDeadlineOffsetDays: 15,
          protocolNumber: "PBH-PROT-2026-00871",
          notes: "Aguardando análise técnica da prefeitura.",
        },
      ],
    },
    {
      unitId: sede,
      identifierType: "alvara",
      documentNumber: "ALV-SP-2025-9981",
      issuingBody: "Prefeitura de São Paulo",
      processNumber: "PMSP-2025-99812",
      responsibleUserId: mariana,
      issueOffsetDays: -180,
      expirationOffsetDays: 180,
      renewalRequired: true,
    },
    {
      unitId: sede,
      identifierType: "certidao",
      documentNumber: "CND-2026-0712",
      issuingBody: "Receita Federal",
      responsibleUserId: datondemo, // ⚠️ alert-trigger
      issueOffsetDays: -170,
      expirationOffsetDays: 10,
      renewalRequired: true,
      notes: "Certidão Negativa de Débitos — renovação trimestral.",
    },
    {
      unitId: rj,
      identifierType: "outorga",
      documentNumber: "OUT-RJ-2025-114",
      issuingBody: "INEA",
      processNumber: "INEA-OUT-2025-00114",
      responsibleUserId: ana,
      issueOffsetDays: -120,
      expirationOffsetDays: 365,
      renewalRequired: true,
      notes: "Outorga de captação de água superficial — Rio Paraíba do Sul.",
    },
  ];

  const summary = { vigente: 0, a_vencer: 0, vencido: 0 };
  for (const def of definitions) {
    const expirationDate = isoOffset(def.expirationOffsetDays);
    const issueDate = isoOffset(def.issueOffsetDays);
    const status = statusFor(def.expirationOffsetDays);
    summary[status] += 1;

    const [doc] = await db
      .insert(regulatoryDocumentsTable)
      .values({
        organizationId: ORG_ID,
        unitId: def.unitId,
        identifierType: def.identifierType,
        documentNumber: def.documentNumber,
        issuingBody: def.issuingBody,
        processNumber: def.processNumber ?? null,
        responsibleUserId: def.responsibleUserId,
        issueDate,
        expirationDate,
        renewalRequired: def.renewalRequired,
        status,
        notes: def.notes ?? null,
      })
      .returning();

    if (def.explicitRenewals && def.explicitRenewals.length > 0) {
      for (const r of def.explicitRenewals) {
        await db.insert(regulatoryDocumentRenewalsTable).values({
          organizationId: ORG_ID,
          documentId: doc.id,
          status: r.status,
          scheduledStartDate: r.scheduledStartOffsetDays != null ? isoOffset(r.scheduledStartOffsetDays) : null,
          protocolDeadline: r.protocolDeadlineOffsetDays != null ? isoOffset(r.protocolDeadlineOffsetDays) : null,
          protocolNumber: r.protocolNumber ?? null,
          newExpirationDate: r.newExpirationOffsetDays != null ? isoOffset(r.newExpirationOffsetDays) : null,
          notes: r.notes ?? null,
          recordedByUserId: def.responsibleUserId,
        });
      }
    } else if (def.renewalRequired) {
      await db.insert(regulatoryDocumentRenewalsTable).values({
        organizationId: ORG_ID,
        documentId: doc.id,
        status: "nao_iniciado",
        scheduledStartDate: isoOffset(def.expirationOffsetDays - 60),
      });
    }
  }

  console.log(`\n✅ Inseridos ${definitions.length} documentos regulatórios.`);
  console.log(`   Vigentes: ${summary.vigente} · A vencer: ${summary.a_vencer} · Vencidos: ${summary.vencido}`);
  console.log();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
