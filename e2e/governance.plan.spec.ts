import { expect, test } from "./fixtures/auth";

test("creates a governance draft plan", async ({ authenticatedPage }) => {
  const title = `Plano E2E ${Date.now()}`;

  await authenticatedPage.goto("/governanca/planejamento");
  await authenticatedPage.getByRole("button", { name: "Novo plano" }).click();

  const dialog = authenticatedPage.getByRole("dialog", {
    name: "Novo Planejamento",
  });
  await dialog.getByLabel("Título do plano").fill(title);
  await dialog.getByRole("button", { name: "Criar rascunho" }).click();

  await expect(authenticatedPage).toHaveURL(/\/governanca\/planejamento\/\d+$/);
  await expect(authenticatedPage.getByLabel("Título")).toHaveValue(title);
  await expect(
    authenticatedPage.getByRole("button", { name: "Enviar para revisão" }),
  ).toBeVisible();
});
