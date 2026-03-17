import { expect, test } from "./fixtures/auth";

test("creates a legislation and opens its detail page", async ({
  authenticatedPage,
}) => {
  const title = `Legislação E2E ${Date.now()}`;
  const number = `LEI ${Date.now()}`;

  await authenticatedPage.goto("/qualidade/legislacoes");
  await authenticatedPage
    .getByRole("button", { name: "Nova Legislação" })
    .click();

  const dialog = authenticatedPage.getByRole("dialog", {
    name: "Cadastrar Legislação",
  });
  await dialog.getByLabel("Título").fill(title);
  await dialog.getByLabel("Número").fill(number);
  await dialog.getByLabel("Data de publicação").fill("2024-01-15");
  await dialog.getByLabel("Nível / Esfera").selectOption("federal");
  await dialog
    .getByLabel("Descrição / Ementa")
    .fill("Legislação criada pelo fluxo E2E.");
  await dialog.getByRole("button", { name: "Salvar" }).click();

  await expect(authenticatedPage.getByText(title)).toBeVisible();
  await authenticatedPage.getByText(title).click();

  await expect(authenticatedPage).toHaveURL(/\/qualidade\/legislacoes\/\d+$/);
  await expect(authenticatedPage.getByText(title)).toBeVisible();
  await expect(authenticatedPage.getByText(number)).toBeVisible();
});
