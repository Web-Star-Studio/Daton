import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, organizationsTable } from "@workspace/db";
import { GetOrganizationParams, UpdateOrganizationParams, UpdateOrganizationBody } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/organizations/:orgId", requireAuth, async (req, res): Promise<void> => {
  const params = GetOrganizationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, params.data.orgId));
  if (!org) {
    res.status(404).json({ error: "Organização não encontrada" });
    return;
  }

  res.json({
    id: org.id,
    name: org.name,
    nomeFantasia: org.nomeFantasia,
    cnpj: org.cnpj,
    inscricaoEstadual: org.inscricaoEstadual,
    dataFundacao: org.dataFundacao,
    statusOperacional: org.statusOperacional,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  });
});

router.patch("/organizations/:orgId", requireAuth, requireRole("org_admin"), async (req, res): Promise<void> => {
  const params = UpdateOrganizationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = UpdateOrganizationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [org] = await db.update(organizationsTable)
    .set(body.data)
    .where(eq(organizationsTable.id, params.data.orgId))
    .returning();

  if (!org) {
    res.status(404).json({ error: "Organização não encontrada" });
    return;
  }

  res.json({
    id: org.id,
    name: org.name,
    nomeFantasia: org.nomeFantasia,
    cnpj: org.cnpj,
    inscricaoEstadual: org.inscricaoEstadual,
    dataFundacao: org.dataFundacao,
    statusOperacional: org.statusOperacional,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  });
});

export default router;
