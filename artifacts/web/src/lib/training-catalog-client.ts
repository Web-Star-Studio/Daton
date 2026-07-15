import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import {
  listTrainingCatalog,
  type ListTrainingCatalogParams,
  type PaginatedTrainingCatalog,
  type TrainingCatalogItem,
} from "@workspace/api-client-react";

/**
 * The training catalog is a bounded but unbounded-in-count reference list — one
 * org (Gabardo) already has 840 entries, and it grows. The list endpoint paginates
 * (default 50), and screens that need the WHOLE catalog — the catalog grid, and the
 * training pickers in obrigatoriedades / turmas / programa — were either taking the
 * 50-item default or a fixed pageSize of 500. Both cut the alphabetical tail off:
 * everything from "G" on became invisible and unselectable. Bumping the number is
 * the band-aid that already leaked (500 < 840). This client fetches EVERY page, so
 * the result is complete regardless of count.
 */

const PAGE_SIZE = 200;

interface PageLike<T> {
  data: T[];
  pagination: { total: number; totalPages: number };
}

/**
 * Fetch all pages and flatten them, in order. Pure and count-independent: reads the
 * first page's `totalPages`, then fetches the rest in parallel. `fetchPage` is
 * injected so this is unit-testable without the network.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<PageLike<T>>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const first = await fetchPage(1, pageSize);
  if (first.pagination.totalPages <= 1) {
    return first.data;
  }
  const rest = await Promise.all(
    Array.from({ length: first.pagination.totalPages - 1 }, (_, i) =>
      fetchPage(i + 2, pageSize),
    ),
  );
  return rest.reduce((acc, p) => acc.concat(p.data), first.data.slice());
}

export type AllTrainingCatalogParams = Omit<
  ListTrainingCatalogParams,
  "page" | "pageSize"
>;

export interface CatalogFilterInput {
  search: string;
  norm: string;
  category: string;
  modality: string;
  /** "ativo" | "inativo" | "todos" — "todos" remove o filtro de status. */
  statusFilter: string;
}

/**
 * Monta os params de busca do Catálogo a partir dos filtros da tela. Função
 * pura (sem React) para ser testável direto: o único ponto que exige atenção
 * é que `statusFilter: "todos"` precisa virar `status: undefined` — enviar a
 * string "todos" ao servidor não filtraria nada do jeito certo, e mudar essa
 * regra silenciosamente traria de volta os itens inativos por padrão.
 */
export function buildCatalogParams({
  search,
  norm,
  category,
  modality,
  statusFilter,
}: CatalogFilterInput): AllTrainingCatalogParams {
  return {
    search: search || undefined,
    norm: norm || undefined,
    category: category || undefined,
    modality: modality || undefined,
    status: statusFilter === "todos" ? undefined : statusFilter,
  };
}

/**
 * The whole training catalog for an org, with the same server-side filters the
 * paginated endpoint accepts (search / norm / category / modality / status), but
 * with no page cap. Returns the same shape as `useListTrainingCatalog` — a
 * `PaginatedTrainingCatalog` whose `data` holds every matching item — so callers
 * can swap the hook in without touching how they read the result.
 */
export function useAllTrainingCatalog(
  orgId: number,
  params?: AllTrainingCatalogParams,
  options?: {
    query?: Partial<UseQueryOptions<PaginatedTrainingCatalog>>;
  },
) {
  return useQuery<PaginatedTrainingCatalog>({
    queryKey: ["all-training-catalog", orgId, params ?? {}],
    queryFn: async ({ signal }) => {
      // Forward the abort signal to every page request, so a superseded query
      // (e.g. the filter changed mid-fetch) stops issuing the remaining pages
      // instead of draining the whole catalog for a search the user moved past.
      const data = await fetchAllPages<TrainingCatalogItem>((page, pageSize) =>
        listTrainingCatalog(orgId, { ...params, page, pageSize }, { signal }),
      );
      return {
        data,
        pagination: {
          page: 1,
          pageSize: data.length,
          total: data.length,
          totalPages: 1,
        },
      };
    },
    ...options?.query,
  });
}
