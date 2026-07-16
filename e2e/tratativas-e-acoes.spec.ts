import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures/auth";

/**
 * Locates the collapsible tratativa card whose header reads exactly `label`
 * (e.g. "5 Porquês", "Ishikawa + 5 Porquês", "FMEA"). Scoping to the card is
 * required because more than one tratativa can render an identical-looking
 * child element — Ishikawa nests its own "5 Porquês" chain — so an unscoped
 * placeholder/text query would be ambiguous once more than one card is open.
 */
function tratativaCard(page: Page, label: string): Locator {
  return page
    .getByRole("button", { name: label, exact: true })
    .locator(
      "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' rounded-xl ')][1]",
    );
}

/**
 * Opens a SearchableSelect combobox (scoped to `cell`) and picks the option
 * with the exact visible `optionLabel`. Only one combobox popover is ever
 * open at a time, so the option itself is queried at the page level — it
 * renders in a portal, outside `cell`.
 */
async function pickSearchable(cell: Locator, page: Page, optionLabel: string) {
  await cell.getByRole("combobox").click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
}

/** Waits for the debounced per-row PATCH that `AcoesDoPlano` fires ~1s after
 * the last edit to any action field. Distinct from the plan-level autosave,
 * which PATCHes `/action-plans/{planId}` (no `/actions/{id}` suffix). */
function waitForActionPatch(page: Page, planId: number) {
  return page.waitForResponse((response) => {
    if (response.request().method() !== "PATCH" || !response.ok()) return false;
    return new RegExp(`/action-plans/${planId}/actions/\\d+$`).test(
      new URL(response.url()).pathname,
    );
  });
}

