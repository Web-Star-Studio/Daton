import { eq } from "drizzle-orm";
import {
  db,
  customersTable,
  departmentsTable,
  departmentUnitsTable,
  employeesTable,
  organizationsTable,
  positionsTable,
  supplierCategoriesTable,
  supplierDocumentRequirementsTable,
  supplierOfferingsTable,
  supplierTypesTable,
  suppliersTable,
  supplierTypeLinksTable,
  supplierUnitsTable,
  unitsTable,
  userModulePermissionsTable,
  usersTable,
} from "@workspace/db";
import {
  issueAuthToken,
  type AppModule,
  type UserRole,
} from "../../artifacts/api-server/src/middlewares/auth";
import { cleanupTestData } from "../../e2e/support/cleanup";
import { makeTestPrefix } from "../../e2e/support/data";

export interface TestOrgContext {
  prefix: string;
  organizationId: number;
  userId: number;
  token: string;
  role: UserRole;
}

export async function createTestContext(options: {
  seed: string;
  role?: UserRole;
  modules?: AppModule[];
}) {
  const prefix = makeTestPrefix(options.seed);
  await cleanupTestData(prefix);

  const [organization] = await db
    .insert(organizationsTable)
    .values({
      name: `E2E ${prefix} LTDA`,
      tradeName: `E2E ${prefix}`,
      legalIdentifier: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
      onboardingStatus: "completed",
      authVersion: 1,
    })
    .returning({ id: organizationsTable.id });

  const role = options.role ?? "org_admin";
  const [user] = await db
    .insert(usersTable)
    .values({
      name: `E2E ${prefix} User`,
      email: `${prefix}@e2e.daton.example`,
      passwordHash: "test-password-hash",
      organizationId: organization.id,
      role,
    })
    .returning({ id: usersTable.id });

  if (options.modules?.length) {
    await db.insert(userModulePermissionsTable).values(
      options.modules.map((module) => ({
        userId: user.id,
        module,
      })),
    );
  }

  const token = await issueAuthToken({
    userId: user.id,
    organizationId: organization.id,
    role,
  });

  return {
    prefix,
    organizationId: organization.id,
    userId: user.id,
    token,
    role,
  } satisfies TestOrgContext;
}

export async function cleanupTestContext(
  context: Pick<TestOrgContext, "prefix">,
) {
  await cleanupTestData(context.prefix);
}

export function authHeader(context: Pick<TestOrgContext, "token">) {
  return { Authorization: `Bearer ${context.token}` };
}

export async function createTestUser(
  context: Pick<TestOrgContext, "organizationId" | "prefix">,
  options: {
    role?: UserRole;
    suffix?: string;
    modules?: AppModule[];
  } = {},
) {
  const role = options.role ?? "analyst";
  const suffix = options.suffix ?? "member";
  const [user] = await db
    .insert(usersTable)
    .values({
      name: `E2E ${context.prefix} ${suffix}`,
      email: `${context.prefix}-${suffix}@e2e.daton.example`,
      passwordHash: "test-password-hash",
      organizationId: context.organizationId,
      role,
    })
    .returning({ id: usersTable.id });

  if (options.modules?.length) {
    await db.insert(userModulePermissionsTable).values(
      options.modules.map((module) => ({
        userId: user.id,
        module,
      })),
    );
  }

  const token = await issueAuthToken({
    userId: user.id,
    organizationId: context.organizationId,
    role,
  });

  return { id: user.id, token, role };
}

export async function createUnit(
  context: Pick<TestOrgContext, "organizationId" | "prefix">,
  name = `Unidade ${context.prefix}`,
) {
  const [unit] = await db
    .insert(unitsTable)
    .values({
      organizationId: context.organizationId,
      name,
      type: "filial",
      status: "ativa",
    })
    .returning();

  return unit;
}

export async function createDepartment(
  context: Pick<TestOrgContext, "organizationId">,
  options: { name: string; description?: string | null; unitIds?: number[] },
) {
  const [department] = await db
    .insert(departmentsTable)
    .values({
      organizationId: context.organizationId,
      name: options.name,
      description: options.description ?? null,
    })
    .returning();

  if (options.unitIds?.length) {
    await db.insert(departmentUnitsTable).values(
      options.unitIds.map((unitId) => ({
        departmentId: department.id,
        unitId,
      })),
    );
  }

  return department;
}

export async function createPosition(
  context: Pick<TestOrgContext, "organizationId">,
  options: { name: string; requirements?: string | null } = { name: "Cargo" },
) {
  const [position] = await db
    .insert(positionsTable)
    .values({
      organizationId: context.organizationId,
      name: options.name,
      requirements: options.requirements ?? null,
    })
    .returning();

  return position;
}

