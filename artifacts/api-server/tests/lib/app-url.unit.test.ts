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
    expect(getAppBaseUrl({ headers: {} })).toBe("https://app.daton.com.br");
  });

  it("falls back to x-forwarded-host when APP_BASE_URL is unset", () => {
    delete process.env.APP_BASE_URL;
    expect(
      getAppBaseUrl({ headers: { "x-forwarded-host": "api.example.com, other" } }),
    ).toBe("https://api.example.com");
  });

  it("falls back to the host header", () => {
    delete process.env.APP_BASE_URL;
    expect(getAppBaseUrl({ headers: { host: "h.example.com" } })).toBe(
      "https://h.example.com",
    );
  });

  it("defaults to localhost when nothing is available", () => {
    delete process.env.APP_BASE_URL;
    expect(getAppBaseUrl({ headers: {} })).toBe("http://localhost:3000");
  });
});
