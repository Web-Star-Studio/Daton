import { describe, expect, it } from "vitest";
import {
  buildCoResponsibleOptions,
  buildResponsibleOptions,
} from "@/pages/app/planos-acao/_components/responsible-options";

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

describe("buildCoResponsibleOptions", () => {
  const ORG = [
    { id: 1, name: "Ana" },
    { id: 2, name: "Bruno" },
    { id: 3, name: "Carla" },
  ];

  it("exclui o ponto focal das opções (ninguém é responsável duas vezes)", () => {
    const options = buildCoResponsibleOptions(ORG, [], 2);
    expect(options.map((o) => o.value)).toEqual([1, 3]);
  });

  it("semeia co-responsáveis ausentes da lista da org (operador sem permissão de listar)", () => {
    const options = buildCoResponsibleOptions([], [{ userId: 9, name: "Diego" }], null);
    expect(options).toEqual([{ value: 9, label: "Diego" }]);
  });

  it("não duplica co-responsável que já está na lista da org", () => {
    const options = buildCoResponsibleOptions(ORG, [{ userId: 3, name: "Carla" }], null);
    expect(options.map((o) => o.value)).toEqual([1, 2, 3]);
  });
});
