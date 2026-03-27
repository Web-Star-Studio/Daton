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

  it("reuses catalog items across suppliers and keeps downstream evaluations working", async () => {
    const context = await createTestContext({ seed: "suppliers-catalog-items" });
    contexts.push(context);

    const category = await createSupplierCategory(context, "Insumos");
    const type = await createSupplierType(context, {
      name: "Fornecedor homologado",
      categoryId: category.id,
    });
    const unit = await createUnit(context, "Matriz Catálogo");

    const catalogItem = await request(app)
      .post(`/api/organizations/${context.organizationId}/supplier-catalog-items`)
      .set(authHeader(context))
      .send({
        name: "Kit de calibração",
        offeringType: "product",
        unitOfMeasure: "kit",
        description: "Item reutilizável",
        status: "active",
      });

    expect(catalogItem.status).toBe(201);

    const firstSupplier = await request(app)
      .post(`/api/organizations/${context.organizationId}/suppliers`)
      .set(authHeader(context))
      .send({
        personType: "pj",
        legalIdentifier: "11122233000144",
        legalName: "Fornecedor catálogo A",
        responsibleName: "Maria A",
        email: "maria.a@example.com",
        categoryId: category.id,
        typeIds: [type.id],
        unitIds: [unit.id],
        catalogItemIds: [catalogItem.body.id],
        status: "draft",
        criticality: "medium",
      });

    const secondSupplier = await request(app)
      .post(`/api/organizations/${context.organizationId}/suppliers`)
      .set(authHeader(context))
      .send({
        personType: "pj",
        legalIdentifier: "11122233000155",
        legalName: "Fornecedor catálogo B",
        responsibleName: "Maria B",
        email: "maria.b@example.com",
        categoryId: category.id,
        typeIds: [type.id],
        unitIds: [unit.id],
        catalogItemIds: [catalogItem.body.id],
        status: "draft",
        criticality: "medium",
      });

    expect(firstSupplier.status).toBe(201);
    expect(secondSupplier.status).toBe(201);
    expect(firstSupplier.body.offerings).toHaveLength(1);
    expect(secondSupplier.body.offerings).toHaveLength(1);
    expect(firstSupplier.body.offerings[0].catalogItemId).toBe(catalogItem.body.id);
    expect(secondSupplier.body.offerings[0].catalogItemId).toBe(catalogItem.body.id);

    const performanceReview = await request(app)
      .post(`/api/organizations/${context.organizationId}/suppliers/${firstSupplier.body.id}/performance-reviews`)
      .set(authHeader(context))
      .send({
        offeringId: firstSupplier.body.offerings[0].id,
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        qualityScore: 8,
        deliveryScore: 9,
        communicationScore: 8,
        complianceScore: 9,
        priceScore: 7,
        conclusion: "maintain",
        riskLevel: "low",
      });

    expect(performanceReview.status).toBe(201);
    expect(performanceReview.body.offeringId).toBe(firstSupplier.body.offerings[0].id);
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

  it("previews, commits and exports suppliers from the workbook layout", async () => {
    const context = await createTestContext({ seed: "suppliers-import-export" });
    contexts.push(context);

    const category = await createSupplierCategory(context, "Serviços laboratoriais");
    const type = await createSupplierType(context, {
      name: "Calibração",
      categoryId: category.id,
      documentThreshold: 87,
    });
    const unit = await createUnit(context, "Matriz Recife");
    const existingSupplier = await createSupplier(context, {
      legalIdentifier: "12345678000199",
      legalName: "Fornecedor legado",
      categoryId: category.id,
      typeIds: [type.id],
      unitIds: [unit.id],
      personType: "pj",
    });

    const invalidPreview = await request(app)
      .post(`/api/organizations/${context.organizationId}/suppliers/import-preview`)
      .set(authHeader(context))
      .send({
        rows: [
          {
            rowNumber: 2,
            legalIdentifier: "12.345.678/0001-99",
            personType: "PJ",
            legalName: "Fornecedor legado atualizado",
            responsibleName: "Marina Souza",
            phone: "(81) 98888-0000",
            email: "marina@legado.example",
            postalCode: "52000-000",
            street: "Rua das Flores",
            streetNumber: "120",
            neighborhood: "Centro",
            city: "Recife",
            state: "PE",
            unitNames: "Matriz Recife",
            categoryName: "Serviços laboratoriais",
            typeNames: "Calibração",
            notes: "Atualizado por importação",
          },
          {
            rowNumber: 3,
            legalIdentifier: "987.654.321-00",
            personType: "PF",
            legalName: "João Técnico",
            phone: "(81) 97777-0000",
            postalCode: "52110-120",
            street: "Av. Norte",
            streetNumber: "45",
            neighborhood: "Casa Amarela",
            city: "Recife",
            state: "PE",
            unitNames: "Unidade inexistente",
            categoryName: "Serviços laboratoriais",
            typeNames: "Calibração",
            notes: "Linha inválida",
          },
        ],
      });

    expect(invalidPreview.status).toBe(200);
    expect(invalidPreview.body.summary.updateCount).toBe(1);
    expect(invalidPreview.body.summary.errorCount).toBe(1);
    expect(invalidPreview.body.rows[1].action).toBe("invalid");
    expect(invalidPreview.body.rows[1].errors).toContain("Unidade de negócio não encontrada: Unidade inexistente.");

    const validRows = [
      {
        rowNumber: 2,
        legalIdentifier: "12.345.678/0001-99",
        personType: "PJ",
        legalName: "Fornecedor legado atualizado",
        tradeName: "Legado Lab",
        responsibleName: "Marina Souza",
        phone: "(81) 98888-0000",
        email: "marina@legado.example",
        postalCode: "52000-000",
        street: "Rua das Flores",
        streetNumber: "120",
        neighborhood: "Centro",
        city: "Recife",
        state: "PE",
        unitNames: "Matriz Recife",
        categoryName: "Serviços laboratoriais",
        typeNames: "Calibração",
        notes: "Atualizado por importação",
      },
      {
        rowNumber: 3,
        legalIdentifier: "98.765.432/0001-10",
        personType: "PJ",
        legalName: "Novo fornecedor importado",
        tradeName: "Novo Lab",
        responsibleName: "Carlos Lima",
        phone: "(81) 97777-0000",
        email: "carlos@novo.example",
        postalCode: "52110-120",
        street: "Av. Norte",
        streetNumber: "45",
        neighborhood: "Casa Amarela",
        city: "Recife",
        state: "PE",
        unitNames: "Matriz Recife",
        categoryName: "Serviços laboratoriais",
        typeNames: "Calibração",
        notes: "Criado por importação",
      },
    ];

    const commit = await request(app)
      .post(`/api/organizations/${context.organizationId}/suppliers/import-commit`)
      .set(authHeader(context))
      .send({ rows: validRows });

    expect(commit.status).toBe(201);
    expect(commit.body.created).toBe(1);
    expect(commit.body.updated).toBe(1);

    const detailResponse = await request(app)
      .get(`/api/organizations/${context.organizationId}/suppliers/${existingSupplier.id}`)
      .set(authHeader(context));

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.legalName).toBe("Fornecedor legado atualizado");
    expect(detailResponse.body.tradeName).toBe("Legado Lab");
    expect(detailResponse.body.responsibleName).toBe("Marina Souza");
    expect(detailResponse.body.postalCode).toBe("52000-000");

    const exportResponse = await request(app)
      .get(`/api/organizations/${context.organizationId}/suppliers/export`)
      .set(authHeader(context));

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.body.rows).toEqual([
      {
        legalIdentifier: "12.345.678/0001-99",
        personType: "PJ",
        legalName: "Fornecedor legado atualizado",
        tradeName: "Legado Lab",
        responsibleName: "Marina Souza",
        phone: "(81) 98888-0000",
        email: "marina@legado.example",
        postalCode: "52000-000",
        street: "Rua das Flores",
        streetNumber: "120",
        neighborhood: "Centro",
        city: "Recife",
        state: "PE",
        unitNames: "Matriz Recife",
        categoryName: "Serviços laboratoriais",
        typeNames: "Calibração",
        notes: "Atualizado por importação",
      },
      {
        legalIdentifier: "98.765.432/0001-10",
        personType: "PJ",
        legalName: "Novo fornecedor importado",
        tradeName: "Novo Lab",
        responsibleName: "Carlos Lima",
        phone: "(81) 97777-0000",
        email: "carlos@novo.example",
        postalCode: "52110-120",
        street: "Av. Norte",
        streetNumber: "45",
        neighborhood: "Casa Amarela",
        city: "Recife",
        state: "PE",
        unitNames: "Matriz Recife",
        categoryName: "Serviços laboratoriais",
        typeNames: "Calibração",
        notes: "Criado por importação",
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
