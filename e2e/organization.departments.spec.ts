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

  const dept = await apiJson<{ id: number }>(
    `/api/organizations/${orgAdmin.organizationId}/departments`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: { name: departmentName, unitIds: [unit.id] },
    },
  );

  await authenticatedPage.goto("/organizacao/departamentos");

  await expect(authenticatedPage.getByText(departmentName)).toBeVisible();
  await expect(authenticatedPage.getByText(unitName)).toBeVisible();

  await authenticatedPage.getByRole("row", { name: new RegExp(departmentName) }).click();

  const editDialog = authenticatedPage.getByRole("dialog", {
    name: "Editar Departamento",
  });

  // Step 0 – edit name
  await editDialog.getByPlaceholder("Nome do departamento").fill(updatedDepartmentName);
  await editDialog.getByRole("button", { name: "Próximo" }).click();

  // Step 1 – save (edit uses "Atualizar"); use evaluate() to bypass animation stability check
  await authenticatedPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const btn = btns.find((b) => b.textContent?.trim() === "Atualizar");
    btn?.click();
  });

  await expect(authenticatedPage.getByText(updatedDepartmentName)).toBeVisible();

  await authenticatedPage.reload();
  await expect(authenticatedPage.getByText(updatedDepartmentName)).toBeVisible();
  await expect(authenticatedPage.getByText(unitName)).toBeVisible();
  expect(unit.id).toBeGreaterThan(0);
  expect(dept.id).toBeGreaterThan(0);
});
