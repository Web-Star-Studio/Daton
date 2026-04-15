/**
 * Playwright script — Planejamento Operacional screenshots for PDF guide
 * Run: node docs/pdfs/planejamento-operacional/take-screenshots.js
 */
const { chromium } = require("/home/jp/daton/Daton-ciclo-d/node_modules/.pnpm/@playwright+test@1.58.2/node_modules/@playwright/test");
const path = require("path");

const BASE_URL = "http://localhost:5173";
const OUT_DIR = path.join(__dirname, "imgs");
const EMAIL = "admin@example.com";
const PASSWORD = "demo123";

async function login(page) {
  await page.goto(`${BASE_URL}/auth`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
}

async function shot(page, name, clip) {
  const opts = { path: `${OUT_DIR}/${name}.png` };
  if (clip) opts.clip = clip;
  await page.screenshot(opts);
  console.log(`✓ ${name}.png`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  await login(page);

  // Navigate to Planejamento Operacional
  await page.goto(`${BASE_URL}/app/governanca/planejamento-operacional`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  // 1 — Full page: list + detail panel (Visão geral tab)
  await shot(page, "01-visao-geral");

  // Scroll detail panel down to see the full overview fields
  await page.evaluate(() => {
    const right = document.querySelector('[class*="overflow-y-auto"]');
    if (right) right.scrollTop = 200;
  });
  await page.waitForTimeout(400);
  await shot(page, "01b-visao-geral-scroll");

  // Reset scroll
  await page.evaluate(() => {
    const right = document.querySelector('[class*="overflow-y-auto"]');
    if (right) right.scrollTop = 0;
  });

  // 2 — Checklist tab
  await page.click('[role="tab"]:text("Checklist")');
  await page.waitForTimeout(600);
  await shot(page, "02-checklist");

  // 3 — Ciclos tab
  await page.click('[role="tab"]:text("Ciclos")');
  await page.waitForTimeout(600);
  await shot(page, "03-ciclos");

  // 4 — Mudanças tab
  await page.click('[role="tab"]:text("Mudanças")');
  await page.waitForTimeout(600);
  await shot(page, "04-mudancas");

  // 5 — New plan dialog
  await page.click('button:text("Novo plano operacional")');
  await page.waitForTimeout(800);
  await shot(page, "05-novo-plano-dialog");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  await browser.close();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
