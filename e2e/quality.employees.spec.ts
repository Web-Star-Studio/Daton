import { expect, test } from "./fixtures/auth";
import { apiJson } from "./support/api";

async function getCurrentUser(token: string) {
  const response = await apiJson<{
    user: { id: number; name: string; organizationId: number };
  }>("/api/auth/me", {
    token,
  });

  return response.user;
}

async function createDocumentForTest(
  organizationId: number,
  token: string,
  title: string,
  elaboratorId: number,
  currentUserId: number,
  type: "manual" | "politica" = "manual",
) {
  return apiJson<{ id: number; title: string }>(
    `/api/organizations/${organizationId}/documents`,
    {
      token,
      method: "POST",
      body: {
        title,
        type,
        validityDate: "2030-01-01",
        elaboratorIds: [elaboratorId],
        criticalReviewerIds: [currentUserId],
        approverIds: [currentUserId],
        recipientIds: [currentUserId],
      },
    },
  );
}

test("shows an employee with profile history and opens the detail page", async ({
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

  const createdEmployee = await apiJson<{ id: number; name: string }>(
    `/api/organizations/${orgAdmin.organizationId}/employees`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        name: employeeName,
        email: `colab-${Date.now()}@daton.test`,
        unitId: unit.id,
        department: departmentName,
        position: positionName,
        admissionDate: "2024-03-10",
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

  const employeeLink = authenticatedPage
    .getByRole("link")
    .filter({ hasText: employeeName })
    .first();
  await expect(employeeLink).toHaveAttribute(
    "href",
    new RegExp(`/organizacao/colaboradores/${createdEmployee.id}$`),
  );
  await employeeLink.click();
  await expect(authenticatedPage).toHaveURL(
    new RegExp(`/organizacao/colaboradores/${createdEmployee.id}$`),
  );
  await expect(authenticatedPage.getByText(experienceTitle)).toBeVisible();
});

test("fills the profile history step in the employee creation wizard and preserves values between steps", async ({
  authenticatedPage,
  orgAdmin,
}) => {
  test.slow();

  const suffix = Date.now();
  const unitName = `Unidade Wizard ${suffix}`;
  const departmentName = `Qualidade Wizard ${suffix}`;
  const positionName = `Analista Wizard ${suffix}`;
  const experienceTitle = `Experiência Wizard ${suffix}`;
  const educationTitle = `Certificação Wizard ${suffix}`;

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
  await authenticatedPage
    .getByRole("button", { name: "Novo Colaborador" })
    .click();

  const dialog = authenticatedPage.getByRole("dialog", {
    name: "Novo colaborador",
  });
  await dialog
    .getByText("Nome completo *", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill(`Wizard ${suffix}`);
  await dialog
    .getByText("E-mail", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill(`wizard-${suffix}@daton.test`);
  await dialog
    .getByRole("button", { name: "Próximo" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(dialog.getByText("Departamento", { exact: true })).toBeVisible();

  await dialog
    .getByText("Departamento", { exact: true })
    .locator("xpath=..")
    .locator("select")
    .selectOption(departmentName);
  await dialog
    .getByText("Cargo", { exact: true })
    .locator("xpath=..")
    .locator("select")
    .selectOption(positionName);
  await dialog
    .getByText("Unidade", { exact: true })
    .locator("xpath=..")
    .locator("select")
    .selectOption(String(unit.id));
  await dialog
    .getByText("Data de admissão *", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("2024-03-10");
  await dialog
    .getByRole("button", { name: "Próximo" })
    .evaluate((button: HTMLButtonElement) => button.click());

  const sections = dialog.locator("div.col-span-2.rounded-xl");
  const experienceSection = sections.filter({
    hasText: "Experiências profissionais",
  });
  const educationSection = sections.filter({
    hasText: "Educação e certificações",
  });

  await expect(experienceSection).toBeVisible();
  await expect(educationSection).toBeVisible();

  await experienceSection
    .getByRole("button", { name: "Adicionar item" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await experienceSection
    .getByText("Título *", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill(experienceTitle);
  await experienceSection
    .getByText("Descrição", { exact: true })
    .locator("xpath=..")
    .locator("textarea")
    .fill("Experiência inicial cadastrada no wizard.");

  await educationSection
    .getByRole("button", { name: "Adicionar item" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await educationSection
    .getByText("Título *", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill(educationTitle);
  await educationSection
    .getByText("Descrição", { exact: true })
    .locator("xpath=..")
    .locator("textarea")
    .fill("Certificação mantida ao navegar entre etapas.");

  await expect(
    experienceSection
      .getByText("Título *", { exact: true })
      .locator("xpath=..")
      .locator("input"),
  ).toHaveValue(experienceTitle);
  await expect(
    educationSection
      .getByText("Título *", { exact: true })
      .locator("xpath=..")
      .locator("input"),
  ).toHaveValue(educationTitle);

  await dialog.getByRole("button", { name: "Anterior" }).click();
  await expect(
    dialog
      .getByText("Departamento", { exact: true })
      .locator("xpath=..")
      .locator("select"),
  ).toHaveValue(departmentName);
  await dialog
    .getByRole("button", { name: "Próximo" })
    .evaluate((button: HTMLButtonElement) => button.click());

  await expect(
    experienceSection
      .getByText("Título *", { exact: true })
      .locator("xpath=..")
      .locator("input"),
  ).toHaveValue(experienceTitle);
  await expect(
    educationSection
      .getByText("Título *", { exact: true })
      .locator("xpath=..")
      .locator("input"),
  ).toHaveValue(educationTitle);
});

test("manages training matrix, closes a competency gap, and records awareness links", async ({
  authenticatedPage,
  orgAdmin,
}) => {
  test.slow();

  const suffix = Date.now();
  const unitName = `Unidade Treinamentos ${suffix}`;
  const departmentName = `Qualidade ${suffix}`;
  const positionName = `Auditor Interno ${suffix}`;
  const employeeName = `Colaborador Treinamento ${suffix}`;
  const competencyName = `Auditoria interna ${suffix}`;
  const processName = `Processo SGQ ${suffix}`;
  const planTitle = `Plano SGQ ${suffix}`;
  const objectiveCode = `OBJ-${suffix}`;
  const objectiveDescription = `Elevar a aderencia do SGQ ${suffix}`;
  const policyTitle = `Politica da Qualidade ${suffix}`;
  const manualTitle = `Manual SGQ ${suffix}`;
  const awarenessTopic = `Politica da qualidade ${suffix}`;

  const currentUser = await getCurrentUser(orgAdmin.token);

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

  await apiJson<{ id: number }>(
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

  const position = await apiJson<{ id: number }>(
    `/api/organizations/${orgAdmin.organizationId}/positions`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        name: positionName,
      },
    },
  );

  const employee = await apiJson<{ id: number; name: string }>(
    `/api/organizations/${orgAdmin.organizationId}/employees`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        name: employeeName,
        email: `training-${suffix}@daton.test`,
        unitId: unit.id,
        department: departmentName,
        position: positionName,
        admissionDate: "2024-03-10",
      },
    },
  );

  const plan = await apiJson<{ id: number; title: string }>(
    `/api/organizations/${orgAdmin.organizationId}/governance/strategic-plans`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        title: planTitle,
      },
    },
  );

  const objective = await apiJson<{
    id: number;
    code: string;
    description: string;
  }>(
    `/api/organizations/${orgAdmin.organizationId}/governance/strategic-plans/${plan.id}/objectives`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        code: objectiveCode,
        description: objectiveDescription,
      },
    },
  );

  const process = await apiJson<{ id: number; name: string }>(
    `/api/organizations/${orgAdmin.organizationId}/governance/sgq-processes`,
    {
      token: orgAdmin.token,
      method: "POST",
      body: {
        name: processName,
        objective: "Padronizar o processo de auditoria interna.",
        ownerUserId: currentUser.id,
        inputs: ["Plano de auditoria"],
        outputs: ["Relatorio de auditoria"],
      },
    },
  );

  const policyDocument = await createDocumentForTest(
    orgAdmin.organizationId,
    orgAdmin.token,
    policyTitle,
    employee.id,
    currentUser.id,
    "politica",
  );
  const manualDocument = await createDocumentForTest(
    orgAdmin.organizationId,
    orgAdmin.token,
    manualTitle,
    employee.id,
    currentUser.id,
    "manual",
  );

  await authenticatedPage.goto("/organizacao/colaboradores");
  await authenticatedPage.getByRole("link", { name: "Treinamentos" }).click();
  await expect(authenticatedPage).toHaveURL(
    /\/organizacao\/colaboradores\/treinamentos$/,
  );

  await authenticatedPage.getByRole("tab", { name: "Matriz" }).click();
  await authenticatedPage
    .getByRole("tabpanel", { name: "Matriz" })
    .getByText("Cargo", { exact: true })
    .locator("xpath=..")
    .locator("select")
    .selectOption(String(position.id));
  await authenticatedPage
    .getByRole("button", { name: "Novo requisito" })
    .click();

  const requirementDialog = authenticatedPage.getByRole("dialog", {
    name: "Novo requisito",
  });
  await requirementDialog
    .getByText("Competencia *", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill(competencyName);
  await requirementDialog
    .getByText("Nivel requerido", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("4");
  await requirementDialog
    .getByText("Notas", { exact: true })
    .locator("xpath=..")
    .locator("textarea")
    .fill("Competencia obrigatoria para conduzir auditorias internas.");
  await requirementDialog.getByRole("button", { name: "Salvar" }).click();

  await expect(authenticatedPage.getByText(competencyName)).toBeVisible();
  await expect(authenticatedPage.getByText("Nivel 4")).toBeVisible();

  await authenticatedPage.getByRole("tab", { name: "Lacunas" }).click();
  await expect(
    authenticatedPage.getByRole("tabpanel").getByText(employeeName),
  ).toBeVisible();
  await expect(
    authenticatedPage.getByText(`Competencia: ${competencyName}`),
  ).toBeVisible();

  await authenticatedPage
    .getByRole("button", { name: "Criar treinamento" })
    .click();
  await expect(authenticatedPage).toHaveURL(
    new RegExp(`/organizacao/colaboradores/${employee.id}`),
  );

  const trainingDialog = authenticatedPage.getByRole("dialog", {
    name: "Novo Treinamento",
  });
  await expect(trainingDialog).toBeVisible();
  await trainingDialog
    .getByText("Título *", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill(`Plano para ${competencyName}`);
  await trainingDialog.getByRole("button", { name: "Próximo" }).click();
  await trainingDialog
    .getByText("Instituição", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("Academia SGQ");
  await trainingDialog
    .getByText("Carga Horária (h)", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("8");
  await trainingDialog
    .getByText("Competência-alvo", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill(competencyName);
  await trainingDialog
    .getByText("Nível-alvo", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("4");
  await trainingDialog
    .getByText("Método de avaliação", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("Observação em campo");
  await trainingDialog
    .getByText("Renovação (meses)", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("12");
  await trainingDialog.getByRole("button", { name: "Próximo" }).click();
  await trainingDialog
    .getByText("Status", { exact: true })
    .locator("xpath=..")
    .locator("select")
    .selectOption("concluido");
  await trainingDialog
    .getByText("Data Conclusão", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("2024-03-20");
  await trainingDialog
    .getByText("Validade", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("2025-03-20");
  await trainingDialog.getByRole("button", { name: "Salvar" }).click();

  await expect(
    authenticatedPage.getByText(`Plano para ${competencyName}`),
  ).toBeVisible();
  await authenticatedPage.getByTitle("Registrar eficácia").click();

  const reviewDialog = authenticatedPage.getByRole("dialog", {
    name: "Registrar eficácia",
  });
  await reviewDialog
    .getByText("Data da avaliação *", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("2024-03-25");
  await reviewDialog
    .getByText("Nota", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("9");
  await reviewDialog
    .getByText("Resultado *", { exact: true })
    .locator("xpath=..")
    .locator("select")
    .selectOption("effective");
  await reviewDialog
    .getByText("Nível evidenciado", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("4");
  await reviewDialog
    .getByText("Comentários", { exact: true })
    .locator("xpath=..")
    .locator("textarea")
    .fill("Aplicou o procedimento corretamente em auditoria supervisionada.");
  await reviewDialog
    .getByRole("button", { name: "Registrar eficácia" })
    .click();

  await expect(
    authenticatedPage.getByText("Última avaliação de eficácia"),
  ).toBeVisible();
  await expect(
    authenticatedPage.getByText(/Eficaz em 2024-03-25/i),
  ).toBeVisible();

  await authenticatedPage.goto("/organizacao/colaboradores/treinamentos");
  await authenticatedPage.getByRole("tab", { name: "Lacunas" }).click();
  await expect(
    authenticatedPage.getByText(
      "Nenhuma lacuna aberta para os filtros informados.",
    ),
  ).toBeVisible();

  await authenticatedPage.goto(
    `/organizacao/colaboradores/${employee.id}?tab=conscientizacao`,
  );
  await expect(authenticatedPage.getByText(employeeName)).toBeVisible();
  await authenticatedPage
    .getByRole("button", { name: "Novo Registro" })
    .click();

  const awarenessDialog = authenticatedPage.getByRole("dialog", {
    name: "Novo Registro de Conscientização",
  });
  await awarenessDialog
    .getByText("Tema *", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill(awarenessTopic);
  await awarenessDialog
    .getByText("Descrição", { exact: true })
    .locator("xpath=..")
    .locator("textarea")
    .fill(
      "Registro formal de conscientizacao sobre politica, processo e objetivo.",
    );
  await awarenessDialog
    .getByText("Política vinculada", { exact: true })
    .locator("xpath=..")
    .locator("select")
    .selectOption(policyTitle);
  await awarenessDialog
    .getByText("Documento relacionado", { exact: true })
    .locator("xpath=..")
    .locator("select")
    .selectOption(manualTitle);
  await awarenessDialog
    .getByText("Processo SGQ", { exact: true })
    .locator("xpath=..")
    .locator("select")
    .selectOption(processName);
  await awarenessDialog
    .getByText("Objetivo estratégico", { exact: true })
    .locator("xpath=..")
    .locator("select")
    .selectOption(`${objective.code} · ${objective.description}`);
  await awarenessDialog.getByRole("button", { name: "Próximo" }).click();
  await awarenessDialog
    .getByText("Método de Verificação", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("Quiz rapido");
  await awarenessDialog
    .getByText("Resultado", { exact: true })
    .locator("xpath=..")
    .locator("input")
    .fill("Aprovado");
  await awarenessDialog.getByRole("button", { name: "Salvar" }).click();

  await expect(
    authenticatedPage.getByText(awarenessTopic, { exact: true }),
  ).toBeVisible();
  await expect(
    authenticatedPage.getByText(`Política: ${policyTitle}`),
  ).toBeVisible();
  await expect(
    authenticatedPage.getByText(`Documento: ${manualTitle}`),
  ).toBeVisible();
  await expect(
    authenticatedPage.getByText(`Processo: ${process.name}`),
  ).toBeVisible();
  await expect(
    authenticatedPage.getByText(
      `Objetivo: ${objective.code} · ${objective.description}`,
    ),
  ).toBeVisible();
});
