import { expect, test } from "./fixtures/auth";
import { apiJson } from "./support/api";

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
  const cnpj = `12.345.678/0001-${String(Date.now()).slice(-2)}`;
  const supplierEmail = `supplier-${Date.now()}@daton.test`;

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

  // Create catalog item so it can be linked to the supplier as an offering
  const catalogItem = await apiJson<{ id: number }>(
    `/api/organizations/${orgAdmin.organizationId}/supplier-catalog-items`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: { name: offeringName, offeringType: "service", status: "active" },
    },
  );

  await authenticatedPage.goto("/qualidade/fornecedores");
  await authenticatedPage.getByRole("button", { name: "Novo fornecedor" }).click();

  const dialog = authenticatedPage.getByRole("dialog", { name: "Novo fornecedor" });

  // Step 0 – Identificação (labels use className, no htmlFor; use placeholders)
  await dialog.getByPlaceholder("Razão social da empresa").fill(supplierName);
  await dialog.getByPlaceholder("00.000.000/0000-00").fill(cnpj);
  await dialog.getByRole("button", { name: "Próximo" }).click();

  // Step 1 – Classificação
  // Categoria is the first select in this step
  await dialog.locator("select").first().selectOption(String(category.id));

  // Unidades vinculadas uses SearchableMultiSelect (popover renders outside dialog via portal)
  await dialog.getByText("Unidades vinculadas", { exact: true }).locator("xpath=..").getByRole("combobox").click();
  await authenticatedPage.getByPlaceholder("Buscar unidade").fill(unitName);
  await authenticatedPage.getByLabel("Suggestions").getByText(unitName, { exact: true }).click();
  // Close the suggestions popover before opening the next one
  await authenticatedPage.keyboard.press("Escape");
  await authenticatedPage.waitForTimeout(150);

  // Tipos de fornecedor uses SearchableMultiSelect
  await dialog.getByText("Tipos de fornecedor", { exact: true }).locator("xpath=..").getByRole("combobox").click();
  await authenticatedPage.getByPlaceholder("Buscar tipo").fill(typeName);
  await authenticatedPage.getByLabel("Suggestions").getByText(typeName, { exact: true }).click();
  // Close the suggestions popover before clicking Próximo
  await authenticatedPage.keyboard.press("Escape");
  await authenticatedPage.waitForTimeout(150);

  await dialog.getByRole("button", { name: "Próximo" }).click();

  // Step 2 – Contato
  await dialog.getByPlaceholder("contato@empresa.com").fill(supplierEmail);
  await dialog.getByRole("button", { name: "Criar fornecedor" }).click();

  await expect(authenticatedPage).toHaveURL(/\/(?:app\/)?qualidade\/fornecedores\/\d+$/);
  await expect(authenticatedPage.getByText(supplierName).first()).toBeVisible();

  // Link the catalog item to the supplier via API (offerings are now managed through catalog items)
  const supplierId = Number(authenticatedPage.url().match(/\/fornecedores\/(\d+)/)?.[1]);
  await apiJson(
    `/api/organizations/${orgAdmin.organizationId}/suppliers/${supplierId}`,
    {
      token: orgAdmin.token,
      method: "PATCH",
      body: {
        personType: "pj",
        legalIdentifier: cnpj,
        legalName: supplierName,
        categoryId: category.id,
        typeIds: [type.id],
        unitIds: [unit.id],
        catalogItemIds: [catalogItem.id],
        email: supplierEmail,
      },
    },
  );

  await authenticatedPage.reload();
  await expect(authenticatedPage.getByText(offeringName)).toBeVisible();

  await authenticatedPage.getByRole("tab", { name: "Recebimentos" }).click();
  // FieldLabel renders <label> without htmlFor, so getByLabel() won't work — use data-slot="field" filters instead
  const field = (text: string) =>
    authenticatedPage.locator("[data-slot='field']").filter({ hasText: text });
  await field("Escopo").locator("select").selectOption({ label: offeringName });
  await field("Unidade").locator("select").selectOption(String(unit.id));
  await field("Autorizador").locator("select").selectOption({ label: orgAdmin.adminFullName.toUpperCase() });
  await field("Data do recebimento").locator("input").fill("2024-03-10");
  await field("Descrição da entrega").locator("input").fill(receiptDescription);
  await field("Critérios de aceitação verificados").locator("textarea").fill("Inspeção visual e dimensional");
  await authenticatedPage.getByRole("button", { name: "Registrar recebimento" }).click();

  await expect(authenticatedPage.getByText(receiptDescription)).toBeVisible();

  await authenticatedPage.reload();
  await expect(authenticatedPage.getByText(offeringName)).toBeVisible();
  await authenticatedPage.getByRole("tab", { name: "Recebimentos" }).click();
  await expect(authenticatedPage.getByText(receiptDescription)).toBeVisible();
  expect(type.id).toBeGreaterThan(0);
});
