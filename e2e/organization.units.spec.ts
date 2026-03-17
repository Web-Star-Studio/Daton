import { expect, test } from "./fixtures/auth";

test("creates a unit and opens its detail page", async ({
  authenticatedPage,
}) => {
  const unitName = `Filial ${Date.now()}`;

  await authenticatedPage.goto("/organizacao");
  await authenticatedPage.getByRole("button", { name: "Unidades" }).click();
  await authenticatedPage.getByRole("button", { name: "Nova Unidade" }).click();

  const dialog = authenticatedPage.getByRole("dialog", {
    name: "Nova Unidade",
  });
  await dialog.getByLabel("Nome").fill(unitName);
  await dialog.getByLabel("Tipo").selectOption("filial");
  await dialog.getByLabel("Cidade").fill("Recife");
  await dialog.getByLabel("Estado (UF)").fill("PE");
  await dialog.getByLabel("País").fill("Brasil");
  await dialog.getByRole("button", { name: "Salvar" }).click();

  await expect(authenticatedPage.getByText(unitName)).toBeVisible();
  await authenticatedPage.getByText(unitName).first().click();

  await expect(authenticatedPage).toHaveURL(/\/organizacao\/unidades\/\d+$/);
  await expect(
    authenticatedPage.getByText("Visão Geral da Unidade"),
  ).toBeVisible();
  await expect(authenticatedPage.getByText(unitName).first()).toBeVisible();
  await expect(authenticatedPage.getByText("Recife, PE, Brasil")).toBeVisible();
});
