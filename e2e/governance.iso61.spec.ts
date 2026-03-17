import { expect, test } from "./fixtures/auth";
import { cleanupTestData } from "./support/cleanup";
import { createCompletedOrgAdmin, makeTestPrefix } from "./support/data";
import {
  createGovernanceAction,
  createGovernanceDraftPlan,
  createRiskEffectivenessReview,
  createRiskOpportunityItem,
  getCurrentUser,
  getGovernancePlan,
  governanceFetch,
  listGovernancePlans,
} from "./support/governance";

function isoDate(daysFromNow = 30) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString();
}

function inputDate(daysFromNow = 30) {
  return isoDate(daysFromNow).slice(0, 10);
}

test("creates and treats a risk item from the governance UI", async ({
  authenticatedPage,
  orgAdmin,
}) => {
  const title = `Plano ISO 6.1 UI ${Date.now()}`;
  const riskTitle = `Risco UI ${Date.now()}`;
  const actionTitle = `Acao UI ${Date.now()}`;

  await authenticatedPage.goto("/governanca/planejamento");
  await authenticatedPage.getByRole("button", { name: "Novo plano" }).click();

  const newPlanDialog = authenticatedPage.getByRole("dialog", {
    name: "Novo Planejamento",
  });
  await newPlanDialog.getByLabel("Título do plano").fill(title);
  await newPlanDialog.getByRole("button", { name: "Criar rascunho" }).click();

  await expect(authenticatedPage).toHaveURL(/\/governanca\/planejamento\/\d+$/);
  await authenticatedPage
    .getByRole("button", { name: "Riscos e Oportunidades" })
    .click();
  await authenticatedPage.getByRole("button", { name: "Novo item" }).click();

  const riskDialog = authenticatedPage.getByRole("dialog", {
    name: "Novo risco ou oportunidade",
  });
  await riskDialog.locator("input").first().fill(riskTitle);
  await riskDialog
    .locator("textarea")
    .first()
    .fill("Risco criado pelo fluxo E2E da ISO 6.1.");
  await riskDialog
    .locator("select")
    .nth(3)
    .selectOption({ label: orgAdmin.adminFullName });
  await riskDialog.locator('input[type="number"]').nth(0).fill("4");
  await riskDialog.locator('input[type="number"]').nth(1).fill("4");
  await riskDialog.locator('input[type="date"]').fill(inputDate(45));
  await riskDialog.locator("select").nth(8).selectOption("mitigate");
  await expect(riskDialog.getByText("16", { exact: true })).toBeVisible();
  await riskDialog.getByRole("button", { name: "Salvar" }).click();

  await expect(authenticatedPage.getByText(riskTitle)).toBeVisible();
  await expect(authenticatedPage.getByText("4 x 4 = 16")).toBeVisible();
  await expect(
    authenticatedPage
      .locator("div")
      .filter({ hasText: /^Crítico$/ })
      .last(),
  ).toBeVisible();

  await authenticatedPage
    .getByRole("button", { name: "Nova ação vinculada" })
    .click();

  const actionDialog = authenticatedPage.getByRole("dialog", {
    name: "Nova ação",
  });
  await actionDialog.locator("input").first().fill(actionTitle);
  await actionDialog
    .locator("textarea")
    .first()
    .fill("Tratamento do risco criado pelo fluxo E2E.");
  await actionDialog.locator("select").nth(2).selectOption("done");
  await actionDialog.locator('input[type="date"]').nth(2).fill(inputDate(0));
  await actionDialog.getByRole("button", { name: "Salvar" }).click();

  await expect(authenticatedPage.getByText(actionTitle)).toBeVisible();

  await authenticatedPage
    .getByRole("button", { name: "Registrar eficácia" })
    .click();

  const effectivenessDialog = authenticatedPage.getByRole("dialog", {
    name: "Verificação de eficácia",
  });
  await effectivenessDialog.locator("select").selectOption("effective");
  await effectivenessDialog
    .locator("textarea")
    .fill("Tratamento confirmado como eficaz no fluxo E2E.");
  await effectivenessDialog
    .getByRole("button", { name: "Salvar revisão" })
    .click();

  await expect(
    authenticatedPage.getByRole("heading", { name: riskTitle, exact: true }),
  ).toBeVisible();
  await expect(authenticatedPage.getByText(actionTitle)).toBeVisible();
  await expect(authenticatedPage.getByText(/Eficaz em/)).toBeVisible();
});

