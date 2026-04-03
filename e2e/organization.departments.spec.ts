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

  const createdDepartment = await apiJson<{ id: number }>(
    `/api/organizations/${orgAdmin.organizationId}/departments`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        name: departmentName,
        unitIds: [unit.id],
      },
    },
  );

  await authenticatedPage.goto("/organizacao/departamentos");
  await expect(authenticatedPage.getByText(departmentName)).toBeVisible();
  await expect(authenticatedPage.getByText(unitName)).toBeVisible();

  await apiJson(
    `/api/organizations/${orgAdmin.organizationId}/departments/${createdDepartment.id}`,
    {
      token: orgAdmin.token,
      method: "PATCH",
      body: {
        name: updatedDepartmentName,
        unitIds: [unit.id],
      },
    },
  );

  await authenticatedPage.reload();

  await expect(authenticatedPage.getByText(updatedDepartmentName)).toBeVisible();

  await authenticatedPage.reload();
  await expect(authenticatedPage.getByText(updatedDepartmentName)).toBeVisible();
  await expect(authenticatedPage.getByText(unitName)).toBeVisible();
  await expect(unit.id).toBeGreaterThan(0);
});