test("tratativas and actions on an action plan persist end to end", async ({
  authenticatedPage: page,
  orgAdmin,
}, testInfo) => {
  // This flow touches three tratativas, a 2-row actions table, and a reload —
  // comfortably past the default 60s test timeout on a dev-server (not a
  // production build), especially when the debounced per-row PATCHes are
  // awaited explicitly.
  testInfo.setTimeout(150_000);

  const title = `Plano E2E Tratativas ${Date.now()}`;
  // The API uppercases the admin's name on registration
  // (see artifacts/api-server/src/routes/auth.ts, `adminFullName.toUpperCase()`),
  // so the stored/displayed name never matches the fixture's mixed-case
  // `adminFullName` — use the same transform to pick/assert the "Quem" option.
  const responsibleName = orgAdmin.adminFullName.toUpperCase();

  await page.goto("/planos-acao");
  await page.getByRole("button", { name: "Novo plano de ação" }).click();

  // ── Step 1: creation dialog — "5 Porquês" is the only seed default ──────
  const dialog = page.getByRole("dialog", { name: "Novo plano de ação" });
  await expect(
    dialog.getByRole("checkbox", { name: "5 Porquês", exact: true }),
  ).toBeChecked();
  await expect(
    dialog.getByRole("checkbox", {
      name: "Ishikawa + 5 Porquês",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole("checkbox", { name: "FMEA", exact: true }),
  ).not.toBeChecked();

  await dialog
    .getByPlaceholder("Ex.: Revisar EPIs na linha de produção")
    .fill(title);
  await dialog.getByRole("button", { name: "Criar plano de ação" }).click();

  await expect(page).toHaveURL(/\/planos-acao\/\d+$/);
  const planId = Number(page.url().split("/").pop());
  expect(planId).toBeGreaterThan(0);

  // ── Step 2: fill the 5 Porquês already added at creation ─────────────────
  const whyText =
    "Falta de padronização no processo de inspeção de recebimento.";
  await page.getByPlaceholder("Por que o problema ocorreu?").fill(whyText);

  // ── Step 2 (cont.): add Ishikawa, launch causes on two of the 6M, mark the
  // most likely one ──────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Adicionar tratativa" }).click();
  await page
    .getByRole("menuitem", { name: "Ishikawa + 5 Porquês", exact: true })
    .click();

  const ishikawaCard = tratativaCard(page, "Ishikawa + 5 Porquês");
  const metodoGroup = ishikawaCard
    .getByText("Método", { exact: true })
    .locator("xpath=..");
  const maquinaGroup = ishikawaCard
    .getByText("Máquina", { exact: true })
    .locator("xpath=..");

  const metodoCause = "Instrução de trabalho desatualizada";
  const maquinaCause = "Calibração do equipamento vencida";

  await metodoGroup.getByRole("button", { name: "Causa", exact: true }).click();
  await metodoGroup.getByPlaceholder("Causa").fill(metodoCause);

  await maquinaGroup
    .getByRole("button", { name: "Causa", exact: true })
    .click();
  await maquinaGroup.getByPlaceholder("Causa").fill(maquinaCause);

  await metodoGroup.locator('input[type="radio"]').check();

  // ── Step 3: add FMEA, fill S=8/O=4/D=3, RPN is calculated (96) ───────────
  await page.getByRole("button", { name: "Adicionar tratativa" }).click();
  await page.getByRole("menuitem", { name: "FMEA", exact: true }).click();

  const fmeaCard = tratativaCard(page, "FMEA");
  await fmeaCard
    .getByRole("button", { name: "Adicionar modo de falha" })
    .click();
  const fmeaRow = fmeaCard.locator("tbody tr").first();
  const fmeaCells = fmeaRow.locator("td");

  await pickSearchable(fmeaCells.nth(2), page, "8 — Perda total de função");
  await pickSearchable(fmeaCells.nth(4), page, "4 — Baixa");
  await pickSearchable(fmeaCells.nth(6), page, "3 — Detecção alta");

  await expect(fmeaCells.nth(7)).toHaveText("96");

  // ── Step 4: causa raiz identificada ───────────────────────────────────────
  const rootCause =
    "Falha no controle de qualidade da inspeção de recebimento.";
  await page
    .getByPlaceholder(
      "Conclusão da análise — a causa fundamental a ser tratada.",
    )
    .fill(rootCause);

  // Flush the plan-level autosave (tratativas + causa raiz share one debounced
  // save path) before moving on to the actions table, which saves separately.
  await expect(page.getByText("Salvo", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  // ── Step 5: "+ Incluir ação" twice, fill "O quê" / responsável / prazo,
  // conclude one ────────────────────────────────────────────────────────────
  const incluirAcao = page.getByRole("button", { name: "Incluir ação" });
  await incluirAcao.click();
  await incluirAcao.click();

  const actionRows = page.locator('tr[id^="acao-"]');
  await expect(actionRows).toHaveCount(2);
  const row1 = actionRows.nth(0);
  const row2 = actionRows.nth(1);

  const action1What = "Revisar procedimento de inspeção de recebimento";
  const action2What = "Treinar a equipe na nova instrução de trabalho";

  await row1.locator("td").nth(1).locator("input").fill(action1What);
  await pickSearchable(row1.locator("td").nth(2), page, responsibleName);
  await row1
    .locator("td")
    .nth(3)
    .locator('input[type="date"]')
    .fill("2026-08-15");
  await waitForActionPatch(page, planId);

  await row2.locator("td").nth(1).locator("input").fill(action2What);
  await pickSearchable(row2.locator("td").nth(2), page, responsibleName);
  await row2
    .locator("td")
    .nth(3)
    .locator('input[type="date"]')
    .fill("2026-08-20");
  await waitForActionPatch(page, planId);

  await pickSearchable(row1.locator("td").nth(4), page, "Concluída");
  await waitForActionPatch(page, planId);

  // ── Step 6: reload and confirm everything persisted ──────────────────────
  await page.reload();

  await expect(
    tratativaCard(page, "5 Porquês").locator("textarea").first(),
  ).toHaveValue(whyText);

  const ishikawaCardReloaded = tratativaCard(page, "Ishikawa + 5 Porquês");
  const metodoGroupReloaded = ishikawaCardReloaded
    .getByText("Método", { exact: true })
    .locator("xpath=..");
  const maquinaGroupReloaded = ishikawaCardReloaded
    .getByText("Máquina", { exact: true })
    .locator("xpath=..");
  await expect(metodoGroupReloaded.getByPlaceholder("Causa")).toHaveValue(
    metodoCause,
  );
  await expect(maquinaGroupReloaded.getByPlaceholder("Causa")).toHaveValue(
    maquinaCause,
  );
  await expect(
    metodoGroupReloaded.locator('input[type="radio"]'),
  ).toBeChecked();

  const fmeaCardReloaded = tratativaCard(page, "FMEA");
  const fmeaRowReloaded = fmeaCardReloaded.locator("tbody tr").first();
  const fmeaCellsReloaded = fmeaRowReloaded.locator("td");
  await expect(fmeaCellsReloaded.nth(2)).toContainText(
    "8 — Perda total de função",
  );
  await expect(fmeaCellsReloaded.nth(4)).toContainText("4 — Baixa");
  await expect(fmeaCellsReloaded.nth(6)).toContainText("3 — Detecção alta");
  await expect(fmeaCellsReloaded.nth(7)).toHaveText("96");

  await expect(
    page.getByPlaceholder(
      "Conclusão da análise — a causa fundamental a ser tratada.",
    ),
  ).toHaveValue(rootCause);

  await expect(
    page.getByText("Ações · 1 de 2 concluídas", { exact: true }),
  ).toBeVisible();

  const rowsReloaded = page.locator('tr[id^="acao-"]');
  const row1Reloaded = rowsReloaded.nth(0);
  const row2Reloaded = rowsReloaded.nth(1);

  await expect(row1Reloaded.locator("td").nth(1).locator("input")).toHaveValue(
    action1What,
  );
  await expect(row1Reloaded.locator("td").nth(2)).toContainText(
    responsibleName,
  );
  await expect(
    row1Reloaded.locator("td").nth(3).locator('input[type="date"]'),
  ).toHaveValue("2026-08-15");
  await expect(row1Reloaded.locator("td").nth(4)).toContainText("Concluída");

  await expect(row2Reloaded.locator("td").nth(1).locator("input")).toHaveValue(
    action2What,
  );
  await expect(row2Reloaded.locator("td").nth(2)).toContainText(
    responsibleName,
  );
  await expect(
    row2Reloaded.locator("td").nth(3).locator('input[type="date"]'),
  ).toHaveValue("2026-08-20");
  await expect(row2Reloaded.locator("td").nth(4)).toContainText("Pendente");
});
