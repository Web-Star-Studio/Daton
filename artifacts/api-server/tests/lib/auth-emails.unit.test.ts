import { describe, expect, it } from "vitest";
import { buildSetPasswordEmail } from "../../src/lib/auth-emails";

describe("buildSetPasswordEmail", () => {
  const url = "https://app.daton.com.br/auth/redefinir-senha?token=abc123";

  it("uses the welcome / set-password subject", () => {
    expect(buildSetPasswordEmail(url).subject).toBe(
      "Defina sua senha de acesso ao Daton",
    );
  });

  it("embeds the set-password link in the html", () => {
    expect(buildSetPasswordEmail(url).html).toContain(url);
  });

  it("states the 24-hour validity", () => {
    expect(buildSetPasswordEmail(url).html).toContain("24 horas");
  });

  it("has a call-to-action button", () => {
    expect(buildSetPasswordEmail(url).html).toContain("Definir minha senha");
  });
});
