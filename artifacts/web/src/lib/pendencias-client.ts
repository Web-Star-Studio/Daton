import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders, resolveApiUrl } from "@/lib/api";
import type { PendenciasResponse } from "@/lib/pendencias-format";

export * from "@/lib/pendencias-format";

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || "Erro ao carregar pendências");
  }
  return response.json() as Promise<T>;
}

export type PendenciasScope = "mine" | "unit" | "org";

export interface PendenciasParams {
  scope: PendenciasScope;
  unitId?: number | null;
  dueSoonDays?: number;
}

export const pendenciasKeys = {
  list: (orgId: number, params: PendenciasParams) =>
    ["pendencias", orgId, params.scope, params.unitId ?? null, params.dueSoonDays ?? 7] as const,
};

export async function fetchPendencias(
  orgId: number,
  params: PendenciasParams,
): Promise<PendenciasResponse> {
  const qs = new URLSearchParams();
  qs.set("scope", params.scope);
  if (params.scope === "unit" && params.unitId != null) qs.set("unitId", String(params.unitId));
  if (params.dueSoonDays != null) qs.set("dueSoonDays", String(params.dueSoonDays));
  return apiJson<PendenciasResponse>(`/api/organizations/${orgId}/pendencias?${qs.toString()}`);
}

export function usePendencias(
  orgId: number | undefined,
  params: PendenciasParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: pendenciasKeys.list(orgId ?? 0, params),
    queryFn: () => fetchPendencias(orgId as number, params),
    enabled: (options?.enabled ?? true) && !!orgId && (params.scope !== "unit" || params.unitId != null),
  });
}
