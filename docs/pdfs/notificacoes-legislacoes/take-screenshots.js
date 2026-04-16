/**
 * Playwright script — Notificações de Legislações por Compliance screenshots for PDF guide
 *
 * Uso:
 *   LOGIN_EMAIL=seu@email.com LOGIN_PASSWORD=senha node take-screenshots.js
 *
 * Pré-requisitos:
 *   - Dev server rodando: pnpm --filter @workspace/web dev
 *   - API rodando:        pnpm --filter @workspace/api-server dev
 */

import pkg from "/home/jp/daton/Daton/node_modules/.pnpm/@playwright+test@1.58.2/node_modules/@playwright/test/index.js";
const { chromium } = pkg;
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMGS_DIR  = path.join(__dirname, "imgs");
const BASE_URL  = process.env.BASE_URL || "http://localhost:5173";
const EMAIL    = process.env.LOGIN_EMAIL    || "admin@example.com";
const PASSWORD = process.env.LOGIN_PASSWORD || "demo123";

fs.mkdirSync(IMGS_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 900 });

// ── Login ──────────────────────────────────────────────────────────────────
await page.goto(`${BASE_URL}/auth`);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);
const inputs = await page.locator("input").all();
await inputs[0].fill(EMAIL);
await inputs[1].fill(PASSWORD);
await page.locator('button[type="submit"]').first().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);

// ── Screenshot 1: Questionário de Compliance ───────────────────────────────
// Busca a primeira unidade via API e navega direto para o detalhe
const token = await page.evaluate(() => localStorage.getItem("daton_token"));
const orgId = await page.evaluate(() => {
  try { return JSON.parse(atob(localStorage.getItem("daton_token").split(".")[1])).organizationId; }
  catch { return null; }
});
const unitsRes = await page.evaluate(async ({ orgId, token }) => {
  const r = await fetch(`/api/organizations/${orgId}/units`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.json();
}, { orgId, token });
const firstUnitId = Array.isArray(unitsRes) ? unitsRes[0]?.id : null;
if (!firstUnitId) throw new Error("Nenhuma unidade encontrada. Rode o seed primeiro.");

await page.goto(`${BASE_URL}/app/organizacao/unidades/${firstUnitId}`);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);

// Abre o modal do questionário de compliance
await page.getByRole("button", { name: /questionário de compliance/i }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(IMGS_DIR, "01-questionario.png") });
console.log("✓ 01-questionario.png");

// Fecha o modal
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

// Medir coordenadas do modal (descomente para debug):
// const modalBox = await page.locator('[role="dialog"]').boundingBox();
// console.log("modal:", modalBox);

// ── Screenshot 2: Lista de Legislações com filtro por unidade ──────────────
await page.goto(`${BASE_URL}/app/qualidade/legislacoes`);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(IMGS_DIR, "02-legislacoes-lista.png") });
console.log("✓ 02-legislacoes-lista.png");

// Medir coordenadas da área de conteúdo (descomente para debug):
// const contentBox = await page.locator('main, [class*="content"]').first().boundingBox();
// console.log("content:", contentBox);

// ── Screenshot 3: Painel de notificações com notificação de legislação ──────
// Abre o painel de notificações via botão de sino no header
await page.locator('[aria-label="notificações"], button:has([data-lucide="bell"]), button:has(.lucide-bell)').first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(IMGS_DIR, "03-notificacoes.png") });
console.log("✓ 03-notificacoes.png");

// Medir coordenadas do painel de notificações (descomente para debug):
// const panelBox = await page.locator('[role="dialog"], .notifications-panel').first().boundingBox();
// console.log("panel:", panelBox);

await browser.close();
console.log("\nDone. Execute annotate-screenshots.py em seguida.");
