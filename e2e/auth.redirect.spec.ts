import { WEB_BASE_URL } from "./support/config";
import { expect, test } from "./fixtures/auth";

test("redirects unauthenticated users from protected routes to /auth", async ({
  page,
}) => {
  await page.goto("/organizacao");

  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});

test("redirects authenticated org admins away from /auth", async ({
  authenticatedPage,
}) => {
  await authenticatedPage.goto(`${WEB_BASE_URL}/auth`);

  await expect(authenticatedPage).toHaveURL(/\/organizacao$/);
  await expect(authenticatedPage.getByText("Dados Cadastrais")).toBeVisible();
});
