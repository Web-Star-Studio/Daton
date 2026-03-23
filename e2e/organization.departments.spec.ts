import { expect, test } from "./fixtures/auth";
import { apiJson } from "./support/api";

test("creates and edits a department with linked units", async ({
  authenticatedPage,
  orgAdmin,
}) => {
  const unitName = `Unidade DEP ${Date.now()}`;
  const departmentName = `Departamento ${Date.now()}`;
  const updatedDepartmentName = `${departmentName} Atualizado`;

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

  await authenticatedPage.goto("/organizacao/departamentos");
  await authenticatedPage.getByRole("button", { name: "Novo Departamento" }).click();

  const dialog = authenticatedPage.getByRole("dialog", {
    name: "Novo Departamento",
  });
  await dialog.getByLabel("Nome").fill(departmentName);
  await dialog.getByRole("button", { name: "Próximo" }).click();
  await dialog.getByRole("button", { name: unitName }).click();
  await dialog.getByRole("button", { name: "Salvar" }).click();

  await expect(authenticatedPage.getByText(departmentName)).toBeVisible();
  await expect(authenticatedPage.getByText(unitName)).toBeVisible();

  await authenticatedPage.getByRole("row", { name: new RegExp(departmentName) }).click();

  const editDialog = authenticatedPage.getByRole("dialog", {
    name: "Editar Departamento",
  });
  await editDialog.getByLabel("Nome").fill(updatedDepartmentName);
  await editDialog.getByRole("button", { name: "Salvar" }).click();

  await expect(authenticatedPage.getByText(updatedDepartmentName)).toBeVisible();

  await authenticatedPage.reload();
  await expect(authenticatedPage.getByText(updatedDepartmentName)).toBeVisible();
  await expect(authenticatedPage.getByText(unitName)).toBeVisible();
  await expect(unit.id).toBeGreaterThan(0);
});
