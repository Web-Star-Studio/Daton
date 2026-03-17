import { test, expect } from "@playwright/test";
import { cleanupTestData } from "./support/cleanup";
import { makeTestPrefix } from "./support/data";

test("registers a new organization and completes onboarding", async ({
  page,
}) => {
  const prefix = makeTestPrefix("onboarding");
  const legalName = `E2E ${prefix} LTDA`;
  const tradeName = `E2E ${prefix}`;
  const adminName = `E2E ${prefix} Admin`;
  const adminEmail = `${prefix}@e2e.daton.example`;

  try {
    await page.goto("/auth");
    await page.getByRole("button", { name: "Criar ambiente" }).click();

    await page.getByLabel("Razão social").fill(legalName);
    await page.getByLabel("Nome fantasia").fill(tradeName);
    await page.getByLabel("CNPJ").fill("12.345.678/0001-90");
    await page.getByLabel("Nome completo do administrador").fill(adminName);
    await page.getByLabel("E-mail do administrador").fill(adminEmail);
    await page.getByLabel("Senha", { exact: true }).fill("DatonE2E!123");
    await page.getByLabel("Confirmar senha").fill("DatonE2E!123");
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Continuar com a criação" }).click();

    await expect(page).toHaveURL(/\/onboarding\/organizacao$/);

    await page.getByLabel("Setor principal").selectOption("technology");
    await page.getByRole("button", { name: "Média" }).click();
    await page.getByRole("button", { name: "Próximo" }).click();

    await page.getByText("Qualidade", { exact: true }).click();
    await page.getByRole("button", { name: "Intermediário" }).click();
    await page
      .getByPlaceholder("Ex.: consolidar requisitos legais entre unidades")
      .fill("Consolidar requisitos legais");
    await page.getByRole("button", { name: "Adicionar" }).click();
    await page.getByRole("button", { name: "Próximo" }).click();

    await page.getByLabel("Data de abertura").fill("2020-01-01");
    await page.getByLabel("Regime tributário").fill("Lucro Real");
    await page.getByLabel("CNAE principal").fill("6201-5/01");
    await page.getByLabel("Inscrição estadual").fill(`IE-${prefix}`);
    await page.getByLabel("Inscrição municipal").fill(`IM-${prefix}`);
    await page.getByRole("button", { name: "Próximo" }).click();

    await expect(page.getByText(legalName)).toBeVisible();
    await expect(page.getByText("Consolidar requisitos legais")).toBeVisible();

    await page
      .getByRole("button", { name: "Confirmar e liberar acesso" })
      .click();

    await expect(page).toHaveURL(/\/organizacao$/);
    await expect(page.getByText("Dados Cadastrais")).toBeVisible();
    await expect(page.getByText(legalName)).toBeVisible();
    await expect(page.getByText("Lucro Real")).toBeVisible();
  } finally {
    await cleanupTestData(prefix);
  }
});
