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

  // Step 0 – Básico (all labels lack htmlFor; use placeholders)
  await dialog.getByPlaceholder("Título do cargo").fill(positionName);
  await dialog.getByPlaceholder("Ex: Ensino Superior em Engenharia").fill("Ensino técnico");
  await dialog.getByPlaceholder("Ex: 2 anos na área").fill("2 anos");

  // Jump to the last step via the step tab button
  await dialog.getByRole("button", { name: "Adicional" }).click();
  await dialog.getByRole("button", { name: "Salvar" }).click();

  await expect(authenticatedPage.getByText(positionName)).toBeVisible();

  await authenticatedPage.getByRole("row", { name: new RegExp(positionName) }).click();

  const editDialog = authenticatedPage.getByRole("dialog", {
    name: "Editar Cargo",
  });

  // Edit dialog opens at step 0 – update education in place
  await editDialog.getByPlaceholder("Ex: Ensino Superior em Engenharia").fill(updatedEducation);

  // Jump to last step and save (edit uses "Atualizar")
  await editDialog.getByRole("button", { name: "Adicional" }).click();
  await editDialog.getByRole("button", { name: "Atualizar" }).click();

  await expect(authenticatedPage.getByText(updatedEducation)).toBeVisible();

  await authenticatedPage.reload();
  await expect(authenticatedPage.getByText(positionName)).toBeVisible();
  await expect(authenticatedPage.getByText(updatedEducation)).toBeVisible();
});
