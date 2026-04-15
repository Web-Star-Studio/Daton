import { getAuthHeaders, resolveApiUrl } from "@/lib/api";

export type CustomerAttachment = {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
};

export type CustomerRequirementSnapshot = {
  unitId: number | null;
  processId: number | null;
  responsibleUserId: number | null;
  serviceType: string;
  title: string;
  description: string;
  source: string | null;
  status: string;
  currentVersion: number;
};

export type CustomerListItem = {
  id: number;
  personType: "pj" | "pf";
  legalIdentifier: string;
  legalName: string;
  tradeName: string | null;
  responsibleName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  criticality: string;
  updatedAt: string | null;
  requirementCount: number;
  pendingRequirementCount: number;
  acceptedRequirementCount: number;
  restrictedRequirementCount: number;
};

export type CustomerRequirement = {
  id: number;
  organizationId: number;
  customerId: number;
  unitId: number | null;
  unitName: string | null;
  unit: { id: number; name: string } | null;
  processId: number | null;
  processName: string | null;
  process: { id: number; name: string } | null;
  responsibleUserId: number | null;
  responsibleUserName: string | null;
  responsibleUser: { id: number; name: string } | null;
  serviceType: string;
  title: string;
  description: string;
  source: string | null;
  status: string;
  currentVersion: number;
  createdById: number;
  updatedById: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CustomerRequirementReview = {
  id: number;
  requirementId: number;
  reviewedById: number;
  reviewedByName: string | null;
  decision: string;
  capacityAnalysis: string;
  restrictions: string | null;
  justification: string | null;
  decisionDate: string | null;
  attachments: CustomerAttachment[];
  createdAt: string | null;
};

export type CustomerRequirementHistory = {
  id: number;
  requirementId: number;
  changedById: number;
  changedByName: string | null;
  changeType: string;
  changeSummary: string | null;
  version: number;
  previousSnapshot: CustomerRequirementSnapshot | null;
  snapshot: CustomerRequirementSnapshot;
  createdAt: string | null;
};

export type CustomerDetail = {
  id: number;
  organizationId: number;
  personType: "pj" | "pf";
  legalIdentifier: string;
  legalName: string;
  tradeName: string | null;
  responsibleName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  criticality: string;
  notes: string | null;
  createdById: number;
  createdAt: string | null;
  updatedAt: string | null;
  requirements: CustomerRequirement[];
  reviews: CustomerRequirementReview[];
  history: CustomerRequirementHistory[];
};

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    let message = "Falha na requisição";
    try {
      const body = await response.json();
      if (body?.error) {
        message = body.error;
      }
    } catch {
      // ignore body parsing error
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const customersKeys = {
  all: ["customers"] as const,
  list: (
    orgId: number,
    filters?: Record<string, string | number | undefined>,
  ) => ["customers", orgId, "list", filters || {}] as const,
  detail: (orgId: number, customerId: number) =>
    ["customers", orgId, "detail", customerId] as const,
};

export function buildCustomerListPath(
  orgId: number,
  filters?: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return `/api/organizations/${orgId}/customers${query ? `?${query}` : ""}`;
}

export function listCustomers(
  orgId: number,
  filters?: Record<string, string | number | undefined>,
) {
  return apiJson<CustomerListItem[]>(buildCustomerListPath(orgId, filters));
}

export function createCustomer(orgId: number, body: Record<string, unknown>) {
  return apiJson<CustomerDetail>(`/api/organizations/${orgId}/customers`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateCustomer(
  orgId: number,
  customerId: number,
  body: Record<string, unknown>,
) {
  return apiJson<CustomerDetail>(
    `/api/organizations/${orgId}/customers/${customerId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export function getCustomerDetail(orgId: number, customerId: number) {
  return apiJson<CustomerDetail>(
    `/api/organizations/${orgId}/customers/${customerId}`,
  );
}

export function createCustomerRequirement(
  orgId: number,
  customerId: number,
  body: Record<string, unknown>,
) {
  return apiJson<CustomerDetail>(
    `/api/organizations/${orgId}/customers/${customerId}/requirements`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function updateCustomerRequirement(
  orgId: number,
  customerId: number,
  requirementId: number,
  body: Record<string, unknown>,
) {
  return apiJson<CustomerDetail>(
    `/api/organizations/${orgId}/customers/${customerId}/requirements/${requirementId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export function createCustomerRequirementReview(
  orgId: number,
  customerId: number,
  requirementId: number,
  body: Record<string, unknown>,
) {
  return apiJson<CustomerDetail>(
    `/api/organizations/${orgId}/customers/${customerId}/requirements/${requirementId}/reviews`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}
