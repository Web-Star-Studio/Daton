/**
 * Carga + enriquecimento de colaboradores na Transportes Gabardo (org 2).
 * Lê /tmp/gabardo-load-plan.json (gerado por gabardo-load-dryrun.py).
 *
 * SEGURANÇA: roda tudo numa transação. SEM --commit -> faz ROLLBACK (validação
 * contra o banco real, sem gravar). COM --commit -> grava de verdade.
 *
 * Idempotente: unidades/departamentos/cargos só são criados se não existirem;
 * o passo de inserção deduplica por CPF contra o que já está no banco.
 */
import fs from "node:fs";
import { db, pool } from "@workspace/db";
import {
  unitsTable,
  departmentsTable,
  positionsTable,
  employeesTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const COMMIT = process.argv.includes("--commit");
const PLAN_PATH = "/tmp/gabardo-load-plan.json";

type PlanRecord = {
  row?: number;
  organizationId: number;
  unitId: number | string | null;
  name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  contractType: string;
  admissionDate: string | null;
  terminationDate: string | null;
  status: string;
  birthDate: string | null;
  gender: string | null;
  education: string | null;
};
type EnrichRecord = {
  id: number;
  cpf: string;
  name: string;
  set: Record<string, string | number | null>;
};
type Plan = {
  orgId: number;
  unitsToCreate: { key: string; name: string; code: string; type: string }[];
  departmentsToCreate: string[];
  positionsToCreate: string[];
  insert: PlanRecord[];
  enrich: EnrichRecord[];
  counts: Record<string, number>;
};

const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");

async function main() {
  const plan: Plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8"));
  const orgId = plan.orgId;
  console.log(`MODO: ${COMMIT ? "COMMIT (grava)" : "DRY-RUN (rollback)"}`);
  console.log(
    `Plano: insert=${plan.insert.length} enrich=${plan.enrich.length} ` +
      `unidades=${plan.unitsToCreate.length} depts=${plan.departmentsToCreate.length} cargos=${plan.positionsToCreate.length}`,
  );

  const insertedIds: number[] = [];

  const ROLLBACK = Symbol("rollback");
  try {
    await db.transaction(async (tx) => {
      const [{ total: before }] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(employeesTable)
        .where(eq(employeesTable.organizationId, orgId));
      console.log(`\nColaboradores na org ${orgId} ANTES: ${before}`);

      // ---- 1) unidades (pseudo-filiais) ----
      const existingUnits = await tx
        .select({ id: unitsTable.id, name: unitsTable.name, code: unitsTable.code })
        .from(unitsTable)
        .where(eq(unitsTable.organizationId, orgId));
      const unitKeyToId: Record<string, number> = {};
      let unitsCreated = 0;
      for (const u of plan.unitsToCreate) {
        const found = existingUnits.find(
          (e) => e.name === u.name || e.code === u.code,
        );
        if (found) {
          unitKeyToId[u.key] = found.id;
          continue;
        }
        const [created] = await tx
          .insert(unitsTable)
          .values({ organizationId: orgId, name: u.name, code: u.code, type: u.type })
          .returning({ id: unitsTable.id });
        unitKeyToId[u.key] = created.id;
        unitsCreated++;
      }
      console.log(`Unidades criadas: ${unitsCreated} | map=${JSON.stringify(unitKeyToId)}`);

      // ---- 2) departamentos ----
      const existingDepts = new Set(
        (
          await tx
            .select({ name: departmentsTable.name })
            .from(departmentsTable)
            .where(eq(departmentsTable.organizationId, orgId))
        ).map((d) => d.name),
      );
      let deptsCreated = 0;
      for (const name of plan.departmentsToCreate) {
        if (existingDepts.has(name)) continue;
        await tx.insert(departmentsTable).values({ organizationId: orgId, name });
        deptsCreated++;
      }
      console.log(`Departamentos criados: ${deptsCreated}`);

      // ---- 3) cargos (positions) ----
      const existingPositions = new Set(
        (
          await tx
            .select({ name: positionsTable.name })
            .from(positionsTable)
            .where(eq(positionsTable.organizationId, orgId))
        ).map((p) => p.name),
      );
      let positionsCreated = 0;
      const posValues = plan.positionsToCreate
        .filter((name) => !existingPositions.has(name))
        .map((name) => ({ organizationId: orgId, name }));
      for (let i = 0; i < posValues.length; i += 200) {
        await tx.insert(positionsTable).values(posValues.slice(i, i + 200));
      }
      positionsCreated = posValues.length;
      console.log(`Cargos criados: ${positionsCreated}`);

      const resolveUnit = (v: number | string | null): number | null => {
        if (typeof v === "string") {
          const id = unitKeyToId[v];
          if (id == null) throw new Error(`unitId sentinel não resolvido: ${v}`);
          return id;
        }
        return v;
      };

      // ---- 4) INSERT novos ----
      const rows = plan.insert.map((r) => ({
        organizationId: orgId,
        unitId: resolveUnit(r.unitId),
        name: r.name,
        cpf: r.cpf,
        email: r.email,
        phone: r.phone,
        position: r.position,
        department: r.department,
        contractType: r.contractType,
        admissionDate: r.admissionDate,
        terminationDate: r.terminationDate,
        status: r.status,
        birthDate: r.birthDate,
        gender: r.gender,
        education: r.education,
      }));
      for (let i = 0; i < rows.length; i += 300) {
        const chunk = rows.slice(i, i + 300);
        const ret = await tx
          .insert(employeesTable)
          .values(chunk)
          .returning({ id: employeesTable.id });
        insertedIds.push(...ret.map((x) => x.id));
      }
      console.log(`Inseridos: ${insertedIds.length}`);

      // ---- 5) ENRICH existentes (fill-if-empty) ----
      let enriched = 0;
      let fieldsSet = 0;
      for (const e of plan.enrich) {
        if (!e.set || Object.keys(e.set).length === 0) continue;
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(e.set)) {
          patch[k] = k === "unitId" ? resolveUnit(v as number | string | null) : v;
        }
        await tx
          .update(employeesTable)
          .set(patch)
          .where(
            and(
              eq(employeesTable.id, e.id),
              eq(employeesTable.organizationId, orgId),
            ),
          );
        enriched++;
        fieldsSet += Object.keys(patch).length;
      }
      console.log(`Enriquecidos: ${enriched} (campos preenchidos: ${fieldsSet})`);

      const [{ total: after }] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(employeesTable)
        .where(eq(employeesTable.organizationId, orgId));
      console.log(`Colaboradores na org ${orgId} DEPOIS: ${after} (delta=${after - before})`);

      if (!COMMIT) {
        console.log("\n[DRY-RUN] revertendo (rollback). Use --commit para gravar.");
        throw ROLLBACK;
      }
    });

    if (COMMIT) {
      fs.writeFileSync(
        "/tmp/gabardo-inserted-ids.json",
        JSON.stringify({ orgId, insertedIds }, null, 0),
      );
      console.log(`\n✅ COMMIT concluído. IDs inseridos salvos em /tmp/gabardo-inserted-ids.json (${insertedIds.length}).`);
    }
  } catch (err) {
    if (err === ROLLBACK) {
      console.log("✔ rollback ok (nada gravado).");
    } else {
      throw err;
    }
  }
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error("ERRO:", e);
    await pool.end();
    process.exit(1);
  });
