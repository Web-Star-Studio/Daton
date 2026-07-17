/**
 * Correção de coerência da organização de demonstração.
 *
 * Auditoria de 97 telas (17/07/2026) encontrou 72 que abrem vazias ou pobres para
 * o usuário da demo. Consolidadas em 8 causas raiz — todas de DADO, nenhuma de
 * código. Este script corrige as 8, em transação, escopado a UMA organização.
 *
 * A causa 0 é a mais séria e não é estética: 36 indicadores da demo carregavam
 * nomes de filiais REAIS de um cliente de produção (o seed de KPI tem os
 * indicadores dele hardcoded). Apresentar isso a um prospect expõe a malha de
 * plantas e os índices de acidente do cliente atual.
 *
 * `--org-id` é obrigatório, sem fallback. Roda em transação: ou aplica tudo, ou
 * nada. Idempotente onde é possível sê-lo.
 *
 * Uso: pnpm --filter @workspace/scripts fix-demo-org --org-id 3
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  db,
  pool,
  organizationsTable,
  usersTable,
  unitsTable,
  kpiIndicatorsTable,
  actionPlansTable,
  nonconformitiesTable,
  correctiveActionsTable,
  regulatoryDocumentsTable,
  documentsTable,
  strategicPlansTable,
  swotFactorsTable,
  roadSafetyFactorsTable,
  assetMaintenancePlansTable,
} from "@workspace/db";

const NOW = new Date();
const iso = (d: Date): string => d.toISOString().slice(0, 10);
/** Colunas `date` do Drizzle recebem string "YYYY-MM-DD"; colunas `timestamp` recebem Date. */
const dateAt = (days: number): Date => {
  const d = new Date(NOW.getTime());
  d.setDate(d.getDate() + days);
  return d;
};
const addDays = (days: number): string => iso(dateAt(days));

