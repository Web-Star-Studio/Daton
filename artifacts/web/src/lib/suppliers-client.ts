import { getAuthHeaders, resolveApiUrl } from "@/lib/api";

export type SupplierAttachment = {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
};

export type SupplierCategory = {
  id: number;
  organizationId: number;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type SupplierType = {
  id: number;
  organizationId: number;
  categoryId: number | null;
  parentTypeId: number | null;
  name: string;
  description: string | null;
  documentThreshold: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type SupplierDocumentRequirement = {
  id: number;
  organizationId: number;
  categoryId: number | null;
  typeId: number | null;
  name: string;
  description: string | null;
  weight: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type SupplierDocumentRequirementImportRow = {
  rowNumber: number;
  name: string;
  weight: number | null;
  description: string | null;
  action: "create" | "update" | "invalid";
  existingRequirementId: number | null;
  errors: string[];
};

export type SupplierDocumentRequirementImportPreview = {
  rows: SupplierDocumentRequirementImportRow[];
  summary: {
    totalRows: number;
    createCount: number;
    updateCount: number;
    errorCount: number;
  };
};

export type SupplierDocumentRequirementImportInputRow = {
  rowNumber?: number;
  name?: string;
  weight?: number | string;
  description?: string | null;
};

export type SupplierImportInputRow = {
  rowNumber?: number;
  legalIdentifier?: string;
  personType?: string;
  legalName?: string;
  tradeName?: string | null;
  responsibleName?: string | null;
  phone?: string | null;
  email?: string | null;
  postalCode?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  unitNames?: string;
  categoryName?: string;
  typeNames?: string;
  notes?: string | null;
};

export type SupplierImportPreview = {
  rows: Array<{
    rowNumber: number;
    action: "create" | "update" | "invalid";
    personType: "pj" | "pf" | null;
    legalIdentifier: string;
    legalIdentifierDigits: string;
    legalName: string;
    tradeName: string | null;
    responsibleName: string | null;
    phone: string | null;
    email: string | null;
    postalCode: string | null;
    street: string | null;
    streetNumber: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    notes: string | null;
    categoryId: number | null;
    unitIds: number[];
    typeIds: number[];
    existingSupplierId: number | null;
    errors: string[];
  }>;
  summary: {
    totalRows: number;
    createCount: number;
    updateCount: number;
    errorCount: number;
  };
};

export type SupplierListItem = {
  id: number;
  personType: "pj" | "pf";
  legalIdentifier: string;
  legalName: string;
  tradeName: string | null;
  responsibleName: string | null;
  status: string;
  criticality: string;
  category: { id: number; name: string } | null;
  units: Array<{ id: number; name: string }>;
  types: Array<{ id: number; name: string }>;
  documentCompliancePercentage: number | null;
  documentReviewStatus: string | null;
  documentReviewNextDate: string | null;
  qualifiedUntil: string | null;
  latestQualification: {
    decision: string;
    validUntil: string | null;
    createdAt: string | null;
  } | null;
  latestPerformance: {
    conclusion: string;
    riskLevel: string;
    finalScore: number;
    createdAt: string | null;
  } | null;
  updatedAt: string | null;
};

export type SupplierOffering = {
  id: number;
  supplierId: number;
  name: string;
  offeringType: "product" | "service";
  unitOfMeasure: string | null;
  description: string | null;
  status: string;
  isApprovedScope: number;
  createdAt: string;
  updatedAt: string;
};

export type SupplierRequirementTemplate = {
  id: number;
  title: string;
  version: number;
  status: string;
  categoryId: number | null;
  typeId: number | null;
  content: string;
  changeSummary: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SupplierRequirementCommunication = {
  id: number;
  templateId: number;
  templateTitle: string;
  templateVersion: number;
  status: string;
  notes: string | null;
  acknowledgedAt: string | null;
  createdAt: string | null;
};

export type SupplierDocumentSubmission = {
  id: number;
  requirementId: number;
  requirementName: string;
  weight: number;
  typeId: number | null;
  categoryId: number | null;
  submissionStatus: string;
  adequacyStatus: string;
  validityDate: string | null;
  exemptionReason: string | null;
  rejectionReason: string | null;
  observations: string | null;
  attachments: SupplierAttachment[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type SupplierDocumentReview = {
  id: number;
  reviewedById: number | null;
  compliancePercentage: number;
  threshold: number;
  result: string;
  nextReviewDate: string | null;
  criteriaSnapshot: Array<{
    requirementId: number;
    requirementName: string;
    weight: number;
    status: string;
    adequacy: string | null;
  }>;
  observations: string | null;
  createdAt: string | null;
};

export type SupplierQualificationReview = {
  id: number;
  supplierId: number;
  reviewedById: number | null;
  decision: string;
  validUntil: string | null;
  notes: string | null;
  attachments: SupplierAttachment[];
  approvedOfferings: Array<{
    offeringId: number;
    name: string;
    offeringType: "product" | "service";
  }>;
  createdAt: string | null;
};

export type SupplierPerformanceReview = {
  id: number;
  offeringId: number | null;
  offeringName: string | null;
  periodStart: string;
  periodEnd: string;
  qualityScore: number;
  deliveryScore: number;
  communicationScore: number;
  complianceScore: number;
  priceScore: number | null;
  finalScore: number;
  riskLevel: string;
  conclusion: string;
  observations: string | null;
  createdAt: string | null;
};

export type SupplierReceiptCheck = {
  id: number;
  offeringId: number | null;
  offeringName: string | null;
  unitId: number | null;
  unitName: string | null;
  authorizedById: number | null;
  receiptDate: string;
  description: string;
  referenceNumber: string | null;
  quantity: string | null;
  totalValue: number | null;
  outcome: string;
  acceptanceCriteria: string;
  notes: string | null;
  nonConformityStatus: string;
  nonConformitySummary: string | null;
  attachments: SupplierAttachment[];
  createdAt: string | null;
};

export type SupplierFailure = {
  id: number;
  supplierId: number;
  performanceReviewId: number | null;
  receiptCheckId: number | null;
  failureType: string;
  severity: string;
  occurredAt: string | null;
  description: string;
  status: string;
  createdById: number | null;
  createdAt: string | null;
};

export type SupplierDetail = {
  id: number;
  organizationId: number;
  personType: "pj" | "pf";
  legalIdentifier: string;
  legalName: string;
  tradeName: string | null;
  responsibleName: string | null;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  rg: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  postalCode: string | null;
  street: string | null;
  streetNumber: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  status: string;
  criticality: string;
  notes: string | null;
  category: { id: number; name: string } | null;
  units: Array<{ id: number; name: string }>;
  types: Array<{
    id: number;
    name: string;
    categoryId: number | null;
    parentTypeId: number | null;
    documentThreshold: number;
  }>;
  offerings: SupplierOffering[];
  documentCompliancePercentage: number | null;
  documentReviewStatus: string | null;
  documentReviewNextDate: string | null;
  qualifiedUntil: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: { id: number; name: string } | null;
  documents: {
    submissions: SupplierDocumentSubmission[];
    reviews: SupplierDocumentReview[];
  };
  requirements: {
    templates: SupplierRequirementTemplate[];
    communications: SupplierRequirementCommunication[];
  };
  qualificationReviews: SupplierQualificationReview[];
  performanceReviews: SupplierPerformanceReview[];
  receiptChecks: SupplierReceiptCheck[];
  failures: SupplierFailure[];
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

export const suppliersKeys = {
  all: ["suppliers"] as const,
  list: (orgId: number, filters?: Record<string, string | number | undefined>) =>
    ["suppliers", orgId, "list", filters || {}] as const,
  detail: (orgId: number, supplierId: number) =>
    ["suppliers", orgId, "detail", supplierId] as const,
  categories: (orgId: number) => ["suppliers", orgId, "categories"] as const,
  types: (orgId: number) => ["suppliers", orgId, "types"] as const,
  requirements: (orgId: number) => ["suppliers", orgId, "requirements"] as const,
  templates: (orgId: number) => ["suppliers", orgId, "templates"] as const,
};

export function buildSupplierListPath(
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
  return `/api/organizations/${orgId}/suppliers${query ? `?${query}` : ""}`;
}

export function listSuppliers(
  orgId: number,
  filters?: Record<string, string | number | undefined>,
) {
  return apiJson<SupplierListItem[]>(buildSupplierListPath(orgId, filters));
}

export function getSupplierDetail(orgId: number, supplierId: number) {
  return apiJson<SupplierDetail>(`/api/organizations/${orgId}/suppliers/${supplierId}`);
}

export function exportSuppliers(orgId: number) {
  return apiJson<{
    rows: Array<{
      legalIdentifier: string;
      personType: string;
      legalName: string;
      tradeName: string;
      responsibleName: string;
      phone: string;
      email: string;
      postalCode: string;
      street: string;
      streetNumber: string;
      neighborhood: string;
      city: string;
      state: string;
      unitNames: string;
      categoryName: string;
      typeNames: string;
      notes: string;
    }>;
  }>(`/api/organizations/${orgId}/suppliers/export`);
}

export function previewSuppliersImport(orgId: number, rows: SupplierImportInputRow[]) {
  return apiJson<SupplierImportPreview>(`/api/organizations/${orgId}/suppliers/import-preview`, {
    method: "POST",
    body: JSON.stringify({ rows }),
  });
}

export function commitSuppliersImport(orgId: number, rows: SupplierImportInputRow[]) {
  return apiJson<{ imported: number; created: number; updated: number }>(
    `/api/organizations/${orgId}/suppliers/import-commit`,
    {
      method: "POST",
      body: JSON.stringify({ rows }),
    },
  );
}

export function listSupplierCategories(orgId: number) {
  return apiJson<SupplierCategory[]>(`/api/organizations/${orgId}/supplier-categories`);
}

export function createSupplierCategory(orgId: number, body: {
  name: string;
  description?: string | null;
  status: string;
}) {
  return apiJson<SupplierCategory>(`/api/organizations/${orgId}/supplier-categories`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateSupplierCategory(orgId: number, categoryId: number, body: {
  name: string;
  description?: string | null;
  status: string;
}) {
  return apiJson<SupplierCategory>(`/api/organizations/${orgId}/supplier-categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function listSupplierTypes(orgId: number) {
  return apiJson<SupplierType[]>(`/api/organizations/${orgId}/supplier-types`);
}

export function createSupplierType(orgId: number, body: {
  name: string;
  description?: string | null;
  status: string;
  documentThreshold: number;
  categoryId?: number | null;
  parentTypeId?: number | null;
}) {
  return apiJson<SupplierType>(`/api/organizations/${orgId}/supplier-types`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateSupplierType(orgId: number, typeId: number, body: {
  name: string;
  description?: string | null;
  status: string;
  documentThreshold: number;
  categoryId?: number | null;
  parentTypeId?: number | null;
}) {
  return apiJson<SupplierType>(`/api/organizations/${orgId}/supplier-types/${typeId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function listSupplierDocumentRequirements(orgId: number) {
  return apiJson<SupplierDocumentRequirement[]>(`/api/organizations/${orgId}/supplier-document-requirements`);
}

export function createSupplierDocumentRequirement(orgId: number, body: {
  name: string;
  description?: string | null;
  weight: number;
  status: string;
  categoryId?: number | null;
  typeId?: number | null;
}) {
  return apiJson<SupplierDocumentRequirement>(`/api/organizations/${orgId}/supplier-document-requirements`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateSupplierDocumentRequirement(orgId: number, requirementId: number, body: {
  name: string;
  description?: string | null;
  weight: number;
  status: string;
  categoryId?: number | null;
  typeId?: number | null;
}) {
  return apiJson<SupplierDocumentRequirement>(
    `/api/organizations/${orgId}/supplier-document-requirements/${requirementId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export function previewSupplierDocumentRequirementsImport(
  orgId: number,
  rows: SupplierDocumentRequirementImportInputRow[],
) {
  return apiJson<SupplierDocumentRequirementImportPreview>(
    `/api/organizations/${orgId}/supplier-document-requirements/import-preview`,
    {
      method: "POST",
      body: JSON.stringify({ rows }),
    },
  );
}

export function commitSupplierDocumentRequirementsImport(
  orgId: number,
  rows: SupplierDocumentRequirementImportInputRow[],
) {
  return apiJson<{ imported: number; created: number; updated: number }>(
    `/api/organizations/${orgId}/supplier-document-requirements/import-commit`,
    {
      method: "POST",
      body: JSON.stringify({ rows }),
    },
  );
}

export function exportSupplierDocumentRequirements(orgId: number) {
  return apiJson<{ rows: Array<{ name: string; weight: number; description: string }> }>(
    `/api/organizations/${orgId}/supplier-document-requirements/export`,
  );
}

export function listSupplierRequirementTemplates(orgId: number) {
  return apiJson<SupplierRequirementTemplate[]>(`/api/organizations/${orgId}/supplier-requirement-templates`);
}

export function createSupplierRequirementTemplate(orgId: number, body: {
  title: string;
  content: string;
  status: string;
  changeSummary?: string | null;
  categoryId?: number | null;
  typeId?: number | null;
}) {
  return apiJson<SupplierRequirementTemplate>(`/api/organizations/${orgId}/supplier-requirement-templates`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createSupplier(orgId: number, body: Record<string, unknown>) {
  return apiJson<SupplierDetail>(`/api/organizations/${orgId}/suppliers`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateSupplier(orgId: number, supplierId: number, body: Record<string, unknown>) {
  return apiJson<SupplierDetail>(`/api/organizations/${orgId}/suppliers/${supplierId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function createSupplierOffering(orgId: number, supplierId: number, body: Record<string, unknown>) {
  return apiJson<SupplierOffering>(`/api/organizations/${orgId}/suppliers/${supplierId}/offerings`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createSupplierDocumentSubmission(orgId: number, supplierId: number, body: Record<string, unknown>) {
  return apiJson(`/api/organizations/${orgId}/suppliers/${supplierId}/document-submissions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createSupplierDocumentReview(orgId: number, supplierId: number, body: Record<string, unknown>) {
  return apiJson(`/api/organizations/${orgId}/suppliers/${supplierId}/document-reviews`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createSupplierRequirementCommunication(orgId: number, supplierId: number, body: Record<string, unknown>) {
  return apiJson(`/api/organizations/${orgId}/suppliers/${supplierId}/requirement-communications`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createSupplierQualificationReview(orgId: number, supplierId: number, body: Record<string, unknown>) {
  return apiJson(`/api/organizations/${orgId}/suppliers/${supplierId}/qualification-reviews`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createSupplierPerformanceReview(orgId: number, supplierId: number, body: Record<string, unknown>) {
  return apiJson(`/api/organizations/${orgId}/suppliers/${supplierId}/performance-reviews`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createSupplierReceiptCheck(orgId: number, supplierId: number, body: Record<string, unknown>) {
  return apiJson(`/api/organizations/${orgId}/suppliers/${supplierId}/receipt-checks`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createSupplierFailure(orgId: number, supplierId: number, body: Record<string, unknown>) {
  return apiJson(`/api/organizations/${orgId}/suppliers/${supplierId}/failures`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