export async function createEmployee(
  context: Pick<TestOrgContext, "organizationId">,
  options: {
    name: string;
    unitId?: number | null;
    department?: string | null;
    position?: string | null;
    admissionDate?: string;
  },
) {
  const [employee] = await db
    .insert(employeesTable)
    .values({
      organizationId: context.organizationId,
      name: options.name,
      unitId: options.unitId ?? null,
      department: options.department ?? null,
      position: options.position ?? null,
      admissionDate: options.admissionDate ?? "2024-01-10",
      contractType: "clt",
      status: "active",
    })
    .returning();

  return employee;
}

export async function createSupplierCategory(
  context: Pick<TestOrgContext, "organizationId">,
  name: string,
) {
  const [category] = await db
    .insert(supplierCategoriesTable)
    .values({
      organizationId: context.organizationId,
      name,
      status: "active",
    })
    .returning();

  return category;
}

export async function createSupplierType(
  context: Pick<TestOrgContext, "organizationId">,
  options: {
    name: string;
    categoryId?: number | null;
    parentTypeId?: number | null;
    documentThreshold?: number;
  },
) {
  const [type] = await db
    .insert(supplierTypesTable)
    .values({
      organizationId: context.organizationId,
      name: options.name,
      categoryId: options.categoryId ?? null,
      parentTypeId: options.parentTypeId ?? null,
      documentThreshold: options.documentThreshold ?? 80,
      status: "active",
    })
    .returning();

  return type;
}

export async function createSupplierDocumentRequirement(
  context: Pick<TestOrgContext, "organizationId">,
  options: {
    name: string;
    categoryId?: number | null;
    typeId?: number | null;
    weight?: number;
  },
) {
  const [requirement] = await db
    .insert(supplierDocumentRequirementsTable)
    .values({
      organizationId: context.organizationId,
      name: options.name,
      categoryId: options.categoryId ?? null,
      typeId: options.typeId ?? null,
      weight: options.weight ?? 3,
      status: "active",
    })
    .returning();

  return requirement;
}

export async function createSupplier(
  context: Pick<TestOrgContext, "organizationId" | "userId">,
  options: {
    legalIdentifier: string;
    legalName: string;
    categoryId?: number | null;
    typeIds?: number[];
    unitIds?: number[];
    personType?: "pj" | "pf";
  },
) {
  const [supplier] = await db
    .insert(suppliersTable)
    .values({
      organizationId: context.organizationId,
      createdById: context.userId,
      categoryId: options.categoryId ?? null,
      personType: options.personType ?? "pj",
      legalIdentifier: options.legalIdentifier,
      legalName: options.legalName,
      status: "draft",
      criticality: "medium",
    })
    .returning();

  if (options.unitIds?.length) {
    await db.insert(supplierUnitsTable).values(
      options.unitIds.map((unitId) => ({
        supplierId: supplier.id,
        unitId,
      })),
    );
  }

  if (options.typeIds?.length) {
    await db.insert(supplierTypeLinksTable).values(
      options.typeIds.map((typeId) => ({
        supplierId: supplier.id,
        typeId,
      })),
    );
  }

  return supplier;
}

export async function createSupplierOffering(
  supplierId: number,
  options: {
    name: string;
    offeringType?: "product" | "service";
    isApprovedScope?: boolean;
  },
) {
  const [offering] = await db
    .insert(supplierOfferingsTable)
    .values({
      supplierId,
      name: options.name,
      offeringType: options.offeringType ?? "service",
      status: "active",
      isApprovedScope: options.isApprovedScope ? 1 : 0,
    })
    .returning();

  return offering;
}

export async function createCustomer(
  context: Pick<TestOrgContext, "organizationId" | "userId">,
  options: {
    legalIdentifier: string;
    legalName: string;
    personType?: "pj" | "pf";
    criticality?: "low" | "medium" | "high";
  },
) {
  const [customer] = await db
    .insert(customersTable)
    .values({
      organizationId: context.organizationId,
      createdById: context.userId,
      personType: options.personType ?? "pj",
      legalIdentifier: options.legalIdentifier,
      legalName: options.legalName,
      status: "active",
      criticality: options.criticality ?? "medium",
    })
    .returning();

  return customer;
}

export async function getSupplierStatus(supplierId: number) {
  const [supplier] = await db
    .select({
      status: suppliersTable.status,
      documentReviewStatus: suppliersTable.documentReviewStatus,
      documentCompliancePercentage: suppliersTable.documentCompliancePercentage,
      qualifiedUntil: suppliersTable.qualifiedUntil,
    })
    .from(suppliersTable)
    .where(eq(suppliersTable.id, supplierId));

  return supplier;
}
