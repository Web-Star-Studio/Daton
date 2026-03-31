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
  const emailLocalPart = [
    prefix.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 24),
    options.suffix
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24),
  ]
    .filter(Boolean)
    .join("-");
  const email = `${emailLocalPart}@daton.test`;
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
      authenticatedPage.getByText("Sem versão aprovada").first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText("Análise crítica", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole("button", { name: "Enviar para Revisão" }),
    ).toHaveCount(0);

    await criticalReviewerPage.goto(`/qualidade/documentacao/${createdDoc.id}`);
    await expect(
      criticalReviewerPage.getByRole("button", {
        name: "Concluir análise crítica",
      }),
    ).toBeVisible();
    await criticalReviewerPage
      .getByRole("button", { name: "Concluir análise crítica" })
      .click();
    await criticalReviewerPage.reload();
    await criticalReviewerPage.getByRole("button", { name: "Fluxo" }).click();
    await expect(
      criticalReviewerPage
        .locator("div")
        .filter({ hasText: criticalReviewer.name })
        .filter({ hasText: "Concluída" })
        .first(),
    ).toBeVisible();

    await authenticatedPage.reload();
    await expect(
      authenticatedPage.getByRole("button", { name: "Enviar para Revisão" }),
    ).toBeVisible();
    await apiJson(
      `/api/organizations/${orgAdmin.organizationId}/documents/${createdDoc.id}/submit`,
      orgAdmin.token,
      {
        method: "POST",
        bodyJson: { changeDescription: "Primeira versão formal do documento" },
      },
    );
    await authenticatedPage.reload();
    await expect(
      authenticatedPage.getByText("Em Revisão", { exact: true }).first(),
    ).toBeVisible();

    await apiJson(
      `/api/organizations/${orgAdmin.organizationId}/documents/${createdDoc.id}/reject`,
      approver.token,
      {
        method: "POST",
        bodyJson: { comment: "Ajustar conteúdo antes da aprovação" },
      },
    );
    await authenticatedPage.reload();
    await expect(
      authenticatedPage.getByText("Análise crítica", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole("button", { name: "Enviar para Revisão" }),
    ).toHaveCount(0);

    await apiJson(
      `/api/organizations/${orgAdmin.organizationId}/documents/${createdDoc.id}/critical-analysis/complete`,
      criticalReviewer.token,
      {
        method: "POST",
      },
    );
    await authenticatedPage.reload();
    await expect(
      authenticatedPage.getByRole("button", {
        name: /^(Enviar|Reenviar) para Revisão$/,
      }),
    ).toBeVisible();

    await apiJson(
      `/api/organizations/${orgAdmin.organizationId}/documents/${createdDoc.id}/submit`,
      orgAdmin.token,
      {
        method: "POST",
        bodyJson: { changeDescription: "Primeira versão formal do documento" },
      },
    );
    await apiJson(
      `/api/organizations/${orgAdmin.organizationId}/documents/${createdDoc.id}/approve`,
      approver.token,
      {
        method: "POST",
        bodyJson: {},
      },
    );
    await authenticatedPage.reload();
    await expect(
      authenticatedPage.getByText("Distribuído", { exact: true }).first(),
    ).toBeVisible();

    await authenticatedPage.reload();
    await expect(authenticatedPage.getByText("v1").first()).toBeVisible();
    await authenticatedPage.getByRole("button", { name: "Versões" }).click();
    await expect(
      authenticatedPage
        .getByText("Primeira versão formal do documento", { exact: true })
        .first(),
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
  const externalContactEmail = `${prefix
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)}-external@daton.test`;
  const documentTitle = `Documento grupo ${Date.now()}`;

  const externalContact = await apiJson<{ id: number; name: string }>(
    `/api/organizations/${orgAdmin.organizationId}/contacts`,
    orgAdmin.token,
    {
      method: "POST",
      bodyJson: {
        sourceType: "external_contact",
        name: externalContactName,
        email: externalContactEmail,
        organizationName: "Fornecedor de teste",
        classificationType: "other",
      },
    },
  );

  const createdGroup = await apiJson<{ id: number; name: string }>(
    `/api/organizations/${orgAdmin.organizationId}/contact-groups`,
    orgAdmin.token,
    {
      method: "POST",
      bodyJson: {
        name: groupName,
        contactIds: [
          groupedRecipientContact.id,
          groupedEmployeeContact.id,
          externalContact.id,
        ],
      },
    },
  );

  await authenticatedPage
    .goto("/configuracoes/sistema");
  await expect(authenticatedPage.getByRole("tab", { name: "Usuários" })).toBeVisible();
  await expect(authenticatedPage.getByText("Contatos reutilizáveis")).toBeVisible();
  await expect(authenticatedPage.getByText("Grupos")).toBeVisible();
  await expect(
    authenticatedPage.getByText(externalContactName, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    authenticatedPage.getByText(groupName, { exact: true }).first(),
  ).toBeVisible();
  await expect(authenticatedPage.getByText("1 usuário • 1 colaborador • 1 externo")).toBeVisible();
  const createdDoc = await apiJson<{ id: number }>(
    `/api/organizations/${orgAdmin.organizationId}/documents`,
    orgAdmin.token,
    {
      method: "POST",
      bodyJson: {
        title: documentTitle,
        type: "manual",
        validityDate: "2030-01-01",
        elaboratorIds: [elaborator.id],
        criticalReviewerIds: [criticalReviewer.id],
        approverIds: [approver.id],
        recipientGroupIds: [createdGroup.id],
      },
    },
  );
  const docId = createdDoc.id;

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

  await authenticatedPage.goto(`/qualidade/documentacao/${docId}`);
  await expect(
    authenticatedPage.getByText("Distribuído", { exact: true }).first(),
  ).toBeVisible();
  await authenticatedPage.getByRole("button", { name: "Fluxo" }).click();
  await expect(
    authenticatedPage.getByText(groupName, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    authenticatedPage.getByText(externalContactName, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    authenticatedPage.getByText(groupedEmployee.name, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    authenticatedPage.getByText("Confirmado", { exact: false }).first(),
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
  await expect(
    authenticatedPage.getByText("ISO 9001:2015 7.5", { exact: true }).first(),
  ).toBeVisible();

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

  await expect(
    authenticatedPage.getByText("ISO 9001:2015 4.4", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    authenticatedPage
      .getByText("ISO 14001:2015 6.1.3", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    authenticatedPage.getByText("Requisitos normativos", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    authenticatedPage.getByText("ISO 9001:2015 7.5", { exact: true }),
  ).toHaveCount(0);
});
