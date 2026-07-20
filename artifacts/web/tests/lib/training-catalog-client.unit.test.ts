import { describe, expect, it, vi } from "vitest";
import {
  buildCatalogParams,
  describeCatalogDeletionImpact,
  fetchAllPages,
  readCatalogDeletionDependencies,
  selectPickerCatalogItems,
  type CatalogDeletionDependencies,
} from "@/lib/training-catalog-client";
import type { TrainingCatalogItem } from "@workspace/api-client-react";

function page(items: number[], totalPages: number, total: number) {
  return {
    data: items.map((n) => ({ id: n, title: `T${n}` })),
    pagination: { page: 0, pageSize: 0, total, totalPages },
  };
}

describe("fetchAllPages", () => {
  it("returns the single page when there is only one", async () => {
    const fetchPage = vi.fn().mockResolvedValue(page([1, 2, 3], 1, 3));

    const all = await fetchAllPages(fetchPage, 200);

    expect(all.map((i) => i.id)).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(1, 200);
  });

  // The whole point: the result must be complete regardless of how many pages the
  // total spans — no ceiling. 840 items at pageSize 200 is 5 pages; every one is
  // fetched and flattened in order.
  it("fetches every page and flattens them in order", async () => {
    const totalPages = 5;
    const fetchPage = vi.fn(async (p: number) => {
      const start = (p - 1) * 200 + 1;
      const count = p < totalPages ? 200 : 40; // 4*200 + 40 = 840
      return page(
        Array.from({ length: count }, (_, i) => start + i),
        totalPages,
        840,
      );
    });

    const all = await fetchAllPages(fetchPage, 200);

    expect(all).toHaveLength(840);
    expect(all[0].id).toBe(1);
    expect(all[839].id).toBe(840);
    expect(fetchPage).toHaveBeenCalledTimes(5);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4, 5]);
  });

  it("passes the requested page size to every call", async () => {
    const fetchPage = vi.fn(async (p: number) =>
      page(p === 1 ? [1] : [2], 2, 2),
    );

    await fetchAllPages(fetchPage, 500);

    expect(fetchPage.mock.calls.map((c) => c[1])).toEqual([500, 500]);
  });

  it("returns an empty list when there is nothing", async () => {
    const fetchPage = vi.fn().mockResolvedValue(page([], 1, 0));

    expect(await fetchAllPages(fetchPage, 200)).toEqual([]);
  });
});

// A aba de Catálogo passa a buscar só ativos por padrão (cliente vai marcar
// 2.707 itens de histórico como inativo e eles não podem sumir da tela sem
// que o usuário peça). "todos" precisa sair do filtro (sem status = sem
// restrição no servidor); qualquer outro valor de statusFilter vai direto.
describe("buildCatalogParams", () => {
  const base = { search: "", normId: "", category: "", modality: "" };

  it('statusFilter "ativo" (padrão) filtra por status ativo', () => {
    expect(buildCatalogParams({ ...base, statusFilter: "ativo" }).status).toBe(
      "ativo",
    );
  });

  it('statusFilter "todos" remove o filtro de status (undefined, não "todos")', () => {
    expect(
      buildCatalogParams({ ...base, statusFilter: "todos" }).status,
    ).toBeUndefined();
  });

  it('statusFilter "inativo" filtra por status inativo', () => {
    expect(
      buildCatalogParams({ ...base, statusFilter: "inativo" }).status,
    ).toBe("inativo");
  });

  it("demais filtros vazios continuam virando undefined (comportamento existente)", () => {
    const params = buildCatalogParams({ ...base, statusFilter: "ativo" });
    expect(params.search).toBeUndefined();
    expect(params.normId).toBeUndefined();
    expect(params.category).toBeUndefined();
    expect(params.modality).toBeUndefined();
  });

  it("filtros preenchidos passam adiante (normId vira número)", () => {
    const params = buildCatalogParams({
      search: "NR-35",
      normId: "7",
      category: "Capacitação",
      modality: "Presencial",
      statusFilter: "todos",
    });
    expect(params).toEqual({
      search: "NR-35",
      normId: 7,
      category: "Capacitação",
      modality: "Presencial",
      status: undefined,
    });
  });
});

