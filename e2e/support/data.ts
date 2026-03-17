import { API_BASE_URL } from "./config";

export interface PendingOrgAdmin {
  prefix: string;
  legalName: string;
  tradeName: string;
  legalIdentifier: string;
  adminFullName: string;
  email: string;
  password: string;
  organizationId: number;
  token: string;
}

export interface CompletedOrgAdmin extends PendingOrgAdmin {
  token: string;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

export function makeTestPrefix(seed: string) {
  const slug = slugify(seed) || "flow";
  return `${slug}-${Date.now()}-${randomSuffix()}`;
}

function buildLegalIdentifier(prefix: string) {
  const digits = prefix.replace(/\D/g, "").padStart(14, "0").slice(-14);
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

async function apiJson<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = init;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
  });

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

export async function createPendingOrgAdmin(
  prefix: string,
): Promise<PendingOrgAdmin> {
  const legalName = `E2E ${prefix} LTDA`;
  const tradeName = `E2E ${prefix}`;
  const adminFullName = `E2E ${prefix} Admin`;
  const email = `${prefix}@e2e.daton.example`;
  const password = "DatonE2E!123";
  const legalIdentifier = buildLegalIdentifier(prefix);

  const response = await apiJson<{
    user: { organizationId: number };
    token: string;
  }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      legalName,
      tradeName,
      legalIdentifier,
      adminFullName,
      adminEmail: email,
      password,
    }),
  });

  return {
    prefix,
    legalName,
    tradeName,
    legalIdentifier,
    adminFullName,
    email,
    password,
    organizationId: response.user.organizationId,
    token: response.token,
  };
}

export async function completeOrganizationOnboarding(
  pendingOrgAdmin: PendingOrgAdmin,
) {
  const response = await apiJson<{ token: string }>(
    `/api/organizations/${pendingOrgAdmin.organizationId}/onboarding/complete`,
    {
      method: "POST",
      token: pendingOrgAdmin.token,
      body: JSON.stringify({
        companyProfile: {
          sector: "technology",
          customSector: null,
          size: "medium",
          goals: ["quality", "compliance"],
          maturityLevel: "intermediate",
          currentChallenges: [`E2E challenge ${pendingOrgAdmin.prefix}`],
        },
        fiscalRegistration: {
          openingDate: "2020-01-01",
          taxRegime: "Lucro Real",
          primaryCnae: "6201-5/01",
          stateRegistration: `IE-${pendingOrgAdmin.prefix}`,
          municipalRegistration: `IM-${pendingOrgAdmin.prefix}`,
        },
      }),
    },
  );

  return {
    ...pendingOrgAdmin,
    token: response.token,
  };
}

export async function createCompletedOrgAdmin(prefix: string) {
  const pendingOrgAdmin = await createPendingOrgAdmin(prefix);
  return completeOrganizationOnboarding(pendingOrgAdmin);
}