test("rejects invalid risk scoring and returns derived score/priority for valid items", async ({
  orgAdmin,
}) => {
  const plan = await createGovernanceDraftPlan(
    orgAdmin,
    `Plano ISO 6.1 API ${Date.now()}`,
  );
  const currentUser = await getCurrentUser(orgAdmin);

  const invalidResponse = await governanceFetch(
    orgAdmin,
    `/api/organizations/${orgAdmin.organizationId}/governance/strategic-plans/${plan.id}/risk-opportunity-items`,
    {
      method: "POST",
      bodyJson: {
        type: "risk",
        sourceType: "meeting",
        title: `Risco inválido ${Date.now()}`,
        description: "Payload inválido com escala acima do permitido.",
        ownerUserId: currentUser.id,
        likelihood: 5,
        impact: 5,
        responseStrategy: "mitigate",
        nextReviewAt: isoDate(30),
      },
    },
  );

  expect(invalidResponse.status).toBe(400);

  const validItem = await createRiskOpportunityItem(orgAdmin, plan.id, {
    type: "risk",
    sourceType: "meeting",
    title: `Risco válido ${Date.now()}`,
    description: "Payload válido com score máximo permitido.",
    ownerUserId: currentUser.id,
    likelihood: 4,
    impact: 4,
    responseStrategy: "mitigate",
    nextReviewAt: isoDate(30),
  });

  expect(validItem.score).toBe(16);
  expect(validItem.priority).toBe("critical");

  const detail = await getGovernancePlan(orgAdmin, plan.id);
  const storedItem = detail.riskOpportunityItems.find(
    (item) => item.id === validItem.id,
  );

  expect(storedItem).toBeTruthy();
  expect(storedItem?.score).toBe(16);
  expect(storedItem?.priority).toBe("critical");
});

test("clears ISO 6.1 compliance blockers after linked action and effectiveness review", async ({
  orgAdmin,
}) => {
  const plan = await createGovernanceDraftPlan(
    orgAdmin,
    `Plano ISO 6.1 Compliance ${Date.now()}`,
  );
  const currentUser = await getCurrentUser(orgAdmin);

  const risk = await createRiskOpportunityItem(orgAdmin, plan.id, {
    type: "risk",
    sourceType: "meeting",
    title: `Risco compliance ${Date.now()}`,
    description: "Risco com tratamento obrigatório para validar pendências.",
    ownerUserId: currentUser.id,
    likelihood: 4,
    impact: 4,
    responseStrategy: "mitigate",
    nextReviewAt: isoDate(30),
  });

  const detailMissingAction = await getGovernancePlan(orgAdmin, plan.id);
  expect(detailMissingAction.complianceIssues).toContain(
    "Há risco ou oportunidade que exige resposta sem ação vinculada.",
  );

  await createGovernanceAction(orgAdmin, plan.id, {
    title: `Ação compliance ${Date.now()}`,
    description: "Ação concluída para remover a pendência de resposta.",
    riskOpportunityItemId: risk.id,
    responsibleUserId: currentUser.id,
    status: "done",
    completedAt: isoDate(0),
  });

  const detailAwaitingEffectiveness = await getGovernancePlan(orgAdmin, plan.id);
  expect(detailAwaitingEffectiveness.complianceIssues).not.toContain(
    "Há risco ou oportunidade que exige resposta sem ação vinculada.",
  );
  expect(detailAwaitingEffectiveness.complianceIssues).toContain(
    "Há risco ou oportunidade concluído sem verificação de eficácia.",
  );

  await createRiskEffectivenessReview(orgAdmin, plan.id, risk.id, {
    result: "effective",
    comment: "Eficácia validada pela suíte E2E.",
  });

  const detailAfterEffectiveness = await getGovernancePlan(orgAdmin, plan.id);
  expect(detailAfterEffectiveness.complianceIssues).not.toContain(
    "Há risco ou oportunidade que exige resposta sem ação vinculada.",
  );
  expect(detailAfterEffectiveness.complianceIssues).not.toContain(
    "Há risco ou oportunidade concluído sem verificação de eficácia.",
  );
});

