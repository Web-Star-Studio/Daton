import { API_BASE_URL } from "./config";
import type { CompletedOrgAdmin } from "./data";

export interface GovernancePlanSummary {
  id: number;
  title: string;
  status: string;
  complianceIssues: string[];
  metrics: {
    riskOpportunityCount: number;
    openRiskOpportunityCount: number;
    overdueRiskOpportunityCount: number;
    riskOpportunitiesByType: Record<string, number>;
  };
}

export interface GovernanceRiskOpportunityItem {
  id: number;
  planId: number;
  type: "risk" | "opportunity";
  title: string;
  description: string;
  status: string;
  score: number | null;
  priority: "na" | "low" | "medium" | "high" | "critical";
  latestEffectivenessResult?: "effective" | "ineffective" | null;
  latestEffectivenessReview?: {
    result: "effective" | "ineffective";
    comment?: string | null;
    createdAt: string;
  };
  actions: Array<{ id: number; title: string; status: string }>;
}

export interface GovernanceRiskOpportunityListItem
  extends GovernanceRiskOpportunityItem {
  planTitle: string;
}

export interface GovernancePlanDetail extends GovernancePlanSummary {
  riskOpportunityItems: GovernanceRiskOpportunityItem[];
}

type GovernanceRequestInit = RequestInit & {
  bodyJson?: unknown;
};

export async function governanceFetch(
  orgAdmin: CompletedOrgAdmin,
  path: string,
  init: GovernanceRequestInit = {},
) {
  const { bodyJson, headers, ...rest } = init;

  return fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      ...(bodyJson !== undefined ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${orgAdmin.token}`,
      ...(headers || {}),
    },
    body: bodyJson !== undefined ? JSON.stringify(bodyJson) : rest.body,
  });
}

export async function governanceJson<T>(
  orgAdmin: CompletedOrgAdmin,
  path: string,
  init: GovernanceRequestInit = {},
): Promise<T> {
  const response = await governanceFetch(orgAdmin, path, init);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return body as T;
}

export async function getCurrentUser(orgAdmin: CompletedOrgAdmin) {
  const response = await governanceJson<{
    user: { id: number; name: string; organizationId: number };
  }>(orgAdmin, "/api/auth/me");

  return response.user;
}

export async function createGovernanceDraftPlan(
  orgAdmin: CompletedOrgAdmin,
  title: string,
) {
  return governanceJson<GovernancePlanDetail>(
    orgAdmin,
    `/api/organizations/${orgAdmin.organizationId}/governance/strategic-plans`,
    {
      method: "POST",
      bodyJson: { title },
    },
  );
}

export async function getGovernancePlan(
  orgAdmin: CompletedOrgAdmin,
  planId: number,
) {
  return governanceJson<GovernancePlanDetail>(
    orgAdmin,
    `/api/organizations/${orgAdmin.organizationId}/governance/strategic-plans/${planId}`,
  );
}

export async function listGovernancePlans(orgAdmin: CompletedOrgAdmin) {
  return governanceJson<GovernancePlanSummary[]>(
    orgAdmin,
    `/api/organizations/${orgAdmin.organizationId}/governance/strategic-plans`,
  );
}

export async function createRiskOpportunityItem(
  orgAdmin: CompletedOrgAdmin,
  planId: number,
  body: Record<string, unknown>,
) {
  return governanceJson<GovernanceRiskOpportunityItem>(
    orgAdmin,
    `/api/organizations/${orgAdmin.organizationId}/governance/strategic-plans/${planId}/risk-opportunity-items`,
    {
      method: "POST",
      bodyJson: body,
    },
  );
}

export async function createGovernanceSwotItem(
  orgAdmin: CompletedOrgAdmin,
  planId: number,
  body: Record<string, unknown>,
) {
  return governanceJson<{ id: number; description: string }>(
    orgAdmin,
    `/api/organizations/${orgAdmin.organizationId}/governance/strategic-plans/${planId}/swot-items`,
    {
      method: "POST",
      bodyJson: body,
    },
  );
}

export async function listGovernanceRiskOpportunityItems(
  orgAdmin: CompletedOrgAdmin,
  query: Record<string, string | number | undefined> = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }

  const search = params.toString();
  const path = `/api/organizations/${orgAdmin.organizationId}/governance/risk-opportunity-items${
    search ? `?${search}` : ""
  }`;

  return governanceJson<GovernanceRiskOpportunityListItem[]>(orgAdmin, path);
}

export async function createGovernanceAction(
  orgAdmin: CompletedOrgAdmin,
  planId: number,
  body: Record<string, unknown>,
) {
  return governanceJson<{ id: number; title: string; status: string }>(
    orgAdmin,
    `/api/organizations/${orgAdmin.organizationId}/governance/strategic-plans/${planId}/actions`,
    {
      method: "POST",
      bodyJson: body,
    },
  );
}

export async function createRiskEffectivenessReview(
  orgAdmin: CompletedOrgAdmin,
  planId: number,
  itemId: number,
  body: { result: "effective" | "ineffective"; comment?: string | null },
) {
  return governanceJson<GovernanceRiskOpportunityItem>(
    orgAdmin,
    `/api/organizations/${orgAdmin.organizationId}/governance/strategic-plans/${planId}/risk-opportunity-items/${itemId}/effectiveness-review`,
    {
      method: "POST",
      bodyJson: body,
    },
  );
}

export async function submitGovernancePlan(
  orgAdmin: CompletedOrgAdmin,
  planId: number,
) {
  return governanceJson<GovernancePlanDetail>(
    orgAdmin,
    `/api/organizations/${orgAdmin.organizationId}/governance/strategic-plans/${planId}/submit`,
    {
      method: "POST",
      bodyJson: {},
    },
  );
}
