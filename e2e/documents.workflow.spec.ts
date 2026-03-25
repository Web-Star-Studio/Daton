import { test, expect } from "./fixtures/auth";
import { API_BASE_URL, WEB_BASE_URL, WEB_ORIGIN } from "./support/config";
import { createEmployee } from "../tests/support/backend";

async function apiJson<T>(
  path: string,
  token: string,
  init: RequestInit & { bodyJson?: unknown } = {},
): Promise<T> {
  const { bodyJson, headers, ...rest } = init;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(bodyJson !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(headers || {}),
    },
    body: bodyJson !== undefined ? JSON.stringify(bodyJson) : rest.body,
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return body as T;
}

async function createUserWithDocumentsModule(
  orgId: number,
  adminToken: string,
  prefix: string,
  options: {
    role: "operator" | "analyst";
    suffix: string;
  },
) {
  const email = `${prefix}-${options.suffix}@daton.e2e`;
  const password = "DatonE2E!123";

  const user = await apiJson<{ id: number; name: string; email: string }>(
    `/api/organizations/${orgId}/users`,
    adminToken,
    {
      method: "POST",
      bodyJson: {
        name: `${prefix} ${options.suffix}`,
        email,
        password,
        role: options.role,
        modules: ["documents"],
      },
    },
  );

  const login = await apiJson<{ token: string }>(
    `/api/auth/login`,
    adminToken,
    {
      method: "POST",
      bodyJson: { email, password },
    },
  );

  return {
    ...user,
    token: login.token,
  };
}

