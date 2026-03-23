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

  await authenticatedPage.goto("/organizacao/colaboradores");
  await authenticatedPage.getByRole("button", { name: "Novo Colaborador" }).click();

  const dialog = authenticatedPage.getByRole("dialog", {
    name: "Novo colaborador",
  });
  await dialog.getByLabel("Nome completo *").fill(employeeName);
  await dialog.getByLabel("E-mail").fill(`colab-${Date.now()}@daton.test`);
  await dialog.getByRole("button", { name: "Próximo" }).click();
  await dialog.getByLabel("Departamento").selectOption(departmentName);
  await dialog.getByLabel("Cargo").selectOption(positionName);
  await dialog.getByLabel("Unidade").selectOption(String(unit.id));
  await dialog.getByLabel("Data de admissão *").fill("2024-03-10");
  await dialog.getByRole("button", { name: "Próximo" }).click();
  await dialog
    .getByRole("button", { name: "Adicionar item" })
    .first()
    .click();
  await dialog.getByLabel("Título *").fill(experienceTitle);
  await dialog.getByLabel("Descrição").fill("Atuação em recebimento e inspeção.");
  await dialog.getByRole("button", { name: "Criar colaborador" }).click();

  await expect(authenticatedPage.getByText(employeeName)).toBeVisible();

  await authenticatedPage.getByRole("link", { name: employeeName }).click();

  await expect(authenticatedPage).toHaveURL(/\/organizacao\/colaboradores\/\d+$/);
  await expect(authenticatedPage.getByText(employeeName)).toBeVisible();
  await expect(authenticatedPage.getByText(experienceTitle)).toBeVisible();
});
