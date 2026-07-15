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
  /** Id da norma do catálogo (regulatory_norms), como string do <Select>. */
  normId: string;
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
  normId,
  category,
  modality,
  statusFilter,
}: CatalogFilterInput): AllTrainingCatalogParams {
  return {
    search: search || undefined,
    normId: normId ? Number(normId) : undefined,
    category: category || undefined,
    modality: modality || undefined,
    status: statusFilter === "todos" ? undefined : statusFilter,
  };
}

/**
 * Itens para um PICKER de treinamento (dropdown de escolha em obrigatoriedades /
 * turmas / programa / lançamento de treino): só os ativos, mais o item
 * atualmente selecionado no form — mesmo que esteja arquivado. Sem o segundo
 * termo, editar um registro que aponta para um treino arquivado deixaria o
 * dropdown sem a opção selecionada (edição parece "vazia"). Isto é só para as
 * OPÇÕES do dropdown — o mapa id→título usado para exibir registros já criados
 * precisa continuar recebendo a lista inteira (ativos + inativos), nunca este
 * resultado filtrado.
 */
export function selectPickerCatalogItems(
  items: TrainingCatalogItem[],
  selectedId?: number | string | null,
): TrainingCatalogItem[] {
  const sel =
    selectedId == null || selectedId === "" ? null : Number(selectedId);
  return items.filter((c) => c.status === "ativo" || c.id === sel);
}

/**
 * Contagens devolvidas pelo backend no 409 de `DELETE .../training-catalog/{id}`
 * quando o item tem dependências (obrigatoriedades/turmas/PAT/lançamentos).
 * Não vem do codegen (o corpo do 409 não está tipado no OpenAPI) — espelha
 * o objeto `dependencies` montado em `artifacts/api-server/src/routes/training-catalog.ts`.
 */
export interface CatalogDeletionDependencies {
  obrigatoriedades: number;
  turmas: number;
  pat: number;
  pendencias: number;
  concluidos: number;
}

/**
 * Lê as dependências de um erro 409 de exclusão do catálogo, se for esse o
 * caso. `ApiError` não é exportado do client gerado (ver `lib/api-error.ts`),
 * então isto confia só na forma do objeto (duck typing), como o resto do
 * repo faz para checar `.status`/`.data` de erros de fetch.
 */
export function readCatalogDeletionDependencies(
  error: unknown,
): CatalogDeletionDependencies | null {
  if (typeof error !== "object" || error === null) return null;
  if ((error as { status?: unknown }).status !== 409) return null;

  const data = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const dependencies = (data as { dependencies?: unknown }).dependencies;
  if (typeof dependencies !== "object" || dependencies === null) return null;

  const raw = dependencies as Record<string, unknown>;
  const fields = [
    "obrigatoriedades",
    "turmas",
    "pat",
    "pendencias",
    "concluidos",
  ] as const;
  if (!fields.every((f) => typeof raw[f] === "number")) return null;

  return {
    obrigatoriedades: raw.obrigatoriedades as number,
    turmas: raw.turmas as number,
    pat: raw.pat as number,
    pendencias: raw.pendencias as number,
    concluidos: raw.concluidos as number,
  };
}

/** Singular quando n === 1, plural caso contrário (inclui 0 → plural). */
function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

/**
 * Mensagem do diálogo "excluir mesmo assim" (exclusão em cascata do catálogo).
 * Função pura a partir das contagens do 409, para ser testável sem depender
 * de render.
 *
 * Enquadramento de negócio (não é "perda de dados"): ao excluir o
 * treinamento, a obrigatoriedade "cargo X deve fazer Y" deixa de fazer
 * sentido — ela e as pendências ainda não realizadas somem junto. Quem já
 * concluiu mantém o registro, como histórico.
 */
export function describeCatalogDeletionImpact(
  dependencies: CatalogDeletionDependencies,
): string {
  const { obrigatoriedades, turmas, pat, pendencias, concluidos } =
    dependencies;

  // Cada parte é condicional às contagens: o 409 dispara por obrigatoriedade OU
  // turma OU PAT, então um item pode ter turmas/PAT com 0 obrigatoriedades — a
  // mensagem não pode afirmar "exigido de 0 cargos".
  const vinculos: string[] = [];
  if (obrigatoriedades > 0) {
    vinculos.push(
      `é exigido de ${obrigatoriedades} ${pluralize(obrigatoriedades, "cargo", "cargos")}`,
    );
  }
  const extras: string[] = [];
  if (turmas > 0) {
    extras.push(`${turmas} ${pluralize(turmas, "turma", "turmas")}`);
  }
  if (pat > 0) {
    extras.push(`${pat} ${pluralize(pat, "item", "itens")} do programa anual`);
  }
  if (extras.length > 0) {
    vinculos.push(`tem ${extras.join(" e ")}`);
  }
  const frase1 = `Este treinamento ${vinculos.join(" e ")}.`;

  const impactos: string[] = [];
  if (obrigatoriedades > 0) {
    impactos.push(
      `deixa de ser obrigatório para ${pluralize(obrigatoriedades, "esse cargo", "esses cargos")}`,
    );
  }
  if (pendencias > 0) {
    impactos.push(
      `${pendencias} ${pluralize(pendencias, "pendência", "pendências")} ainda não ` +
        `${pluralize(pendencias, "realizada", "realizadas")} ${pluralize(pendencias, "some", "somem")}`,
    );
  }
  const frase2 =
    impactos.length > 0
      ? `Ao excluir, ele ${impactos.join(" e ")}.`
      : "Ao excluir, esses vínculos são removidos.";

  const frase3 =
    concluidos > 0
      ? `O registro de ${concluidos} ${pluralize(concluidos, "colaborador", "colaboradores")} que já ` +
        `${pluralize(concluidos, "concluiu", "concluíram")} é preservado.`
      : "";

  return [frase1, frase2, frase3].filter(Boolean).join(" ");
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