async function uploadCsvAttachment(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/storage/uploads/direct`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "X-File-Content-Type": "text/csv",
      "X-File-Name": encodeURIComponent("evidencia.csv"),
    },
    body: Buffer.from("coluna,valor\nstatus,rascunho\n", "utf-8"),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<{
    objectPath: string;
    fileSize: number;
    contentType: string;
  }>;
}

async function selectSearchableMultiOption(
  root:
    | import("@playwright/test").Page
    | import("@playwright/test").Locator,
  fieldLabel: string,
  searchPlaceholder: string,
  optionLabel: string,
) {
  const field = root.getByText(fieldLabel, { exact: true }).locator("xpath=..");
  await field.getByRole("button").click();
  await root.getByPlaceholder(searchPlaceholder).fill(optionLabel);
  await root.getByText(optionLabel, { exact: true }).click();
}

test("critical analysis gates the document flow before approval and is reopened on rework", async ({
  authenticatedPage,
  browser,
  orgAdmin,
}, testInfo) => {
  const prefix = testInfo.title.replace(/\W+/g, "-").toLowerCase();
  const criticalReviewer = await createUserWithDocumentsModule(
    orgAdmin.organizationId,
    orgAdmin.token,
    prefix,
    { role: "analyst", suffix: "critical-reviewer" },
  );
  const approver = await createUserWithDocumentsModule(
    orgAdmin.organizationId,
    orgAdmin.token,
    prefix,
    { role: "operator", suffix: "approver" },
  );
  const recipient = await createUserWithDocumentsModule(
    orgAdmin.organizationId,
    orgAdmin.token,
    prefix,
    { role: "operator", suffix: "recipient" },
  );
  const elaborator = await createEmployee(
    { organizationId: orgAdmin.organizationId },
    {
      name: `${prefix} Elaborador`,
    },
  );
  const attachment = await uploadCsvAttachment(orgAdmin.token);
  const title = `Documento E2E ${Date.now()}`;

  const createdDoc = await apiJson<{
    id: number;
    currentVersion: number;
    versions?: Array<{ versionNumber: number }>;
  }>(
    `/api/organizations/${orgAdmin.organizationId}/documents`,
    orgAdmin.token,
    {
      method: "POST",
      bodyJson: {
        title,
        type: "manual",
        validityDate: "2030-01-01",
        elaboratorIds: [elaborator.id],
        criticalReviewerIds: [criticalReviewer.id],
        approverIds: [approver.id],
        recipientIds: [recipient.id],
        attachments: [
          {
            fileName: "evidencia.csv",
            fileSize: attachment.fileSize,
            contentType: attachment.contentType,
            objectPath: attachment.objectPath,
          },
        ],
      },
    },
  );

  expect(createdDoc.currentVersion).toBe(0);
  expect(createdDoc.versions || []).toHaveLength(0);

  const criticalNotifications = await apiJson<{
    notifications: Array<{ title: string; description: string }>;
  }>(
    `/api/organizations/${orgAdmin.organizationId}/notifications`,
    criticalReviewer.token,
  );
  expect(
    criticalNotifications.notifications.some((notification) =>
      notification.title.includes("análise crítica"),
    ),
  ).toBe(true);

  const criticalReviewerContext = await browser.newContext({
    baseURL: WEB_BASE_URL,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: WEB_ORIGIN,
          localStorage: [
            { name: "daton_token", value: criticalReviewer.token },
          ],
        },
      ],
    },
  });
  const criticalReviewerPage = await criticalReviewerContext.newPage();

  const approverContext = await browser.newContext({
    baseURL: WEB_BASE_URL,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: WEB_ORIGIN,
          localStorage: [{ name: "daton_token", value: approver.token }],
        },
      ],
    },
  });
  const approverPage = await approverContext.newPage();

  try {
    await authenticatedPage.goto(`/qualidade/documentacao/${createdDoc.id}`);
    await expect(
      authenticatedPage.getByText("Sem versão aprovada"),
    ).toBeVisible();
    await expect(authenticatedPage.getByText("Análise crítica")).toBeVisible();
    await expect(
      authenticatedPage.getByRole("button", { name: "Enviar para Revisão" }),
    ).toHaveCount(0);

    await authenticatedPage.getByRole("button", { name: "Anexos" }).click();
    await expect(
      authenticatedPage.getByRole("button", { name: "Visualizar" }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole("button", { name: "Baixar" }),
    ).toBeVisible();

    await criticalReviewerPage.goto(`/qualidade/documentacao/${createdDoc.id}`);
    await expect(
      criticalReviewerPage.getByRole("button", {
        name: "Concluir análise crítica",
      }),
    ).toBeVisible();
    await criticalReviewerPage
      .getByRole("button", { name: "Concluir análise crítica" })
      .click();
    await criticalReviewerPage.getByRole("button", { name: "Fluxo" }).click();
    await expect(criticalReviewerPage.getByText("Concluída")).toBeVisible();

    await authenticatedPage.reload();
    await expect(
      authenticatedPage.getByRole("button", { name: "Enviar para Revisão" }),
    ).toBeVisible();

    await authenticatedPage.getByRole("button", { name: "Editar" }).click();
    await authenticatedPage.getByLabel("Título *").fill(`${title} atualizado`);
    await authenticatedPage.getByRole("button", { name: "Próximo" }).click();
    await authenticatedPage.getByRole("button", { name: "Próximo" }).click();
    await authenticatedPage
      .getByRole("button", { name: "Salvar Alterações" })
      .click();

    await expect(
      authenticatedPage.getByRole("button", { name: "Enviar para Revisão" }),
    ).toHaveCount(0);

    const notificationsAfterEdit = await apiJson<{
      notifications: Array<{ title: string; description: string }>;
    }>(
      `/api/organizations/${orgAdmin.organizationId}/notifications`,
      criticalReviewer.token,
    );
    expect(
      notificationsAfterEdit.notifications.filter((notification) =>
        notification.title.includes("análise crítica"),
      ).length,
    ).toBeGreaterThan(1);

    await criticalReviewerPage.reload();
    await expect(
      criticalReviewerPage.getByRole("button", {
        name: "Concluir análise crítica",
      }),
    ).toBeVisible();
    await criticalReviewerPage
      .getByRole("button", { name: "Concluir análise crítica" })
      .click();

    await authenticatedPage.reload();
    await authenticatedPage
      .getByRole("button", { name: "Enviar para Revisão" })
      .click();
    await authenticatedPage
      .getByLabel("Descrição da versão *")
      .fill("Primeira versão formal do documento");
    await authenticatedPage
      .getByRole("button", { name: "Enviar para Revisão" })
      .last()
      .click();
    await expect(authenticatedPage.getByText("Em Revisão")).toBeVisible();

    await approverPage.goto(`/qualidade/documentacao/${createdDoc.id}`);
    await approverPage.getByRole("button", { name: "Rejeitar" }).click();
    await approverPage
      .getByLabel("Motivo *")
      .fill("Ajustar conteúdo antes da aprovação");
    await approverPage.getByRole("button", { name: "Rejeitar" }).last().click();
    await expect(approverPage.getByText("Análise crítica")).toBeVisible();

    await criticalReviewerPage.reload();
    await expect(
      criticalReviewerPage.getByRole("button", {
        name: "Concluir análise crítica",
      }),
    ).toBeVisible();
    await criticalReviewerPage
      .getByRole("button", { name: "Concluir análise crítica" })
      .click();

    await authenticatedPage.reload();
    await authenticatedPage
      .getByRole("button", { name: "Reenviar para Revisão" })
      .click();
    await authenticatedPage
      .getByLabel("Descrição da versão *")
      .fill("Primeira versão formal do documento");
    await authenticatedPage
      .getByRole("button", { name: "Enviar para Revisão" })
      .last()
      .click();
    await expect(authenticatedPage.getByText("Em Revisão")).toBeVisible();

    await approverPage.reload();
    await expect(
      approverPage.getByRole("button", { name: "Aprovar" }),
    ).toBeVisible();
    await approverPage.getByRole("button", { name: "Aprovar" }).click();
    await expect(approverPage.getByText("Distribuído")).toBeVisible();

    await authenticatedPage.reload();
    await expect(authenticatedPage.getByText("v1")).toBeVisible();
    await authenticatedPage.getByRole("button", { name: "Versões" }).click();
    await expect(
      authenticatedPage.getByText("Primeira versão formal do documento"),
    ).toBeVisible();
  } finally {
    await criticalReviewerContext.close();
    await approverContext.close();
  }
});

test("creates catalog contacts and groups in system settings and resolves document acknowledgment from the selected group", async ({
  authenticatedPage,
  orgAdmin,
}, testInfo) => {
  const prefix = testInfo.title.replace(/\W+/g, "-").toLowerCase();
  const criticalReviewer = await createUserWithDocumentsModule(
    orgAdmin.organizationId,
    orgAdmin.token,
    prefix,
    { role: "analyst", suffix: "critical-reviewer" },
  );
  const approver = await createUserWithDocumentsModule(
    orgAdmin.organizationId,
    orgAdmin.token,
    prefix,
    { role: "operator", suffix: "approver" },
  );
  const groupedRecipient = await createUserWithDocumentsModule(
    orgAdmin.organizationId,
    orgAdmin.token,
    prefix,
    { role: "operator", suffix: "group-recipient" },
  );
  const elaborator = await createEmployee(
    { organizationId: orgAdmin.organizationId },
    {
      name: `${prefix} Elaborador`,
    },
  );
  const groupedEmployee = await createEmployee(
    { organizationId: orgAdmin.organizationId },
    {
      name: `${prefix} Colaborador Grupo`,
    },
  );
  const groupedRecipientContact = await apiJson<{ id: number; name: string }>(
    `/api/organizations/${orgAdmin.organizationId}/contacts`,
    orgAdmin.token,
    {
      method: "POST",
      bodyJson: {
        sourceType: "system_user",
        sourceId: groupedRecipient.id,
        classificationType: "other",
      },
    },
  );
  const groupedEmployeeContact = await apiJson<{ id: number; name: string }>(
    `/api/organizations/${orgAdmin.organizationId}/contacts`,
    orgAdmin.token,
    {
      method: "POST",
      bodyJson: {
        sourceType: "employee",
        sourceId: groupedEmployee.id,
        classificationType: "other",
      },
    },
  );
  const groupName = `Grupo ${Date.now()}`;
  const externalContactName = `Contato externo ${Date.now()}`;
  const documentTitle = `Documento grupo ${Date.now()}`;

  await authenticatedPage
    .goto("/configuracoes/sistema");
  await expect(authenticatedPage.getByRole("tab", { name: "Usuários" })).toBeVisible();
  await expect(authenticatedPage.getByText("Contatos reutilizáveis")).toBeVisible();
  await expect(authenticatedPage.getByText("Grupos")).toBeVisible();

  await authenticatedPage
    .getByRole("button", { name: "Novo contato" })
    .click();
  const contactDialog = authenticatedPage.getByRole("dialog");
  await contactDialog
    .getByText("Nome", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill(externalContactName);
  await contactDialog
    .getByText("Email", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill(`${prefix}-external@daton.e2e`);
  await contactDialog
    .getByText("Organização / empresa", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("Fornecedor de teste");
  await contactDialog
    .getByRole("button", { name: "Criar contato" })
    .click();
  await expect(authenticatedPage.getByText(externalContactName)).toBeVisible();

  await authenticatedPage
    .getByRole("button", { name: "Novo grupo" })
    .click();
  const groupDialog = authenticatedPage.getByRole("dialog");
  await groupDialog
    .getByText("Nome", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill(groupName);
  await selectSearchableMultiOption(
    groupDialog,
    "Membros",
    "Buscar contatos...",
    groupedRecipientContact.name,
  );
  await selectSearchableMultiOption(
    groupDialog,
    "Membros",
    "Buscar contatos...",
    groupedEmployeeContact.name,
  );
  await selectSearchableMultiOption(
    groupDialog,
    "Membros",
    "Buscar contatos...",
    externalContactName,
  );
  await groupDialog.getByRole("button", { name: "Criar grupo" }).click();
  await expect(authenticatedPage.getByText(groupName)).toBeVisible();
  await expect(authenticatedPage.getByText("1 usuário • 1 colaborador • 1 externo")).toBeVisible();

  await authenticatedPage.goto("/qualidade/documentacao");

  await authenticatedPage.getByRole("button", { name: "Novo Documento" }).click();
  await authenticatedPage
    .getByPlaceholder("Ex.: Manual da Qualidade")
    .fill(documentTitle);
  await authenticatedPage.getByRole("button", { name: "Próximo" }).click();

  await selectSearchableMultiOption(
    authenticatedPage,
    "Elaboradores *",
    "Buscar colaborador...",
    elaborator.name,
  );
  await selectSearchableMultiOption(
    authenticatedPage,
    "Responsáveis pela análise crítica *",
    "Buscar responsável...",
    criticalReviewer.name,
  );
  await selectSearchableMultiOption(
    authenticatedPage,
    "Aprovadores *",
    "Buscar aprovador...",
    approver.name,
  );
  await selectSearchableMultiOption(
    authenticatedPage,
    "Grupos de destinatários",
    "Buscar grupo...",
    groupName,
  );
  await authenticatedPage.getByRole("button", { name: "Próximo" }).click();
  await authenticatedPage.getByRole("button", { name: "Próximo" }).click();
  await authenticatedPage.getByRole("button", { name: "Salvar Documento" }).click();

  await expect(authenticatedPage.getByText(documentTitle)).toBeVisible();
  const documentUrl = authenticatedPage.url();
  const docId = Number(documentUrl.split("/").pop());
  expect(docId).toBeGreaterThan(0);

  await apiJson(
    `/api/organizations/${orgAdmin.organizationId}/documents/${docId}/critical-analysis/complete`,
    criticalReviewer.token,
    {
      method: "POST",
      bodyJson: {},
    },
  );
  await apiJson(
    `/api/organizations/${orgAdmin.organizationId}/documents/${docId}/submit`,
    orgAdmin.token,
    {
      method: "POST",
      bodyJson: { changeDescription: "Versão inicial com grupo" },
    },
  );
  await apiJson(
    `/api/organizations/${orgAdmin.organizationId}/documents/${docId}/approve`,
    approver.token,
    {
      method: "POST",
      bodyJson: {},
    },
  );
  await apiJson(
    `/api/organizations/${orgAdmin.organizationId}/documents/${docId}/acknowledge`,
    groupedRecipient.token,
    {
      method: "POST",
    },
  );

  await authenticatedPage.reload();
  await expect(authenticatedPage.getByText("Distribuído")).toBeVisible();
  await expect(authenticatedPage.getByText(groupName)).toBeVisible();
  await expect(authenticatedPage.getByText(externalContactName)).toBeVisible();
  await expect(authenticatedPage.getByText(groupedEmployee.name)).toBeVisible();
  await expect(
    authenticatedPage.getByText("Confirmado", { exact: false }),
  ).toBeVisible();
});

test("edits normative requirements on document drafts and shows them on detail", async ({
  authenticatedPage,
  orgAdmin,
}, testInfo) => {
  const prefix = testInfo.title.replace(/\W+/g, "-").toLowerCase();
  const criticalReviewer = await createUserWithDocumentsModule(
    orgAdmin.organizationId,
    orgAdmin.token,
    prefix,
    { role: "analyst", suffix: "critical-reviewer" },
  );
  const approver = await createUserWithDocumentsModule(
    orgAdmin.organizationId,
    orgAdmin.token,
    prefix,
    { role: "operator", suffix: "approver" },
  );
  const recipient = await createUserWithDocumentsModule(
    orgAdmin.organizationId,
    orgAdmin.token,
    prefix,
    { role: "operator", suffix: "recipient" },
  );
  const elaborator = await createEmployee(
    { organizationId: orgAdmin.organizationId },
    {
      name: `${prefix} Elaborador`,
    },
  );

  const createdDoc = await apiJson<{ id: number }>(
    `/api/organizations/${orgAdmin.organizationId}/documents`,
    orgAdmin.token,
    {
      method: "POST",
      bodyJson: {
        title: `Documento requisitos ${Date.now()}`,
        type: "manual",
        validityDate: "2030-01-01",
        elaboratorIds: [elaborator.id],
        criticalReviewerIds: [criticalReviewer.id],
        approverIds: [approver.id],
        recipientIds: [recipient.id],
        normativeRequirements: ["ISO 9001:2015 7.5"],
      },
    },
  );

  await authenticatedPage.goto(`/qualidade/documentacao/${createdDoc.id}`);
  await expect(authenticatedPage.getByText("ISO 9001:2015 7.5")).toBeVisible();

  await authenticatedPage.getByRole("button", { name: "Editar" }).click();
  await authenticatedPage.getByRole("button", { name: "Próximo" }).click();
  await authenticatedPage.getByRole("button", { name: "Próximo" }).click();

  await authenticatedPage
    .getByRole("button", { name: "Remover ISO 9001:2015 7.5" })
    .click();
  await authenticatedPage
    .getByPlaceholder("Ex.: ISO 9001:2015 7.5")
    .fill("ISO 9001:2015 4.4");
  await authenticatedPage.getByRole("button", { name: "Adicionar" }).click();
  await authenticatedPage
    .getByPlaceholder("Ex.: ISO 9001:2015 7.5")
    .fill("ISO 14001:2015 6.1.3");
  await authenticatedPage.getByRole("button", { name: "Adicionar" }).click();
  await authenticatedPage
    .getByRole("button", { name: "Salvar Alterações" })
    .click();

  await expect(authenticatedPage.getByText("ISO 9001:2015 4.4")).toBeVisible();
  await expect(
    authenticatedPage.getByText("ISO 14001:2015 6.1.3"),
  ).toBeVisible();
  await expect(
    authenticatedPage.getByText("Requisitos normativos"),
  ).toBeVisible();
  await expect(authenticatedPage.getByText("ISO 9001:2015 7.5")).toHaveCount(0);
});