function parseOrgId(argv: string[]): number {
  const i = argv.indexOf("--org-id");
  const raw = i >= 0 ? argv[i + 1] : argv[0];
  if (!raw) throw new Error("--org-id é obrigatório. Uso: fix-demo-org --org-id <id>");
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--org-id inválido: ${raw}`);
  return n;
}

/**
 * Termos que identificam o cliente real. Só os DISTINTIVOS: "Matriz" e "Chuí"
 * ficam de fora de propósito — são palavras comuns, e trocá-las produziria falso
 * positivo (a demo tem a sua própria "Matriz").
 */
const TERMOS_VAZADOS: Array<[RegExp, string]> = [
  [/Duque de Caxias/gi, "Filial Rio de Janeiro"],
  [/S[ãa]o Bernardo do Campo/gi, "Sede Principal"],
  [/S[ãa]o Bernardo C\./gi, "Sede Principal"],
  [/S[ãa]o Bernardo/gi, "Sede Principal"],
  [/S[ãa]o Jos[ée] dos Pinhais/gi, "Filial Belo Horizonte"],
  [/Integrado Gabardo/gi, "Sede Principal"],
  [/Gabardo/gi, "Aurora"],
  [/Piracicaba/gi, "Sede Principal"],
  [/Porto Real/gi, "Filial Rio de Janeiro"],
  [/Porto Alegre/gi, "Filial Belo Horizonte"],
  [/Cariacica/gi, "Filial Belo Horizonte"],
  [/An[áa]polis/gi, "Sede Principal"],
  [/Cama[çc]ari/gi, "Filial Rio de Janeiro"],
  [/Iracem[áa]polis/gi, "Sede Principal"],
  [/Jacare[íi]/gi, "Filial Rio de Janeiro"],
  [/Palho[çc]a/gi, "Filial Belo Horizonte"],
  [/Eus[ée]bio/gi, "Filial Rio de Janeiro"],
  [/Suape/gi, "Filial Belo Horizonte"],
];

/** CAUSA 0 — tira os nomes do cliente real dos indicadores da demo. */
async function corrigirVazamento(orgId: number, tx: typeof db): Promise<number> {
  const indicadores = await tx
    .select({ id: kpiIndicatorsTable.id, name: kpiIndicatorsTable.name })
    .from(kpiIndicatorsTable)
    .where(eq(kpiIndicatorsTable.organizationId, orgId));

  let alterados = 0;
  const usados = new Set(indicadores.map((i) => i.name));

  for (const ind of indicadores) {
    let novo = ind.name;
    for (const [re, sub] of TERMOS_VAZADOS) novo = novo.replace(re, sub);
    if (novo === ind.name) continue;

    // A troca pode colidir (ex.: dois indicadores de filiais diferentes viram o
    // mesmo nome). Desambigua com sufixo em vez de deixar duplicata na tela.
    usados.delete(ind.name);
    if (usados.has(novo)) {
      let n = 2;
      while (usados.has(`${novo} (${n})`)) n += 1;
      novo = `${novo} (${n})`;
    }
    usados.add(novo);

    await tx
      .update(kpiIndicatorsTable)
      .set({ name: novo })
      .where(and(eq(kpiIndicatorsTable.organizationId, orgId), eq(kpiIndicatorsTable.id, ind.id)));
    alterados += 1;
  }
  console.log(`  [0] vazamento: ${alterados} indicadores renomeados`);
  return alterados;
}

/** CAUSA 5 — filiais fantasma: sem código, sem colaborador, duplicando o nome das reais. */
async function removerFiliaisFantasma(orgId: number, tx: typeof db): Promise<number> {
  const units = await tx
    .select({ id: unitsTable.id, name: unitsTable.name, code: unitsTable.code })
    .from(unitsTable)
    .where(eq(unitsTable.organizationId, orgId));

  const fantasmas = units.filter((u) => !u.code);
  const reais = units.filter((u) => u.code);
  if (fantasmas.length === 0 || reais.length === 0) {
    console.log("  [5] filiais fantasma: nada a remover");
    return 0;
  }

  const destino = reais[0].id;
  const ids = fantasmas.map((u) => u.id);

  // Só 1 linha no banco aponta para elas (um swot_factor) — remapear antes evita
  // que o DELETE cascateie ou seja bloqueado.
  await tx
    .update(swotFactorsTable)
    .set({ unitId: destino })
    .where(and(eq(swotFactorsTable.organizationId, orgId), inArray(swotFactorsTable.unitId, ids)));

  await tx.delete(unitsTable).where(and(eq(unitsTable.organizationId, orgId), inArray(unitsTable.id, ids)));

  console.log(`  [5] filiais fantasma: ${ids.length} removidas (${fantasmas.map((f) => f.name).join(", ")})`);
  return ids.length;
}

/** CAUSA 1 — o usuário da demo não era responsável por nada; a landing abria vazia. */
async function atribuirResponsaveis(orgId: number, tx: typeof db, alvoUserId: number): Promise<void> {
  const users = await tx
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.organizationId, orgId))
    .orderBy(usersTable.id);
  const outros = users.map((u) => u.id).filter((id) => id !== alvoUserId);

  // Planos: metade para o alvo, resto distribuído — a aba "Organização" precisa
  // mostrar variedade de responsáveis, senão vira "Felipe" em toda linha.
  const planos = await tx
    .select({ id: actionPlansTable.id })
    .from(actionPlansTable)
    .where(eq(actionPlansTable.organizationId, orgId))
    .orderBy(actionPlansTable.id);
  for (const [i, p] of planos.entries()) {
    const dono = i % 2 === 0 ? alvoUserId : (outros[i % Math.max(outros.length, 1)] ?? alvoUserId);
    await tx.update(actionPlansTable).set({ responsibleUserId: dono })
      .where(and(eq(actionPlansTable.organizationId, orgId), eq(actionPlansTable.id, p.id)));
  }

  await tx.update(nonconformitiesTable).set({ responsibleUserId: alvoUserId })
    .where(eq(nonconformitiesTable.organizationId, orgId));
  await tx.update(correctiveActionsTable).set({ responsibleUserId: alvoUserId })
    .where(eq(correctiveActionsTable.organizationId, orgId));

  // Documentos regulatórios: 2/3 para o alvo, 1/3 fica com outros.
  const docs = await tx
    .select({ id: regulatoryDocumentsTable.id })
    .from(regulatoryDocumentsTable)
    .where(eq(regulatoryDocumentsTable.organizationId, orgId))
    .orderBy(regulatoryDocumentsTable.id);
  for (const [i, d] of docs.entries()) {
    const dono = i % 3 === 2 ? (outros[i % Math.max(outros.length, 1)] ?? alvoUserId) : alvoUserId;
    await tx.update(regulatoryDocumentsTable).set({ responsibleUserId: dono, updatedAt: NOW })
      .where(and(eq(regulatoryDocumentsTable.organizationId, orgId), eq(regulatoryDocumentsTable.id, d.id)));
  }

  // Indicadores órfãos: distribui todos. Sem responsável eles nunca geram
  // pendência para ninguém — 133 de 151 estavam assim (o cliente real tem 92%
  // preenchido, então atribuir reproduz o uso real em vez de inventá-lo).
  const orfaos = await tx
    .select({ id: kpiIndicatorsTable.id })
    .from(kpiIndicatorsTable)
    .where(and(eq(kpiIndicatorsTable.organizationId, orgId), isNull(kpiIndicatorsTable.responsibleUserId)))
    .orderBy(kpiIndicatorsTable.id);
  for (const [i, ind] of orfaos.entries()) {
    // 1 em cada 3 para o alvo: a landing precisa de itens, mas a aba Organização
    // fica pobre se todos forem dele.
    const dono = i % 3 === 0 ? alvoUserId : (outros[i % Math.max(outros.length, 1)] ?? alvoUserId);
    await tx.update(kpiIndicatorsTable).set({ responsibleUserId: dono })
      .where(and(eq(kpiIndicatorsTable.organizationId, orgId), eq(kpiIndicatorsTable.id, ind.id)));
  }

  console.log(
    `  [1] responsáveis: ${planos.length} planos, ${docs.length} docs regulatórios, ${orfaos.length} indicadores órfãos distribuídos`,
  );
}

/** CAUSA 2 — ninguém tinha filial; a aba "Por filial" resolvia [] e zerava. */
async function atribuirFiliais(orgId: number, tx: typeof db): Promise<void> {
  const units = await tx
    .select({ id: unitsTable.id })
    .from(unitsTable)
    .where(eq(unitsTable.organizationId, orgId))
    .orderBy(unitsTable.id);
  if (units.length === 0) return;

  const users = await tx
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.organizationId, orgId), isNull(usersTable.unitId)))
    .orderBy(usersTable.id);

  for (const [i, u] of users.entries()) {
    // Concentra na primeira filial: a aba Por filial precisa de UMA filial com
    // volume, não de 3 com um item cada.
    const unitId = i < 3 ? units[0].id : units[i % units.length].id;
    await tx.update(usersTable).set({ unitId }).where(eq(usersTable.id, u.id));
  }
  console.log(`  [2] filiais: ${users.length} usuários vinculados`);
}

/** CAUSA 3 — o seed gravou data absoluta; as telas ancoram em now(). */
async function reancorarDatas(orgId: number, tx: typeof db): Promise<void> {
  const planos = await tx
    .select({ id: actionPlansTable.id, createdAt: actionPlansTable.createdAt, status: actionPlansTable.status })
    .from(actionPlansTable)
    .where(eq(actionPlansTable.organizationId, orgId))
    .orderBy(actionPlansTable.id);

  const prazos = [-9, -11, 3, 12, 25, 40];
  for (const [i, p] of planos.entries()) {
    await tx.update(actionPlansTable).set({ dueDate: dateAt(prazos[i % prazos.length]) })
      .where(and(eq(actionPlansTable.organizationId, orgId), eq(actionPlansTable.id, p.id)));
  }

  // Manutenção: 5 planos todos vencidos → 1 vencido, 2 próximos, 2 futuros.
  const manut = await tx
    .select({ id: assetMaintenancePlansTable.id })
    .from(assetMaintenancePlansTable)
    .where(eq(assetMaintenancePlansTable.organizationId, orgId))
    .orderBy(assetMaintenancePlansTable.id);
  const venc = [-3, 5, 12, 45, 75];
  for (const [i, m] of manut.entries()) {
    await tx.update(assetMaintenancePlansTable).set({ nextDueAt: addDays(venc[i % venc.length]) })
      .where(and(eq(assetMaintenancePlansTable.organizationId, orgId), eq(assetMaintenancePlansTable.id, m.id)));
  }

  console.log(`  [3] datas: ${planos.length} planos de ação e ${manut.length} planos de manutenção reancorados em hoje`);
}

/** CAUSA 4 — GUT nulo desenha barras de largura 0; títulos [DEMO] são texto de teste na tela. */
async function corrigirGutETextos(orgId: number, tx: typeof db): Promise<void> {
  const planos = await tx
    .select({ id: actionPlansTable.id, title: actionPlansTable.title })
    .from(actionPlansTable)
    .where(eq(actionPlansTable.organizationId, orgId))
    .orderBy(actionPlansTable.id);

  const gut: Array<[number, number, number]> = [
    [5, 5, 4], [5, 4, 3], [4, 4, 2], [3, 3, 3], [3, 2, 2], [2, 2, 2],
  ];
  let limpos = 0;
  for (const [i, p] of planos.entries()) {
    const [g, u, t] = gut[i % gut.length];
    const titulo = p.title
      .replace(/\s*\[DEMO[^\]]*\]\s*/gi, " ")
      .replace(/\s*MOCK-DEMO-[A-Z]+\s*/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (titulo !== p.title) limpos += 1;
    await tx.update(actionPlansTable)
      .set({ gutGravity: g, gutUrgency: u, gutTendency: t, title: titulo || p.title })
      .where(and(eq(actionPlansTable.organizationId, orgId), eq(actionPlansTable.id, p.id)));
  }
  console.log(`  [4] GUT preenchido em ${planos.length} planos; ${limpos} títulos limpos de texto de teste`);
}

/** CAUSA 6 — plano estratégico 'overdue' deixa Governança read-only e o CTA disabled sem explicação. */
async function destravarGovernanca(orgId: number, tx: typeof db): Promise<void> {
  const r = await tx
    .update(strategicPlansTable)
    .set({ status: "approved", nextReviewAt: new Date(`${NOW.getFullYear() + 1}-06-01`) })
    .where(and(eq(strategicPlansTable.organizationId, orgId), eq(strategicPlansTable.status, "overdue")))
    .returning({ id: strategicPlansTable.id });
  console.log(`  [6] governança: ${r.length} plano(s) estratégico(s) saíram de 'overdue'`);
}

/** CAUSA 7 — o filtro "Norma" compara string exata; com applicable_norm NULL, escolher qualquer norma zera a lista. */
async function corrigirDocumentos(orgId: number, tx: typeof db): Promise<void> {
  const docs = await tx
    .select({ id: documentsTable.id, title: documentsTable.title, applicableNorm: documentsTable.applicableNorm })
    .from(documentsTable)
    .where(eq(documentsTable.organizationId, orgId))
    .orderBy(documentsTable.id);

  let ajustados = 0;
  for (const [i, d] of docs.entries()) {
    if (d.applicableNorm === "ISO 9001:2015" || d.applicableNorm === "ISO 14001:2015") continue;
    // O dropdown compara com o rótulo exato; '9001' ou NULL somem do filtro.
    const norma = i % 5 === 4 ? "ISO 14001:2015" : "ISO 9001:2015";
    await tx.update(documentsTable).set({ applicableNorm: norma })
      .where(and(eq(documentsTable.organizationId, orgId), eq(documentsTable.id, d.id)));
    ajustados += 1;
  }
  console.log(`  [7] documentos: ${ajustados} com norma aplicável preenchida (o filtro exige o rótulo exato)`);
}

/** Fatores de desempenho sem responsável não geram pendência nem aparecem como "meus". */
async function atribuirFatores(orgId: number, tx: typeof db, alvoUserId: number): Promise<void> {
  const r = await tx
    .update(roadSafetyFactorsTable)
    .set({ responsibleUserId: alvoUserId })
    .where(and(eq(roadSafetyFactorsTable.organizationId, orgId), isNull(roadSafetyFactorsTable.responsibleUserId)))
    .returning({ id: roadSafetyFactorsTable.id });
  console.log(`  [3b] segurança viária: ${r.length} fatores com responsável`);
}

async function main(): Promise<void> {
  const orgId = parseOrgId(process.argv.slice(2));

  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId));
  if (!org) throw new Error(`Organização ${orgId} não encontrada.`);

  const [alvo] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.organizationId, orgId), eq(usersTable.role, "org_admin")))
    .orderBy(usersTable.id);
  if (!alvo) throw new Error(`Org ${orgId} não tem org_admin — necessário como responsável da demo.`);

  console.log(`\n🔧 Correção da org #${org.id} ${org.name}`);
  console.log(`   usuário alvo (landing page): #${alvo.id} ${alvo.name} <${alvo.email}>\n`);

  await db.transaction(async (tx) => {
    await corrigirVazamento(orgId, tx as unknown as typeof db);
    // Antes de atribuir filial: não faz sentido apontar usuário para filial que vai sumir.
    await removerFiliaisFantasma(orgId, tx as unknown as typeof db);
    await atribuirResponsaveis(orgId, tx as unknown as typeof db, alvo.id);
    await atribuirFiliais(orgId, tx as unknown as typeof db);
    await reancorarDatas(orgId, tx as unknown as typeof db);
    await atribuirFatores(orgId, tx as unknown as typeof db, alvo.id);
    await corrigirGutETextos(orgId, tx as unknown as typeof db);
    await destravarGovernanca(orgId, tx as unknown as typeof db);
    await corrigirDocumentos(orgId, tx as unknown as typeof db);
  });

  console.log("\n✅ Correção aplicada (transação commitada).\n");
}

main()
  .catch((e: unknown) => {
    console.error(`fix-demo-org falhou: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
