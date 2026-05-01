/**
 * Playwright script — Execução Controlada screenshots for PDF guide
 *
 * Uso:
 *   node docs/pdfs/execucao-controlada/take-screenshots.js
 *
 * Pré-requisitos:
 *   - Dev server + API rodando
 * Variáveis opcionais:
 *   BASE_URL, LOGIN_EMAIL, LOGIN_PASSWORD
 *
 * Dica — medir coordenadas para annotate-screenshots.py:
 *   const box = await page.locator("selector").boundingBox()
 *   console.log(box)  // { x, y, width, height }
 */

import { chromium } from "/home/jp/daton/Daton-ciclo-e/node_modules/.pnpm/@playwright+test@1.58.2/node_modules/@playwright/test/index.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMGS_DIR  = path.join(__dirname, "imgs");
const BASE_URL  = process.env.BASE_URL  || "http://localhost:5173";
const EMAIL     = process.env.LOGIN_EMAIL    || "admin@example.com";
const PASSWORD  = process.env.LOGIN_PASSWORD || "demo123";

fs.mkdirSync(IMGS_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 900 });

// ── Login ──────────────────────────────────────────────────────────────────
await page.goto(`${BASE_URL}/auth`);
await page.waitForLoadState("networkidle");
const inputs = await page.locator("input").all();
await inputs[0].fill(EMAIL);
await inputs[1].fill(PASSWORD);
await page.locator('button[type="submit"]').click();
await page.waitForLoadState("networkidle");

// ── Navegar para Execução Controlada ──────────────────────────────────────
await page.goto(`${BASE_URL}/app/governanca/execucao-controlada`);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1200);

// ── Screenshot 1: visão geral — lista de ciclos + detalhe com Checkpoints ──
await page.screenshot({ path: path.join(IMGS_DIR, "01-visao-geral.png") });
console.log("✓ 01-visao-geral.png");

// Medir layout
const tabBox = await page.locator('[role="tablist"]').first().boundingBox();
console.log("tablist:", tabBox);

// ── Screenshot 2: aba Liberação ────────────────────────────────────────────
const tabs = await page.locator('[role="tab"]').all();
for (const tab of tabs) {
  const text = await tab.textContent();
  if (text && text.includes("Libera")) {
    await tab.click();
    break;
  }
}
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(IMGS_DIR, "02-liberacao.png") });
console.log("✓ 02-liberacao.png");

// ── Screenshot 3: aba Saídas Não Conformes ────────────────────────────────
for (const tab of await page.locator('[role="tab"]').all()) {
  const text = await tab.textContent();
  if (text && (text.includes("Não Conform") || text.includes("Nao Conform") || text.includes("NC"))) {
    await tab.click();
    break;
  }
}
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(IMGS_DIR, "03-nao-conformes.png") });
console.log("✓ 03-nao-conformes.png");

// ── Screenshot 4: aba Pós-Entrega ─────────────────────────────────────────
for (const tab of await page.locator('[role="tab"]').all()) {
  const text = await tab.textContent();
  if (text && (text.includes("Pós") || text.includes("Pos") || text.includes("Entrega"))) {
    await tab.click();
    break;
  }
}
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(IMGS_DIR, "04-pos-entrega.png") });
console.log("✓ 04-pos-entrega.png");

// ── Screenshot 5: Modelos — lista + detalhe do modelo ─────────────────────
// Tentar navegar para a aba/seção de Modelos se existir no menu lateral
const modelosLink = page.locator('a:has-text("Modelos"), [href*="modelo"], nav a').filter({ hasText: /modelo/i }).first();
const modelosExists = await modelosLink.count();
if (modelosExists > 0) {
  await modelosLink.click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
}
await page.screenshot({ path: path.join(IMGS_DIR, "05-modelos.png") });
console.log("✓ 05-modelos.png");

await browser.close();
console.log("\nDone. Execute annotate-screenshots.py em seguida.");
