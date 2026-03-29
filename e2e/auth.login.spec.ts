import { expect, test } from "./fixtures/auth";
import { WEB_BASE_URL } from "./support/config";

test("logs in via form and lands on the organization page", async ({
  page,
  orgAdmin,
}) => {
  await page.goto("/auth");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();

  await page.getByLabel("E-mail").fill(orgAdmin.email);
  await page.locator("#login-password").fill(orgAdmin.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/organizacao$/);
  await expect(page.getByText("Dados Cadastrais")).toBeVisible();
});

test("shows error for invalid credentials", async ({ page }) => {
  await page.goto("/auth");

  await page.getByLabel("E-mail").fill("nao-existe@daton.e2e");
  await page.locator("#login-password").fill("senhaerrada");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByText(/inválid|incorret|não encontrad/i)).toBeVisible();
});

test("logs out and redirects to the login page", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/organizacao");
  await expect(authenticatedPage.getByText("Dados Cadastrais")).toBeVisible();

  // The logout button is icon-only with title="Sair"
  await authenticatedPage.getByRole("button", { name: /sair/i }).click();

  // logout() navigates to BASE_URL ("/"), which renders the AuthPage
  await expect(authenticatedPage).toHaveURL(/\/(auth)?$/);
  await expect(
    authenticatedPage.getByRole("heading", { name: "Entrar" }),
  ).toBeVisible();
});
