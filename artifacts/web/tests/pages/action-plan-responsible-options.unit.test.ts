import { describe, expect, it } from "vitest";
import { buildResponsibleOptions } from "@/pages/app/planos-acao/_components/responsible-options";

const ana = { id: 1, name: "ANA ADMIN" };
const thais = { id: 9, name: "THAIS BRITO" };

describe("buildResponsibleOptions", () => {
  it("lists every org user when the caller may read the user list", () => {
    const options = buildResponsibleOptions([ana, thais], 9, "THAIS BRITO");

    expect(options).toEqual([
      { value: "1", label: "ANA ADMIN" },
      { value: "9", label: "THAIS BRITO" },
    ]);
  });

  // GET /organizations/:id/users answers 403 to operators, so `orgUsers` is empty
  // for them. Without the plan's own responsibleUserName the field would render
  // its "Selecione" placeholder and hide who actually owns the action.
  it("falls back to the plan's responsible name when the user list is unavailable", () => {
    const options = buildResponsibleOptions([], 9, "THAIS BRITO");

    expect(options).toEqual([{ value: "9", label: "THAIS BRITO" }]);
  });

  it("labels the current responsible even when the plan carries no name", () => {
    const options = buildResponsibleOptions([], 9, null);

    expect(options).toEqual([{ value: "9", label: "Responsável atual" }]);
  });

  it("does not duplicate the responsible already present in the user list", () => {
    const options = buildResponsibleOptions([thais], 9, "THAIS BRITO");

    expect(options).toEqual([{ value: "9", label: "THAIS BRITO" }]);
  });

  it("returns an empty list when there is no responsible and no user list", () => {
    expect(buildResponsibleOptions([], null, null)).toEqual([]);
  });

  it("keeps the user list untouched when the plan has no responsible", () => {
    expect(buildResponsibleOptions([ana], null, null)).toEqual([
      { value: "1", label: "ANA ADMIN" },
    ]);
  });
});
