import { expect, test } from "./fixtures/auth";

test("creates and edits a position in the organization module", async ({
  authenticatedPage,
}) => {
  const positionName = `Cargo ${Date.now()}`;
  const updatedEducation = "Ensino superior completo";

  await authenticatedPage.goto("/organizacao/cargos");
  await authenticatedPage.getByRole("button", { name: "Novo Cargo" }).click();

  const dialog = authenticatedPage.getByRole("dialog", {
    name: "Novo Cargo",
  });
  await dialog.getByLabel("Nome").fill(positionName);
  await dialog.getByLabel("Descrição").fill("Cargo criado no fluxo E2E.");
  await dialog.getByRole("button", { name: "Próximo" }).click();
  await dialog.getByLabel("Escolaridade").fill("Ensino técnico");
  await dialog.getByLabel("Experiência").fill("2 anos");
  await dialog.getByRole("button", { name: "Próximo" }).click();
  await dialog.getByLabel("Requisitos").fill("ISO 9001\nInspeção de recebimento");
  await dialog.getByLabel("Responsabilidades").fill("Avaliar produtos recebidos");
  await dialog.getByRole("button", { name: "Salvar" }).click();

  await expect(authenticatedPage.getByText(positionName)).toBeVisible();

  await authenticatedPage.getByRole("row", { name: new RegExp(positionName) }).click();

  const editDialog = authenticatedPage.getByRole("dialog", {
    name: "Editar Cargo",
  });
  await editDialog.getByRole("button", { name: "Anterior" }).click();
  await editDialog.getByLabel("Escolaridade").fill(updatedEducation);
  await editDialog.getByRole("button", { name: "Próximo" }).click();
  await editDialog.getByRole("button", { name: "Salvar" }).click();

  await expect(authenticatedPage.getByText(updatedEducation)).toBeVisible();

  await authenticatedPage.reload();
  await expect(authenticatedPage.getByText(positionName)).toBeVisible();
  await expect(authenticatedPage.getByText(updatedEducation)).toBeVisible();
});
