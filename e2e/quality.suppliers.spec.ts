import { expect, test } from "./fixtures/auth";
import { apiJson } from "./support/api";
import { getCurrentUser } from "./support/governance";

test("creates a supplier, adds an offering and registers a receipt", async ({
  authenticatedPage,
  orgAdmin,
}) => {
  const categoryName = `Categoria ${Date.now()}`;
  const typeName = `Tipo ${Date.now()}`;
  const unitName = `Unidade SUP ${Date.now()}`;
  const supplierName = `Fornecedor ${Date.now()}`;
  const offeringName = `Item ${Date.now()}`;
  const receiptDescription = `Recebimento ${Date.now()}`;
  const currentUser = await getCurrentUser(orgAdmin);

  const category = await apiJson<{ id: number }>(
    `/api/organizations/${orgAdmin.organizationId}/supplier-categories`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: { name: categoryName, status: "active" },
    },
  );

  const type = await apiJson<{ id: number }>(
    `/api/organizations/${orgAdmin.organizationId}/supplier-types`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: { name: typeName, categoryId: category.id, status: "active" },
    },
  );

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

  const supplier = await apiJson<{ id: number }>(
    `/api/organizations/${orgAdmin.organizationId}/suppliers`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        personType: "pj",
        legalIdentifier: `12.345.678/0001-${String(Date.now()).slice(-2)}`,
        legalName: supplierName,
        categoryId: category.id,
        unitIds: [unit.id],
        typeIds: [type.id],
        email: `supplier-${Date.now()}@daton.test`,
        status: "draft",
        criticality: "medium",
      },
    },
  );

  await apiJson(
    `/api/organizations/${orgAdmin.organizationId}/suppliers/${supplier.id}/offerings`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        name: offeringName,
        offeringType: "product",
        status: "active",
        isApprovedScope: true,
      },
    },
  );

  await authenticatedPage.goto(`/qualidade/fornecedores/${supplier.id}`);
  await expect(
    authenticatedPage.getByRole("heading", { name: supplierName, exact: true }),
  ).toBeVisible();

  await expect(authenticatedPage.getByText(offeringName)).toBeVisible();

  await authenticatedPage.getByRole("tab", { name: "Recebimentos" }).click();
  await authenticatedPage
    .getByText("Escopo", { exact: true })
    .locator("xpath=..")
    .locator("select")
    .selectOption({ label: offeringName });
  await authenticatedPage
    .getByText("Unidade", { exact: true })
    .locator("xpath=..")
    .locator("select")
    .selectOption(String(unit.id));
  await authenticatedPage
    .getByText("Autorizador", { exact: true })
    .locator("xpath=..")
    .locator("select")
    .selectOption(String(currentUser.id));
  await authenticatedPage
    .getByText("Data do recebimento", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("2024-03-10");
  await authenticatedPage
    .getByText("Descrição da entrega", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill(receiptDescription);
  await authenticatedPage
    .getByText("Critérios de aceitação verificados", { exact: true })
    .locator("xpath=..")
    .locator("textarea")
    .fill("Inspeção visual e dimensional");
  await authenticatedPage.getByRole("button", { name: "Registrar recebimento" }).click();

  await expect(authenticatedPage.getByText(receiptDescription)).toBeVisible();

  await authenticatedPage.reload();
  await expect(authenticatedPage.getByText(offeringName)).toBeVisible();
  await authenticatedPage.getByRole("tab", { name: /Recebimentos/ }).click();
  await expect(authenticatedPage.getByText(receiptDescription)).toBeVisible();
  expect(type.id).toBeGreaterThan(0);
});
