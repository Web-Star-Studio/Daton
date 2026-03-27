import { test, expect } from "./fixtures/auth";
import { API_BASE_URL } from "./support/config";
import { makeTestPrefix } from "./support/data";
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

async function selectSearchableOption(
  root: import("@playwright/test").Page | import("@playwright/test").Locator,
  fieldLabel: string,
  searchPlaceholder: string,
  optionLabel: string,
) {
  const field = root.getByText(fieldLabel, { exact: true }).locator("xpath=..");
  await field.getByRole("combobox").click();
  await root.getByPlaceholder(searchPlaceholder).fill(optionLabel);
  await root.getByText(optionLabel, { exact: true }).click();
}

test("navigates the document creation form through all required steps and creates the document", async ({
  authenticatedPage,
  orgAdmin,
}, testInfo) => {
  const prefix = makeTestPrefix(testInfo.title);

  const elaborator = await createEmployee(
    { organizationId: orgAdmin.organizationId },
    { name: `${prefix} Elaborador` },
  );

  const criticalReviewer = await apiJson<{ id: number; name: string }>(
    `/api/organizations/${orgAdmin.organizationId}/users`,
    orgAdmin.token,
    {
      method: "POST",
      bodyJson: {
        name: `${prefix} Revisor`,
        email: `${prefix}-revisor@e2e.daton.example`,
        password: "DatonE2E!123",
        role: "analyst",
        modules: ["documents"],
      },
    },
  );

  const approver = await apiJson<{ id: number; name: string }>(
    `/api/organizations/${orgAdmin.organizationId}/users`,
    orgAdmin.token,
    {
      method: "POST",
      bodyJson: {
        name: `${prefix} Aprovador`,
        email: `${prefix}-aprovador@e2e.daton.example`,
        password: "DatonE2E!123",
        role: "operator",
        modules: ["documents"],
      },
    },
  );

  const recipient = await apiJson<{ id: number; name: string }>(
    `/api/organizations/${orgAdmin.organizationId}/users`,
    orgAdmin.token,
    {
      method: "POST",
      bodyJson: {
        name: `${prefix} Destinatario`,
        email: `${prefix}-dest@e2e.daton.example`,
        password: "DatonE2E!123",
        role: "operator",
        modules: ["documents"],
      },
    },
  );

  const documentTitle = `Doc E2E ${Date.now()}`;

  await authenticatedPage.goto("/qualidade/documentacao");
  await authenticatedPage.getByRole("button", { name: "Novo Documento" }).click();

  // Step 1 – Básico
  await expect(
    authenticatedPage.getByPlaceholder("Ex.: Manual da Qualidade"),
  ).toBeVisible();
  await authenticatedPage
    .getByPlaceholder("Ex.: Manual da Qualidade")
    .fill(documentTitle);
  await authenticatedPage.getByRole("button", { name: "Próximo" }).click();

  // Step 2 – Responsáveis
  await expect(authenticatedPage.getByText("Elaboradores *")).toBeVisible();
  await selectSearchableOption(
    authenticatedPage,
    "Elaboradores *",
    "Buscar colaborador...",
    elaborator.name,
  );
  await selectSearchableOption(
    authenticatedPage,
    "Responsáveis pela análise crítica *",
    "Buscar responsável...",
    criticalReviewer.name,
  );
  await selectSearchableOption(
    authenticatedPage,
    "Aprovadores *",
    "Buscar aprovador...",
    approver.name,
  );
  await selectSearchableOption(
    authenticatedPage,
    "Destinatários (protocolo de recebimento) *",
    "Buscar destinatário...",
    recipient.name,
  );
  await authenticatedPage.getByRole("button", { name: "Próximo" }).click();

  // Step 3 – Escopo
  await expect(
    authenticatedPage.getByText("Referências a outros documentos"),
  ).toBeVisible();
  await authenticatedPage.getByRole("button", { name: "Próximo" }).click();

  // Step 4 – Anexos or direct submission depending on app version.
  // If the dialog stayed open (Anexos step shown), click Save explicitly.
  const saveButton = authenticatedPage.getByRole("button", {
    name: "Salvar Documento",
  });
  const saveVisible = await saveButton
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  if (saveVisible) {
    await saveButton.click();
  }

  // The document must be created and the detail page must open
  await expect(authenticatedPage).toHaveURL(
    /\/qualidade\/documentacao\/\d+$/,
    { timeout: 15000 },
  );
  await expect(
    authenticatedPage.getByRole("heading", { name: documentTitle }),
  ).toBeVisible();
});
