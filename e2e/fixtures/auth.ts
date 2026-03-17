import { test as base, expect, type Page } from "@playwright/test";
import { cleanupTestData } from "../support/cleanup";
import { WEB_BASE_URL, WEB_ORIGIN } from "../support/config";
import {
  createCompletedOrgAdmin,
  makeTestPrefix,
  type CompletedOrgAdmin,
} from "../support/data";

type AuthFixtures = {
  orgAdmin: CompletedOrgAdmin;
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  orgAdmin: async ({}, use, testInfo) => {
    const prefix = makeTestPrefix(testInfo.title);

    try {
      const orgAdmin = await createCompletedOrgAdmin(prefix);
      await use(orgAdmin);
    } finally {
      await cleanupTestData(prefix);
    }
  },
  authenticatedPage: async ({ browser, orgAdmin }, use, testInfo) => {
    const context = await browser.newContext({
      baseURL: WEB_BASE_URL,
      storageState: {
        cookies: [],
        origins: [
          {
            origin: WEB_ORIGIN,
            localStorage: [{ name: "daton_token", value: orgAdmin.token }],
          },
        ],
      },
    });
    const page = await context.newPage();
    const failedApiResponses: string[] = [];

    page.on("response", async (response) => {
      if (!response.url().includes("/api/") || response.status() < 400) return;

      let bodyText = "";
      try {
        bodyText = await response.text();
      } catch {
        bodyText = "";
      }

      failedApiResponses.push(
        `${response.request().method()} ${response.url()} -> ${response.status()} ${bodyText}`,
      );
    });

    await page.goto(`${WEB_BASE_URL}/app`);
    try {
      await use(page);
    } finally {
      if (testInfo.status !== testInfo.expectedStatus && failedApiResponses.length > 0) {
        console.log("Failed API responses:");
        for (const entry of failedApiResponses) {
          console.log(entry);
        }
      }
      await context.close();
    }
  },
});

export { expect };
