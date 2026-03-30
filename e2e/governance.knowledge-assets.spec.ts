import { expect, test } from "./fixtures/auth";
import { apiJson } from "./support/api";

async function getCurrentUser(token: string) {
  const response = await apiJson<{
    user: { id: number; organizationId: number };
  }>("/api/auth/me", {
    token,
  });

  return response.user;
}

async function createDocumentForTest(
  organizationId: number,
  token: string,
  title: string,
  elaboratorId: number,
  currentUserId: number,
) {
  return apiJson<{ id: number; title: string }>(
    `/api/organizations/${organizationId}/documents`,
    {
      token,
      method: "POST",
      body: {
        title,
        type: "manual",
        validityDate: "2030-01-01",
        elaboratorIds: [elaboratorId],
        criticalReviewerIds: [currentUserId],
        approverIds: [currentUserId],
        recipientIds: [currentUserId],
      },
    },
  );
}

test("shows critical knowledge assets in governance and opens the contextual employee shortcut", async ({
  authenticatedPage,
  orgAdmin,
}) => {
  const suffix = Date.now();
  const unitName = `Unidade Conhecimento ${suffix}`;
  const departmentName = `Governança ${suffix}`;
  const positionName = `Especialista SGQ ${suffix}`;
  const employeeName = `Colaborador Conhecimento ${suffix}`;
  const processName = `Processo Conhecimento ${suffix}`;
  const planTitle = `Plano Conhecimento ${suffix}`;
  const documentTitle = `Manual Critico ${suffix}`;
  const assetTitle = `Ativo de Conhecimento ${suffix}`;

  const currentUser = await getCurrentUser(orgAdmin.token);

  const unit = await apiJson<{ id: number }>(
    `/api/organizations/${orgAdmin.organizationId}/units`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        name: unitName,
        type: "filial",
        status: "ativa",
        city: "Recife",
        state: "PE",
        country: "Brasil",
      },
    },
  );

  await apiJson(`/api/organizations/${orgAdmin.organizationId}/departments`, {
    token: orgAdmin.token,
    method: "POST",
    body: {
      name: departmentName,
      unitIds: [unit.id],
    },
  });

  const position = await apiJson<{ id: number; name: string }>(
    `/api/organizations/${orgAdmin.organizationId}/positions`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        name: positionName,
      },
    },
  );

  const employee = await apiJson<{ id: number; name: string }>(
    `/api/organizations/${orgAdmin.organizationId}/employees`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        name: employeeName,
        email: `knowledge-${suffix}@daton.test`,
        unitId: unit.id,
        department: departmentName,
        position: positionName,
        admissionDate: "2024-03-10",
      },
    },
  );

  const process = await apiJson<{ id: number; name: string }>(
    `/api/organizations/${orgAdmin.organizationId}/governance/sgq-processes`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        name: processName,
        objective: "Manter o conhecimento crítico rastreável.",
      },
    },
  );

  const plan = await apiJson<{ id: number; title: string }>(
    `/api/organizations/${orgAdmin.organizationId}/governance/strategic-plans`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        title: planTitle,
      },
    },
  );

  const riskItem = await apiJson<{ id: number; description: string }>(
    `/api/organizations/${orgAdmin.organizationId}/governance/strategic-plans/${plan.id}/risk-opportunity-items`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        type: "risk",
        sourceType: "meeting",
        title: `Risco de perda ${suffix}`,
        description: `Perda de conhecimento crítico ${suffix}`,
        status: "identified",
      },
    },
  );

  const document = await createDocumentForTest(
    orgAdmin.organizationId,
    orgAdmin.token,
    documentTitle,
    employee.id,
    currentUser.id,
  );

  const knowledgeAsset = await apiJson<{ id: number; title: string }>(
    `/api/organizations/${orgAdmin.organizationId}/governance/knowledge-assets`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        title: assetTitle,
        description: "Conhecimento relacionado a auditorias e governança.",
        lossRiskLevel: "critical",
        retentionMethod: "Procedimento e mentoria estruturada.",
        successionPlan: "Backup com dois substitutos treinados.",
        links: [
          { processId: process.id },
          { positionId: position.id },
          { documentId: document.id },
          { riskOpportunityItemId: riskItem.id },
        ],
      },
    },
  );

  await authenticatedPage.goto("/governanca/conhecimento-critico");
  await expect(authenticatedPage.getByText(assetTitle)).toBeVisible();
  await expect(
    authenticatedPage.getByText("Sem evidência").first(),
  ).toBeVisible();

  await authenticatedPage
    .getByLabel("Cargo")
    .selectOption(String(position.id));
  await expect(authenticatedPage.getByText(assetTitle)).toBeVisible();

  await apiJson(
    `/api/organizations/${orgAdmin.organizationId}/governance/knowledge-assets/${knowledgeAsset.id}`,
    {
      token: orgAdmin.token,
      method: "PATCH",
      body: {
        evidenceAttachments: [
          {
            fileName: "registro.pdf",
            fileSize: 2048,
            contentType: "application/pdf",
            objectPath: "/knowledge/registro.pdf",
          },
        ],
        evidenceValidUntil: "2020-01-01",
      },
    },
  );

  await authenticatedPage.reload();
  await expect(
    authenticatedPage.getByText("Evidência vencida").first(),
  ).toBeVisible();

  await authenticatedPage.goto(`/organizacao/colaboradores/${employee.id}`);
  await authenticatedPage
    .getByRole("button", { name: "Conhecimento do cargo" })
    .click();

  await expect(authenticatedPage).toHaveURL(
    new RegExp(`/governanca/conhecimento-critico\\?positionId=${position.id}$`),
  );
  await expect(authenticatedPage.getByLabel("Cargo")).toHaveValue(
    String(position.id),
  );
  await expect(authenticatedPage.getByText(assetTitle)).toBeVisible();
});
