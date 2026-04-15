/**
 * Captura screenshots para o guia PDF do módulo Projeto e Desenvolvimento.
 *
 * Uso:
 *   LOGIN_EMAIL=admin@example.com LOGIN_PASSWORD=demo123 node take-screenshots.js
 *
 * Pré-requisito:
 *   - Dev server rodando: pnpm --filter @workspace/web dev
 *   - Banco populado com seed: SEED_DEMO=true pnpm --filter @workspace/scripts seed
 *
 * Screenshots capturadas:
 *   01-aplicabilidade.png   — aba Aplicabilidade com decisão aprovada e histórico
 *   02-projetos-lista.png   — aba Projetos com lista + formulário de projeto
 *   03-entradas-etapas.png  — seções Entradas e Etapas (form expandido)
 *   04-saidas-revisoes.png  — seções Saídas e Revisões
 *   05-mudancas.png         — seção Mudanças com form expandido
 */

import pkg from "/home/jp/daton/Daton-ciclo-f/node_modules/.pnpm/@playwright+test@1.58.2/node_modules/@playwright/test/index.js";
const { chromium } = pkg;
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMGS_DIR  = path.join(__dirname, "imgs");
const BASE_URL  = "http://localhost:5174";
const EMAIL     = process.env.LOGIN_EMAIL    || "admin@example.com";
const PASSWORD  = process.env.LOGIN_PASSWORD || "demo123";

fs.mkdirSync(IMGS_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 900 });

// ── Login — injeta token diretamente via API para evitar race condition ────
const loginRes = await fetch("http://localhost:3001/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const { token } = await loginRes.json();
if (!token) throw new Error("Login falhou: token não retornado");

// Carrega a app e injeta o token antes de navegar para a rota protegida
await page.goto(`${BASE_URL}/`);
await page.waitForLoadState("domcontentloaded");
await page.evaluate((t) => localStorage.setItem("daton_token", t), token);

// ── Navegar para o módulo ──────────────────────────────────────────────────
await page.goto(`${BASE_URL}/app/governanca/projeto-desenvolvimento`);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);

// ── 01: Aba Aplicabilidade ─────────────────────────────────────────────────
// Por padrão já abre na aba Aplicabilidade
await page.screenshot({ path: path.join(IMGS_DIR, "01-aplicabilidade.png") });
console.log("✓ 01-aplicabilidade.png");


// ── 02: Aba Projetos — lista + formulário ─────────────────────────────────
await page.getByRole("tab", { name: "Projetos" }).click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(IMGS_DIR, "02-projetos-lista.png") });
console.log("✓ 02-projetos-lista.png");

// ── 03: Entradas + Etapas com formulário expandido ────────────────────────
// Rolar o h3 "Entradas" para o topo do viewport e abrir o form inline.
// O botão Adicionar fica no mesmo flex-row que o SectionHeader (2 níveis acima do h3).
await page.locator('h3:has-text("Entradas")').first().evaluate(
  (el) => el.scrollIntoView({ block: "start", behavior: "instant" }),
);
await page.waitForTimeout(300);
const entrasAdder = page.locator('h3:has-text("Entradas")').first()
  .locator("xpath=../..").getByRole("button", { name: /adicionar/i });
await entrasAdder.click();
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(IMGS_DIR, "03-entradas-etapas.png") });
console.log("✓ 03-entradas-etapas.png");

// Fechar form de Entradas
await page.getByRole("button", { name: /cancelar/i }).first().click();
await page.waitForTimeout(200);

// ── 04: Saídas + Revisões ─────────────────────────────────────────────────
// Navega diretamente ao h3 "Saídas" para garantir a seção correta no topo.
await page.locator('h3:has-text("Saídas")').first().evaluate(
  (el) => el.scrollIntoView({ block: "start", behavior: "instant" }),
);
await page.evaluate(() => window.scrollBy(0, -80)); // recua um pouco para mostrar contexto
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(IMGS_DIR, "04-saidas-revisoes.png") });
console.log("✓ 04-saidas-revisoes.png");

// ── 05: Mudanças com formulário expandido ─────────────────────────────────
// Navega diretamente ao h3 "Mudanças de projeto" e abre o form.
await page.locator('h3:has-text("Mudanças de projeto")').first().evaluate(
  (el) => el.scrollIntoView({ block: "start", behavior: "instant" }),
);
await page.waitForTimeout(300);
// Botão Registrar fica no mesmo flex-row que o SectionHeader de Mudanças.
const mudancasRegistrar = page.locator('h3:has-text("Mudanças de projeto")').first()
  .locator("xpath=../..").getByRole("button");
await mudancasRegistrar.click();
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(IMGS_DIR, "05-mudancas.png") });
console.log("✓ 05-mudancas.png");

await browser.close();
console.log("\nDone. Execute annotate-screenshots.py em seguida.");
