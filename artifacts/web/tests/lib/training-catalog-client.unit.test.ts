import { describe, expect, it, vi } from "vitest";
import {
  buildCatalogParams,
  fetchAllPages,
} from "@/lib/training-catalog-client";

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