test("isolates effectiveness data to the relevant plan items", async ({
  orgAdmin,
}) => {
  const secondaryPrefix = makeTestPrefix("iso61-secondary-org");
  const secondaryOrgAdmin = await createCompletedOrgAdmin(secondaryPrefix);

  try {
    const primaryUser = await getCurrentUser(orgAdmin);
    const secondaryUser = await getCurrentUser(secondaryOrgAdmin);

    const primaryPlan = await createGovernanceDraftPlan(
      orgAdmin,
      `Plano ISO 6.1 Principal ${Date.now()}`,
    );
    const secondaryPlan = await createGovernanceDraftPlan(
      secondaryOrgAdmin,
      `Plano ISO 6.1 Secundário ${Date.now()}`,
    );

    const primaryItemA = await createRiskOpportunityItem(orgAdmin, primaryPlan.id, {
      type: "risk",
      sourceType: "meeting",
      title: `Risco A ${Date.now()}`,
      description: "Primeiro item do plano principal.",
      ownerUserId: primaryUser.id,
      likelihood: 4,
      impact: 4,
      responseStrategy: "monitor",
      nextReviewAt: isoDate(30),
    });
    const primaryItemB = await createRiskOpportunityItem(orgAdmin, primaryPlan.id, {
      type: "risk",
      sourceType: "meeting",
      title: `Risco B ${Date.now()}`,
      description: "Segundo item do plano principal.",
      ownerUserId: primaryUser.id,
      likelihood: 3,
      impact: 4,
      responseStrategy: "monitor",
      nextReviewAt: isoDate(30),
    });
    const secondaryItem = await createRiskOpportunityItem(
      secondaryOrgAdmin,
      secondaryPlan.id,
      {
        type: "risk",
        sourceType: "meeting",
        title: `Risco Secundário ${Date.now()}`,
        description: "Item isolado em outra organização.",
        ownerUserId: secondaryUser.id,
        likelihood: 2,
        impact: 4,
        responseStrategy: "monitor",
        nextReviewAt: isoDate(30),
      },
    );

    await createRiskEffectivenessReview(orgAdmin, primaryPlan.id, primaryItemA.id, {
      result: "effective",
      comment: "Item A efetivo.",
    });
    await createRiskEffectivenessReview(orgAdmin, primaryPlan.id, primaryItemB.id, {
      result: "ineffective",
      comment: "Item B inefetivo.",
    });
    await createRiskEffectivenessReview(
      secondaryOrgAdmin,
      secondaryPlan.id,
      secondaryItem.id,
      {
        result: "effective",
        comment: "Item secundário efetivo.",
      },
    );

    const primaryDetail = await getGovernancePlan(orgAdmin, primaryPlan.id);
    const secondaryDetail = await getGovernancePlan(
      secondaryOrgAdmin,
      secondaryPlan.id,
    );

    expect(primaryDetail.riskOpportunityItems).toHaveLength(2);
    expect(primaryDetail.riskOpportunityItems.map((item) => item.id).sort((a, b) => a - b)).toEqual([
      primaryItemA.id,
      primaryItemB.id,
    ]);

    const storedPrimaryA = primaryDetail.riskOpportunityItems.find(
      (item) => item.id === primaryItemA.id,
    );
    const storedPrimaryB = primaryDetail.riskOpportunityItems.find(
      (item) => item.id === primaryItemB.id,
    );

    expect(storedPrimaryA?.status).toBe("effective");
    expect(storedPrimaryB?.status).toBe("ineffective");
    expect(
      primaryDetail.riskOpportunityItems.some(
        (item) => item.id === secondaryItem.id,
      ),
    ).toBe(false);

    expect(secondaryDetail.riskOpportunityItems).toHaveLength(1);
    expect(secondaryDetail.riskOpportunityItems[0]?.id).toBe(secondaryItem.id);
    expect(secondaryDetail.riskOpportunityItems[0]?.status).toBe("effective");

    const primarySummaries = await listGovernancePlans(orgAdmin);
    const secondarySummaries = await listGovernancePlans(secondaryOrgAdmin);

    const primarySummary = primarySummaries.find(
      (item) => item.id === primaryPlan.id,
    );
    const secondarySummary = secondarySummaries.find(
      (item) => item.id === secondaryPlan.id,
    );

    expect(primarySummary?.metrics.riskOpportunityCount).toBe(2);
    expect(secondarySummary?.metrics.riskOpportunityCount).toBe(1);
  } finally {
    await cleanupTestData(secondaryPrefix);
  }
});
