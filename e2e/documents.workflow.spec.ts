import { test, expect } from "./fixtures/auth";
import { API_BASE_URL, WEB_BASE_URL, WEB_ORIGIN } from "./support/config";

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

async function createOperatorWithDocumentsModule(
  orgId: number,
  adminToken: string,
  prefix: string,
) {
  const email = `${prefix}-reviewer@daton.e2e`;
  const password = "DatonE2E!123";

  const user = await apiJson<{ id: number; name: string; email: string }>(
    `/api/organizations/${orgId}/users`,
    adminToken,
    {
      method: "POST",
      bodyJson: {
        name: `${prefix} Reviewer`,
        email,
        password,
        role: "operator",
        modules: ["documents"],
      },
    },
  );

  const login = await apiJson<{ token: string }>(`/api/auth/login`, adminToken, {
    method: "POST",
    bodyJson: { email, password },
  });

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

test("formal version is created only after approval and only creator can submit", async ({
  authenticatedPage,
  browser,
  orgAdmin,
}, testInfo) => {
  const prefix = testInfo.title.replace(/\W+/g, "-").toLowerCase();
  const reviewer = await createOperatorWithDocumentsModule(
    orgAdmin.organizationId,
    orgAdmin.token,
    prefix,
  );
  const attachment = await uploadCsvAttachment(orgAdmin.token);
  const title = `Documento E2E ${Date.now()}`;

  const createdDoc = await apiJson<{
    id: number;
    currentVersion: number;
    versions?: Array<{ versionNumber: number }>;
  }>(`/api/organizations/${orgAdmin.organizationId}/documents`, orgAdmin.token, {
    method: "POST",
    bodyJson: {
      title,
      type: "manual",
      validityDate: "2030-01-01",
      approverIds: [reviewer.id],
      recipientIds: [reviewer.id],
      attachments: [
        {
          fileName: "evidencia.csv",
          fileSize: attachment.fileSize,
          contentType: attachment.contentType,
          objectPath: attachment.objectPath,
        },
      ],
    },
  });

  expect(createdDoc.currentVersion).toBe(0);
  expect(createdDoc.versions || []).toHaveLength(0);

  const reviewerContext = await browser.newContext({
    baseURL: WEB_BASE_URL,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: WEB_ORIGIN,
          localStorage: [{ name: "daton_token", value: reviewer.token }],
        },
      ],
    },
  });
  const reviewerPage = await reviewerContext.newPage();

  try {
    await authenticatedPage.goto(`/qualidade/documentacao/${createdDoc.id}`);
    await expect(authenticatedPage.getByText("Sem versão aprovada")).toBeVisible();
    await expect(
      authenticatedPage.getByRole("button", { name: "Enviar para Revisão" }),
    ).toBeVisible();

    await authenticatedPage.getByRole("button", { name: "Anexos" }).click();
    await expect(
      authenticatedPage.getByRole("button", { name: "Visualizar" }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole("button", { name: "Baixar" }),
    ).toBeVisible();

    await reviewerPage.goto(`/qualidade/documentacao/${createdDoc.id}`);
    await expect(
      reviewerPage.getByRole("button", { name: "Enviar para Revisão" }),
    ).toHaveCount(0);

    await authenticatedPage.getByRole("button", { name: "Enviar para Revisão" }).click();
    await authenticatedPage
      .getByLabel("Descrição da versão *")
      .fill("Primeira versão formal do documento");
    await authenticatedPage
      .getByRole("button", { name: "Enviar para Revisão" })
      .last()
      .click();
    await expect(authenticatedPage.getByText("Em Revisão")).toBeVisible();

    await reviewerPage.reload();
    await expect(
      reviewerPage.getByRole("button", { name: "Aprovar" }),
    ).toBeVisible();
    await reviewerPage.getByRole("button", { name: "Aprovar" }).click();
    await expect(reviewerPage.getByText("Distribuído")).toBeVisible();

    await authenticatedPage.reload();
    await expect(authenticatedPage.getByText("v1")).toBeVisible();
    await authenticatedPage.getByRole("button", { name: "Versões" }).click();
    await expect(
      authenticatedPage.getByText("Primeira versão formal do documento"),
    ).toBeVisible();
  } finally {
    await reviewerContext.close();
  }
});
