import { expect, test } from "./fixtures/auth";
import { apiJson } from "./support/api";

test("creates a unit and opens its detail page", async ({
  authenticatedPage,
  orgAdmin,
}) => {
  const unitName = `Filial ${Date.now()}`;

  await apiJson<{ id: number }>(
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

  await authenticatedPage.goto("/organizacao/unidades");

  await expect(authenticatedPage.getByText(unitName)).toBeVisible();
  await authenticatedPage.getByText(unitName).first().click();

  await expect(authenticatedPage).toHaveURL(/\/organizacao\/unidades\/\d+$/);
  await expect(
    authenticatedPage.getByText("Visão Geral da Unidade"),
  ).toBeVisible();
  await expect(authenticatedPage.getByText(unitName).first()).toBeVisible();
  await expect(authenticatedPage.getByText("Recife, PE, Brasil")).toBeVisible();
});
