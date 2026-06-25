import { afterEach, describe, expect, it } from "vitest";
import { getAppBaseUrl } from "../../src/lib/app-url";

const ORIGINAL = process.env.APP_BASE_URL;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = ORIGINAL;
});

describe("getAppBaseUrl", () => {
  it("uses APP_BASE_URL when set, without a trailing slash", () => {
    process.env.APP_BASE_URL = "https://app.daton.com.br/";
    expect(getAppBaseUrl()).toBe("https://app.daton.com.br");
  });

  it("falls back to localhost when APP_BASE_URL is unset (never derives from request headers)", () => {
    delete process.env.APP_BASE_URL;
    expect(getAppBaseUrl()).toBe("http://localhost:3000");
  });
});
