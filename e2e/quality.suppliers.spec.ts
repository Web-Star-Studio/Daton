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

  await authenticatedPage.goto("/qualidade/fornecedores");
  await authenticatedPage.getByRole("button", { name: "Novo fornecedor" }).click();

  const dialog = authenticatedPage.getByRole("dialog", { name: "Novo fornecedor" });
  await dialog.getByLabel("Razão social *").fill(supplierName);
  await dialog.getByLabel("CNPJ").fill(`12.345.678/0001-${String(Date.now()).slice(-2)}`);
  await dialog.getByRole("button", { name: "Próximo" }).click();
  await dialog.getByLabel("Categoria").selectOption(String(category.id));
  await dialog.getByRole("button", { name: unitName }).click();
  await dialog.getByRole("button", { name: typeName }).click();
  await dialog.getByRole("button", { name: "Próximo" }).click();
  await dialog.getByLabel("E-mail").fill(`supplier-${Date.now()}@daton.test`);
  await dialog.getByRole("button", { name: "Criar fornecedor" }).click();

  await expect(authenticatedPage).toHaveURL(/\/(?:app\/)?qualidade\/fornecedores\/\d+$/);
  await expect(authenticatedPage.getByText(supplierName)).toBeVisible();

  await authenticatedPage.getByPlaceholder("Nome do produto ou serviço").fill(offeringName);
  await authenticatedPage
    .getByRole("checkbox", { name: "Marcar como escopo aprovado" })
    .click();
  await authenticatedPage.getByRole("button", { name: "Adicionar item" }).click();

  await expect(authenticatedPage.getByText(offeringName)).toBeVisible();

  await authenticatedPage.getByRole("tab", { name: "Recebimentos" }).click();
  await authenticatedPage.getByLabel("Escopo").selectOption({ label: offeringName });
  await authenticatedPage.getByLabel("Unidade").selectOption(String(unit.id));
  await authenticatedPage
    .getByLabel("Autorizador")
    .selectOption({ label: orgAdmin.adminFullName });
  await authenticatedPage.getByLabel("Data do recebimento").fill("2024-03-10");
  await authenticatedPage.getByLabel("Descrição da entrega").fill(receiptDescription);
  await authenticatedPage
    .getByLabel("Critérios de aceitação verificados")
    .fill("Inspeção visual e dimensional");
  await authenticatedPage.getByRole("button", { name: "Registrar recebimento" }).click();

  await expect(authenticatedPage.getByText(receiptDescription)).toBeVisible();

  await authenticatedPage.reload();
  await expect(authenticatedPage.getByText(offeringName)).toBeVisible();
  await expect(authenticatedPage.getByText(receiptDescription)).toBeVisible();
  expect(type.id).toBeGreaterThan(0);
});
