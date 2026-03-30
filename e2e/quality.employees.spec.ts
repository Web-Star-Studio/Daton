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
  await authenticatedPage
    .getByRole("button", { name: "Novo Colaborador" })
    .click();

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
  await dialog.getByRole("button", { name: "Adicionar item" }).first().click();
  await dialog.getByLabel("Título *").fill(experienceTitle);
  await dialog
    .getByLabel("Descrição")
    .fill("Atuação em recebimento e inspeção.");
  await dialog.getByRole("button", { name: "Criar colaborador" }).click();

  await expect(authenticatedPage.getByText(employeeName)).toBeVisible();

  await authenticatedPage.getByRole("link", { name: employeeName }).click();

  await expect(authenticatedPage).toHaveURL(
    /\/organizacao\/colaboradores\/\d+$/,
  );
  await expect(authenticatedPage.getByText(employeeName)).toBeVisible();
  await expect(authenticatedPage.getByText(experienceTitle)).toBeVisible();
});

test("manages training matrix, closes a competency gap, and records awareness links", async ({
  authenticatedPage,
  orgAdmin,
}) => {
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
  await authenticatedPage.getByLabel("Cargo").selectOption(String(position.id));
  await authenticatedPage
    .getByRole("button", { name: "Novo requisito" })
    .click();

  const requirementDialog = authenticatedPage.getByRole("dialog", {
    name: "Novo requisito",
  });
  await requirementDialog.getByLabel("Competencia *").fill(competencyName);
  await requirementDialog.getByLabel("Nivel requerido").fill("4");
  await requirementDialog
    .getByLabel("Notas")
    .fill("Competencia obrigatoria para conduzir auditorias internas.");
  await requirementDialog.getByRole("button", { name: "Salvar" }).click();

  await expect(authenticatedPage.getByText(competencyName)).toBeVisible();
  await expect(authenticatedPage.getByText("Nivel 4")).toBeVisible();

  await authenticatedPage.getByRole("tab", { name: "Lacunas" }).click();
  await expect(authenticatedPage.getByText(employeeName)).toBeVisible();
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
    .getByLabel("Título *")
    .fill(`Plano para ${competencyName}`);
  await trainingDialog.getByRole("button", { name: "Próximo" }).click();
  await trainingDialog.getByLabel("Instituição").fill("Academia SGQ");
  await trainingDialog.getByLabel("Carga Horária (h)").fill("8");
  await trainingDialog.getByLabel("Competência-alvo").fill(competencyName);
  await trainingDialog.getByLabel("Nível-alvo").fill("4");
  await trainingDialog
    .getByLabel("Método de avaliação")
    .fill("Observação em campo");
  await trainingDialog.getByLabel("Renovação (meses)").fill("12");
  await trainingDialog.getByRole("button", { name: "Próximo" }).click();
  await trainingDialog.getByLabel("Status").selectOption("concluido");
  await trainingDialog.getByLabel("Data Conclusão").fill("2024-03-20");
  await trainingDialog.getByLabel("Validade").fill("2025-03-20");
  await trainingDialog.getByRole("button", { name: "Salvar" }).click();

  await expect(
    authenticatedPage.getByText(`Plano para ${competencyName}`),
  ).toBeVisible();
  await authenticatedPage.getByTitle("Registrar eficácia").click();

  const reviewDialog = authenticatedPage.getByRole("dialog", {
    name: "Registrar eficácia",
  });
  await reviewDialog.getByLabel("Data da avaliação *").fill("2024-03-25");
  await reviewDialog.getByLabel("Nota").fill("9");
  await reviewDialog.getByLabel("Resultado *").selectOption("effective");
  await reviewDialog.getByLabel("Nível evidenciado").fill("4");
  await reviewDialog
    .getByLabel("Comentários")
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
  await awarenessDialog.getByLabel("Tema *").fill(awarenessTopic);
  await awarenessDialog
    .getByLabel("Descrição")
    .fill(
      "Registro formal de conscientizacao sobre politica, processo e objetivo.",
    );
  await awarenessDialog
    .getByLabel("Política vinculada")
    .selectOption(policyTitle);
  await awarenessDialog
    .getByLabel("Documento relacionado")
    .selectOption(manualTitle);
  await awarenessDialog.getByLabel("Processo SGQ").selectOption(processName);
  await awarenessDialog
    .getByLabel("Objetivo estratégico")
    .selectOption(`${objective.code} · ${objective.description}`);
  await awarenessDialog.getByRole("button", { name: "Próximo" }).click();
  await awarenessDialog.getByLabel("Método de Verificação").fill("Quiz rapido");
  await awarenessDialog.getByLabel("Resultado").fill("Aprovado");
  await awarenessDialog.getByRole("button", { name: "Salvar" }).click();

  await expect(authenticatedPage.getByText(awarenessTopic)).toBeVisible();
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
