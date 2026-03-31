import { expect, test } from "./fixtures/auth";
import { apiJson } from "./support/api";

test("creates and edits a position in the organization module", async ({
  authenticatedPage,
  orgAdmin,
}) => {
  const positionName = `Cargo ${Date.now()}`;
  const updatedEducation = "Ensino superior completo";

  await apiJson<{ id: number }>(
    `/api/organizations/${orgAdmin.organizationId}/positions`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        name: positionName,
        description: "Cargo criado no fluxo E2E.",
        education: "Ensino técnico",
        experience: "2 anos",
        requirements: "ISO 9001\nInspeção de recebimento",
        responsibilities: "Avaliar produtos recebidos",
      },
    },
  );

  await authenticatedPage.goto("/organizacao/cargos");

  await expect(authenticatedPage.getByText(positionName)).toBeVisible();

  await authenticatedPage.getByRole("row", { name: new RegExp(positionName) }).click();

  const editDialog = authenticatedPage.getByRole("dialog", {
    name: "Editar Cargo",
  });
  await editDialog
    .getByText("Escolaridade", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill(updatedEducation);
  await editDialog.getByRole("button", { name: "Próximo" }).click();
  await editDialog.getByRole("button", { name: "Próximo" }).click();
  await editDialog.getByRole("button", { name: "Próximo" }).click();
  await editDialog.getByRole("button", { name: "Próximo" }).click();
  await editDialog.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(editDialog).not.toBeVisible();

  await expect(authenticatedPage.getByText(updatedEducation)).toBeVisible();

  await authenticatedPage.reload();
  await expect(authenticatedPage.getByText(positionName)).toBeVisible();
  await expect(authenticatedPage.getByText(updatedEducation)).toBeVisible();
});
