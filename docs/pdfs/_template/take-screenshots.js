/**
 * Captura screenshots para o guia PDF do módulo [NOME DO MÓDULO].
 *
 * Uso:
 *   node take-screenshots.js
 *
 * Pré-requisitos:
 *   - Dev server rodando: pnpm --filter @workspace/web dev
 *   - Credenciais: LOGIN_EMAIL e LOGIN_PASSWORD como variáveis de ambiente
 *     ou edite as constantes abaixo.
 *
 * Dica — medir coordenadas para annotate-screenshots.py:
 *   const box = await page.locator("selector").boundingBox()
 *   console.log(box)  // { x, y, width, height }
 */

import { chromium } from "/home/jp/daton/Daton-ciclo-d/node_modules/.pnpm/@playwright+test@1.58.2/node_modules/@playwright/test/index.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMGS_DIR  = path.join(__dirname, "imgs");
const BASE_URL  = "http://localhost:5173";
const EMAIL     = process.env.LOGIN_EMAIL    || "TODO@example.com";
const PASSWORD  = process.env.LOGIN_PASSWORD || "TODO";

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

// ── Navegar para o módulo ──────────────────────────────────────────────────
// TODO: substitua pelo caminho real do módulo (sem /app/)
await page.goto(`${BASE_URL}/TODO-rota-do-modulo`);
await page.waitForLoadState("networkidle");

// ── Screenshot 1: visão principal ──────────────────────────────────────────
await page.screenshot({ path: path.join(IMGS_DIR, "01-visao-geral.png") });
console.log("✓ 01-visao-geral.png");

// ── Screenshot 2: tab ou funcionalidade ────────────────────────────────────
// await page.click('[role="tab"]:text("[Nome da Tab]")');
// await page.waitForLoadState("networkidle");
// await page.screenshot({ path: path.join(IMGS_DIR, "02-tab.png") });
// console.log("✓ 02-tab.png");

// ── Screenshot 3: dialog de criação ───────────────────────────────────────
// await page.getByRole("button", { name: /[Nome do Botão]/i }).click();
// await page.waitForTimeout(400);
// await page.screenshot({ path: path.join(IMGS_DIR, "03-dialog.png") });
// console.log("✓ 03-dialog.png");

await browser.close();
console.log("\nDone. Execute annotate-screenshots.py em seguida.");