// Um cliente arquivou 2.715 itens do catálogo (status "inativo") — os pickers
// de treinamento (obrigatoriedades / turmas / programa / lançamento) precisam
// escondê-los das opções, sem quebrar a edição de um registro que já aponta
// para um treino hoje arquivado.
describe("selectPickerCatalogItems", () => {
  function item(id: number, status: string): TrainingCatalogItem {
    return {
      id,
      organizationId: 1,
      title: `Treino ${id}`,
      isMandatory: false,
      status,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }

  const catalog = [item(1, "ativo"), item(2, "inativo"), item(3, "ativo")];

  it("sem seleção, devolve só os ativos", () => {
    expect(selectPickerCatalogItems(catalog).map((c) => c.id)).toEqual([1, 3]);
  });

  it("exclui inativos que não são o selecionado", () => {
    const result = selectPickerCatalogItems(catalog, 1);
    expect(result.find((c) => c.id === 2)).toBeUndefined();
  });

  it("inclui o item inativo quando ele é o selecionado (caso da edição)", () => {
    const result = selectPickerCatalogItems(catalog, 2);
    expect(result.map((c) => c.id).sort()).toEqual([1, 2, 3]);
  });

  it("aceita selectedId como string e casa com o id numérico", () => {
    const result = selectPickerCatalogItems(catalog, "2");
    expect(result.map((c) => c.id).sort()).toEqual([1, 2, 3]);
  });

  it("selectedId vazio ou nulo não inclui nenhum inativo extra", () => {
    expect(selectPickerCatalogItems(catalog, "").map((c) => c.id)).toEqual([
      1, 3,
    ]);
    expect(selectPickerCatalogItems(catalog, null).map((c) => c.id)).toEqual([
      1, 3,
    ]);
  });
});

// A exclusão do catálogo agora suporta cascata (?cascade=true). Sem cascade, um
// item com dependências volta 409 com `{ error, dependencies }` — o frontend
// precisa ler essas contagens (readCatalogDeletionDependencies) e montar o
// texto de confirmação (describeCatalogDeletionImpact) certo, com pluralização
// correta, antes de deixar o usuário confirmar "excluir mesmo assim".
describe("readCatalogDeletionDependencies", () => {
  const dependencies: CatalogDeletionDependencies = {
    obrigatoriedades: 2,
    turmas: 1,
    pat: 0,
    pendencias: 3,
    concluidos: 5,
  };

  it("lê as dependências de um erro 409 com o corpo esperado", () => {
    const error = { status: 409, data: { error: "bloqueado", dependencies } };
    expect(readCatalogDeletionDependencies(error)).toEqual(dependencies);
  });

  it("devolve null quando o status não é 409", () => {
    const error = { status: 500, data: { dependencies } };
    expect(readCatalogDeletionDependencies(error)).toBeNull();
  });

  it("devolve null quando não há corpo de dependências", () => {
    expect(
      readCatalogDeletionDependencies({ status: 409, data: { error: "x" } }),
    ).toBeNull();
    expect(
      readCatalogDeletionDependencies({ status: 409, data: null }),
    ).toBeNull();
    expect(readCatalogDeletionDependencies({ status: 409 })).toBeNull();
  });

  it("devolve null para erros que não são objetos ApiError-like", () => {
    expect(readCatalogDeletionDependencies(new Error("boom"))).toBeNull();
    expect(readCatalogDeletionDependencies("boom")).toBeNull();
    expect(readCatalogDeletionDependencies(null)).toBeNull();
    expect(readCatalogDeletionDependencies(undefined)).toBeNull();
  });

  it("devolve null se algum campo de dependencies não for número", () => {
    const error = {
      status: 409,
      data: { dependencies: { ...dependencies, obrigatoriedades: "2" } },
    };
    expect(readCatalogDeletionDependencies(error)).toBeNull();
  });
});

describe("describeCatalogDeletionImpact", () => {
  it("só obrigatoriedades (sem turmas/PAT), plural de cargos/pendências/colaboradores", () => {
    const message = describeCatalogDeletionImpact({
      obrigatoriedades: 3,
      turmas: 0,
      pat: 0,
      pendencias: 2,
      concluidos: 5,
    });

    expect(message).toBe(
      "Este treinamento é exigido de 3 cargos. " +
        "Ao excluir, ele deixa de ser obrigatório para esses cargos e " +
        "2 pendências ainda não realizadas somem. " +
        "O registro de 5 colaboradores que já concluíram é preservado.",
    );
  });

  it("obrigatoriedades + turmas + PAT: menciona os três, singular de treino/turma/item", () => {
    const message = describeCatalogDeletionImpact({
      obrigatoriedades: 1,
      turmas: 2,
      pat: 4,
      pendencias: 0,
      concluidos: 1,
    });

    expect(message).toBe(
      "Este treinamento é exigido de 1 cargo e tem 2 turmas e 4 itens do programa anual. " +
        "Ao excluir, ele deixa de ser obrigatório para esse cargo. " +
        "O registro de 1 colaborador que já concluiu é preservado.",
    );
  });

  it("0 obrigatoriedades (só turmas/PAT): não afirma 'exigido de 0 cargos'", () => {
    const message = describeCatalogDeletionImpact({
      obrigatoriedades: 0,
      turmas: 2,
      pat: 0,
      pendencias: 0,
      concluidos: 0,
    });

    expect(message).not.toContain("cargo");
    expect(message).not.toContain("obrigatório");
    expect(message).toBe(
      "Este treinamento tem 2 turmas. Ao excluir, esses vínculos são removidos.",
    );
  });

  it("pendências e concluídos refletem os números certos (não zerados / não trocados)", () => {
    const message = describeCatalogDeletionImpact({
      obrigatoriedades: 4,
      turmas: 0,
      pat: 0,
      pendencias: 7,
      concluidos: 12,
    });

    expect(message).toContain("7 pendências ainda não realizadas somem");
    expect(message).toContain(
      "O registro de 12 colaboradores que já concluíram é preservado",
    );
  });

  it("não menciona turmas nem PAT quando ambos são zero", () => {
    const message = describeCatalogDeletionImpact({
      obrigatoriedades: 1,
      turmas: 0,
      pat: 0,
      pendencias: 0,
      concluidos: 0,
    });

    expect(message).not.toContain("turma");
    expect(message).not.toContain("item");
    expect(message).not.toContain("programa anual");
  });

  it("menciona só turmas quando o PAT é zero", () => {
    const message = describeCatalogDeletionImpact({
      obrigatoriedades: 2,
      turmas: 3,
      pat: 0,
      pendencias: 0,
      concluidos: 0,
    });

    expect(message).toContain("3 turmas");
    expect(message).not.toContain("programa anual");
  });

  it("menciona só o PAT quando as turmas são zero", () => {
    const message = describeCatalogDeletionImpact({
      obrigatoriedades: 2,
      turmas: 0,
      pat: 1,
      pendencias: 0,
      concluidos: 0,
    });

    expect(message).toContain("1 item do programa anual");
    expect(message).not.toContain("turma");
  });

  it("pluraliza 1 cargo (singular) vs N cargos (plural) corretamente", () => {
    const one = describeCatalogDeletionImpact({
      obrigatoriedades: 1,
      turmas: 0,
      pat: 0,
      pendencias: 0,
      concluidos: 0,
    });
    const many = describeCatalogDeletionImpact({
      obrigatoriedades: 5,
      turmas: 0,
      pat: 0,
      pendencias: 0,
      concluidos: 0,
    });

    expect(one).toContain("exigido de 1 cargo.");
    expect(one).toContain("para esse cargo");
    expect(many).toContain("exigido de 5 cargos.");
    expect(many).toContain("para esses cargos");
  });
});
