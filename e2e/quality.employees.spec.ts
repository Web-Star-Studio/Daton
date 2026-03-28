import { expect, test } from "./fixtures/auth";
import { apiJson } from "./support/api";

test("creates an employee with profile history and opens the detail page", async ({
  authenticatedPage,
  orgAdmin,
}) => {
  const unitName = `Unidade RH ${Date.now()}`;
  const departmentName = `Qualidade ${Date.now()}`;
  const positionName = `Analista ${Date.now()}`;
  const employeeName = `Colaborador ${Date.now()}`;
  const experienceTitle = `Experiência ${Date.now()}`;

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

  await apiJson(`/api/organizations/${orgAdmin.organizationId}/departments`, {
    token: orgAdmin.token,
    method: "POST",
    body: {
      name: departmentName,
      unitIds: [unit.id],
    },
  });

  await apiJson(`/api/organizations/${orgAdmin.organizationId}/positions`, {
    token: orgAdmin.token,
    method: "POST",
    body: {
      name: positionName,
    },
  });

  const employee = await apiJson<{ id: number }>(
    `/api/organizations/${orgAdmin.organizationId}/employees`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        name: employeeName,
        email: `colab-${Date.now()}@daton.test`,
        admissionDate: "2024-03-10",
        department: departmentName,
        position: positionName,
        unitId: unit.id,
        contractType: "clt",
        professionalExperiences: [
          {
            title: experienceTitle,
            description: "Atuação em recebimento e inspeção.",
          },
        ],
      },
    },
  );

  await authenticatedPage.goto("/organizacao/colaboradores");

  await expect(authenticatedPage.getByText(employeeName)).toBeVisible();

  await authenticatedPage.getByRole("link", { name: employeeName }).click();

  await expect(authenticatedPage).toHaveURL(/\/organizacao\/colaboradores\/\d+$/);
  await expect(authenticatedPage.getByText(employeeName).first()).toBeVisible();
  await expect(authenticatedPage.getByText(experienceTitle)).toBeVisible();
  expect(employee.id).toBeGreaterThan(0);
});
