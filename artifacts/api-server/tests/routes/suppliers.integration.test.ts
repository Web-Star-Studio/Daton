import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { db, supplierFailuresTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createSupplier,
  createSupplierCategory,
  createSupplierDocumentRequirement,
  createSupplierOffering,
  createSupplierType,
  createTestContext,
  createTestUser,
  createUnit,
  getSupplierStatus,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(
    contexts.splice(0).map((context) => cleanupTestContext(context)),
  );
});

describe("suppliers routes", () => {
  it("requires supplier module access for non-admin users", async () => {
    const context = await createTestContext({
      seed: "suppliers-module-access",
      role: "analyst",
    });
    contexts.push(context);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/suppliers`)
      .set(authHeader(context));

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("Sem acesso");
  });

  it("creates a supplier and rejects category/type/unit references from another organization", async () => {
    const context = await createTestContext({ seed: "suppliers-create" });
    const foreignContext = await createTestContext({
      seed: "suppliers-foreign",
    });
    contexts.push(context, foreignContext);

    const category = await createSupplierCategory(context, "Serviços");
    const type = await createSupplierType(context, {
      name: "Consultoria",
      categoryId: category.id,
    });
    const unit = await createUnit(context, `Unidade ${context.prefix}`);

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/suppliers`)
      .set(authHeader(context))
      .send({
        personType: "pj",
        legalIdentifier: `${context.prefix}-001`,
        legalName: `Fornecedor ${context.prefix}`,
        categoryId: category.id,
        typeIds: [type.id],
        unitIds: [unit.id],
        status: "draft",
        criticality: "medium",
      });

    expect(created.status).toBe(201);
    expect(created.body.legalName).toBe(`Fornecedor ${context.prefix}`);
    expect(created.body.units).toHaveLength(1);
    expect(created.body.types).toHaveLength(1);

    const foreignCategory = await createSupplierCategory(
      foreignContext,
      "Externo",
    );
    const invalid = await request(app)
      .post(`/api/organizations/${context.organizationId}/suppliers`)
      .set(authHeader(context))
      .send({
        personType: "pj",
        legalIdentifier: `${context.prefix}-002`,
        legalName: `Fornecedor inválido ${context.prefix}`,
        categoryId: foreignCategory.id,
        typeIds: [],
        unitIds: [],
        status: "draft",
        criticality: "medium",
      });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toContain("Referências inválidas");
  });

  it("persists the document threshold on supplier types and keeps it editable via API", async () => {
    const context = await createTestContext({ seed: "suppliers-type-threshold" });
    contexts.push(context);
    const category = await createSupplierCategory(context, "Serviços críticos");

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/supplier-types`)
      .set(authHeader(context))
      .send({
        name: "Laboratório externo",
        categoryId: category.id,
        documentThreshold: 92,
        status: "active",
      });

    expect(created.status).toBe(201);
    expect(created.body.documentThreshold).toBe(92);

    const updated = await request(app)
      .patch(`/api/organizations/${context.organizationId}/supplier-types/${created.body.id}`)
      .set(authHeader(context))
      .send({
        name: "Laboratório externo",
        categoryId: category.id,
        documentThreshold: 88,
        status: "inactive",
      });

    expect(updated.status).toBe(200);
    expect(updated.body.documentThreshold).toBe(88);
    expect(updated.body.status).toBe("inactive");
  });

  it("previews, commits and exports the supplier document requirements catalog", async () => {
    const context = await createTestContext({ seed: "suppliers-document-import" });
    contexts.push(context);

    await createSupplierDocumentRequirement(context, {
      name: "Certidão Federal",
      weight: 4,
    });

    const preview = await request(app)
      .post(`/api/organizations/${context.organizationId}/supplier-document-requirements/import-preview`)
      .set(authHeader(context))
      .send({
        rows: [
          {
            rowNumber: 2,
            name: "Certidão Federal",
            weight: 5,
            description: "Versão atualizada",
          },
          {
            rowNumber: 3,
            name: "Alvará municipal",
            weight: 3,
            description: "Documento obrigatório",
          },
        ],
      });

    expect(preview.status).toBe(200);
    expect(preview.body.summary.createCount).toBe(1);
    expect(preview.body.summary.updateCount).toBe(1);
    expect(preview.body.summary.errorCount).toBe(0);

    const commit = await request(app)
      .post(`/api/organizations/${context.organizationId}/supplier-document-requirements/import-commit`)
      .set(authHeader(context))
      .send({
        rows: [
          {
            rowNumber: 2,
            name: "Certidão Federal",
            weight: 5,
            description: "Versão atualizada",
          },
          {
            rowNumber: 3,
            name: "Alvará municipal",
            weight: 3,
            description: "Documento obrigatório",
          },
        ],
      });

    expect(commit.status).toBe(201);
    expect(commit.body.created).toBe(1);
    expect(commit.body.updated).toBe(1);

    const exportResponse = await request(app)
      .get(`/api/organizations/${context.organizationId}/supplier-document-requirements/export`)
      .set(authHeader(context));

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.body.rows).toEqual([
      {
        name: "Alvará municipal",
        weight: 3,
        description: "Documento obrigatório",
      },
      {
        name: "Certidão Federal",
        weight: 5,
        description: "Versão atualizada",
      },
    ]);
  });

  it("requires an apt document review before qualification and updates supplier status", async () => {
    const context = await createTestContext({
      seed: "suppliers-qualification",
    });
    contexts.push(context);
    const category = await createSupplierCategory(context, "Materiais");
    const type = await createSupplierType(context, {
      name: "Fornecimento crítico",
      categoryId: category.id,
      documentThreshold: 90,
    });
    const requirement = await createSupplierDocumentRequirement(context, {
      name: "Certidão fiscal",
      categoryId: category.id,
    });
    const supplier = await createSupplier(context, {
      legalIdentifier: `${context.prefix}-doc`,
      legalName: `Fornecedor documental ${context.prefix}`,
      categoryId: category.id,
      typeIds: [type.id],
    });
    const offering = await createSupplierOffering(supplier.id, {
      name: "Insumo crítico",
      offeringType: "product",
      isApprovedScope: true,
    });

    const blockedQualification = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/suppliers/${supplier.id}/qualification-reviews`,
      )
      .set(authHeader(context))
      .send({
        decision: "approved",
        validUntil: "2026-12-31",
        approvedOfferingIds: [offering.id],
      });

    expect(blockedQualification.status).toBe(400);
    expect(blockedQualification.body.error).toContain(
      "avaliação documental apta",
    );

    const submission = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/suppliers/${supplier.id}/document-submissions`,
      )
      .set(authHeader(context))
      .send({
        requirementId: requirement.id,
        submissionStatus: "approved",
        adequacyStatus: "adequate",
      });

    expect(submission.status).toBe(201);

    const review = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/suppliers/${supplier.id}/document-reviews`,
      )
      .set(authHeader(context))
      .send({
        nextReviewDate: "2026-10-01",
      });

    expect(review.status).toBe(201);
    expect(review.body.threshold).toBe(90);

    const afterReview = await getSupplierStatus(supplier.id);
    expect(afterReview?.documentReviewStatus).toBe("apt");
    expect(afterReview?.status).toBe("pending_qualification");

    const qualification = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/suppliers/${supplier.id}/qualification-reviews`,
      )
      .set(authHeader(context))
      .send({
        decision: "approved",
        validUntil: "2026-12-31",
        approvedOfferingIds: [offering.id],
      });

    expect(qualification.status).toBe(201);

    const afterQualification = await getSupplierStatus(supplier.id);
    expect(afterQualification?.status).toBe("approved");
    expect(afterQualification?.qualifiedUntil).toBe("2026-12-31");
  });

  it("allows operators to create receipt checks, validates refs and records failures", async () => {
    const context = await createTestContext({ seed: "suppliers-receipts" });
    const foreignContext = await createTestContext({
      seed: "suppliers-receipts-foreign",
    });
    contexts.push(context, foreignContext);

    const unit = await createUnit(context, `Recebimento ${context.prefix}`);
    const supplier = await createSupplier(context, {
      legalIdentifier: `${context.prefix}-receipt`,
      legalName: `Fornecedor recebimento ${context.prefix}`,
      unitIds: [unit.id],
    });
    const offering = await createSupplierOffering(supplier.id, {
      name: "Produto recebido",
      offeringType: "product",
    });
    const operator = await createTestUser(context, {
      role: "operator",
      suffix: "operator",
      modules: ["suppliers"],
    });
    const authorizer = await createTestUser(context, {
      role: "analyst",
      suffix: "authorizer",
      modules: ["suppliers"],
    });
    const foreignAuthorizer = await createTestUser(foreignContext, {
      role: "analyst",
      suffix: "outsider",
      modules: ["suppliers"],
    });

    const invalid = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/suppliers/${supplier.id}/receipt-checks`,
      )
      .set({ Authorization: `Bearer ${operator.token}` })
      .send({
        offeringId: offering.id,
        unitId: unit.id,
        authorizedById: foreignAuthorizer.id,
        receiptDate: "2026-03-01",
        description: "Lote 01",
        outcome: "accepted",
        acceptanceCriteria: "Conforme pedido",
      });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toContain("Autorizador inválido");

    const receipt = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/suppliers/${supplier.id}/receipt-checks`,
      )
      .set({ Authorization: `Bearer ${operator.token}` })
      .send({
        offeringId: offering.id,
        unitId: unit.id,
        authorizedById: authorizer.id,
        receiptDate: "2026-03-01",
        description: "Lote 02",
        outcome: "rejected",
        acceptanceCriteria: "Inspeção visual e dimensional",
        nonConformityStatus: "pending_handoff",
        nonConformitySummary: "Material fora da especificação",
      });

    expect(receipt.status).toBe(201);
    expect(receipt.body.authorizedById).toBe(authorizer.id);

    const failures = await db
      .select()
      .from(supplierFailuresTable)
      .where(eq(supplierFailuresTable.supplierId, supplier.id));

    expect(failures).toHaveLength(1);
    expect(failures[0].failureType).toBe("quality");

    const manualFailure = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/suppliers/${supplier.id}/failures`,
      )
      .set(authHeader(context))
      .send({
        receiptCheckId: receipt.body.id,
        failureType: "documentation",
        severity: "high",
        description: "NF ausente",
      });

    expect(manualFailure.status).toBe(201);
    expect(manualFailure.body.receiptCheckId).toBe(receipt.body.id);
  });
});
