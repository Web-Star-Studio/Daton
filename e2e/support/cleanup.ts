import { inArray, like } from "drizzle-orm";
import {
  db,
  documentApproversTable,
  documentAttachmentsTable,
  documentCriticalAnalysisTable,
  documentCriticalReviewersTable,
  documentElaboratorsTable,
  documentRecipientsTable,
  documentReferencesTable,
  documentRecipientGroupLinksTable,
  documentsTable,
  documentUnitsTable,
  documentVersionsTable,
  departmentsTable,
  departmentUnitsTable,
  employeeAwarenessTable,
  employeeCompetenciesTable,
  employeeProfileItemAttachmentsTable,
  employeeProfileItemsTable,
  employeesTable,
  employeeTrainingsTable,
  employeeUnitsTable,
  legislationsTable,
  organizationContactGroupMembersTable,
  organizationContactGroupsTable,
  organizationContactsTable,
  organizationsTable,
  positionsTable,
  supplierCategoriesTable,
  supplierDocumentRequirementsTable,
  supplierDocumentReviewsTable,
  supplierDocumentSubmissionsTable,
  supplierFailuresTable,
  supplierOfferingsTable,
  supplierPerformanceReviewsTable,
  supplierQualificationReviewsTable,
  supplierReceiptChecksTable,
  supplierRequirementCommunicationsTable,
  supplierRequirementTemplatesTable,
  suppliersTable,
  supplierTypeLinksTable,
  supplierTypesTable,
  supplierUnitsTable,
  strategicPlanActionsTable,
  strategicPlanActionUnitsTable,
  strategicPlanInterestedPartiesTable,
  strategicPlanObjectivesTable,
  strategicPlanRiskOpportunityEffectivenessReviewsTable,
  strategicPlanRiskOpportunityItemsTable,
  strategicPlansTable,
  strategicPlanRevisionsTable,
  strategicPlanSwotItemsTable,
  unitLegislationsTable,
  unitsTable,
  userModulePermissionsTable,
  usersTable,
  notificationsTable,
  correctiveActionsTable,
  internalAuditChecklistItemsTable,
  internalAuditFindingsTable,
  internalAuditsTable,
  managementReviewInputsTable,
  managementReviewOutputsTable,
  managementReviewsTable,
  nonconformitiesTable,
  sgqProcessInteractionsTable,
  sgqProcessesTable,
  sgqProcessRevisionsTable,
} from "@workspace/db";

type CleanupTransaction = Pick<typeof db, "delete">;

async function deleteStandaloneUsers(
  tx: CleanupTransaction,
  userIds: number[],
) {
  if (userIds.length === 0) {
    return;
  }

  await tx
    .delete(notificationsTable)
    .where(inArray(notificationsTable.userId, userIds));
  await tx
    .delete(userModulePermissionsTable)
    .where(inArray(userModulePermissionsTable.userId, userIds));
  await tx.delete(usersTable).where(inArray(usersTable.id, userIds));
}

export async function cleanupTestData(prefix: string) {
  await db.transaction(async (tx) => {
    const orgs = await tx
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(like(organizationsTable.name, `E2E ${prefix}%`));

    const prefixedUsers = await tx
      .select({ id: usersTable.id, organizationId: usersTable.organizationId })
      .from(usersTable)
      .where(like(usersTable.email, `${prefix}%@e2e.daton.example`));

    const orgIds = Array.from(new Set(orgs.map((org) => org.id)));
    const standalonePrefixedUsers = prefixedUsers.filter(
      (user) => !orgIds.includes(user.organizationId),
    );
    const standaloneUserIds = standalonePrefixedUsers.map((user) => user.id);

    if (orgIds.length === 0) {
      await deleteStandaloneUsers(tx, standaloneUserIds);
      return;
    }

    const users = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.organizationId, orgIds));
    const userIds = users.map((user) => user.id);

    const units = await tx
      .select({ id: unitsTable.id })
      .from(unitsTable)
      .where(inArray(unitsTable.organizationId, orgIds));
    const unitIds = units.map((unit) => unit.id);

    const departments = await tx
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(inArray(departmentsTable.organizationId, orgIds));
    const departmentIds = departments.map((department) => department.id);

    const positions = await tx
      .select({ id: positionsTable.id })
      .from(positionsTable)
      .where(inArray(positionsTable.organizationId, orgIds));
    const positionIds = positions.map((position) => position.id);

    const employees = await tx
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(inArray(employeesTable.organizationId, orgIds));
    const employeeIds = employees.map((employee) => employee.id);

    const suppliers = await tx
      .select({ id: suppliersTable.id })
      .from(suppliersTable)
      .where(inArray(suppliersTable.organizationId, orgIds));
    const supplierIds = suppliers.map((supplier) => supplier.id);

    const documents = await tx
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(inArray(documentsTable.organizationId, orgIds));
    const documentIds = documents.map((document) => document.id);

    const supplierCategories = await tx
      .select({ id: supplierCategoriesTable.id })
      .from(supplierCategoriesTable)
      .where(inArray(supplierCategoriesTable.organizationId, orgIds));
    const supplierCategoryIds = supplierCategories.map((category) => category.id);

    const supplierTypes = await tx
      .select({ id: supplierTypesTable.id })
      .from(supplierTypesTable)
      .where(inArray(supplierTypesTable.organizationId, orgIds));
    const supplierTypeIds = supplierTypes.map((type) => type.id);

    const supplierRequirements = await tx
      .select({ id: supplierDocumentRequirementsTable.id })
      .from(supplierDocumentRequirementsTable)
      .where(inArray(supplierDocumentRequirementsTable.organizationId, orgIds));
    const supplierRequirementIds = supplierRequirements.map(
      (requirement) => requirement.id,
    );

    const supplierTemplates = await tx
      .select({ id: supplierRequirementTemplatesTable.id })
      .from(supplierRequirementTemplatesTable)
      .where(inArray(supplierRequirementTemplatesTable.organizationId, orgIds));
    const supplierTemplateIds = supplierTemplates.map((template) => template.id);

    const legislations = await tx
      .select({ id: legislationsTable.id })
      .from(legislationsTable)
      .where(inArray(legislationsTable.organizationId, orgIds));
    const legislationIds = legislations.map((legislation) => legislation.id);

    const contacts = await tx
      .select({ id: organizationContactsTable.id })
      .from(organizationContactsTable)
      .where(inArray(organizationContactsTable.organizationId, orgIds));
    const contactIds = contacts.map((contact) => contact.id);

    const contactGroups = await tx
      .select({ id: organizationContactGroupsTable.id })
      .from(organizationContactGroupsTable)
      .where(inArray(organizationContactGroupsTable.organizationId, orgIds));
    const contactGroupIds = contactGroups.map((group) => group.id);

    const plans = await tx
      .select({ id: strategicPlansTable.id })
      .from(strategicPlansTable)
      .where(inArray(strategicPlansTable.organizationId, orgIds));
    const planIds = plans.map((plan) => plan.id);

    const sgqProcesses = await tx
      .select({ id: sgqProcessesTable.id })
      .from(sgqProcessesTable)
      .where(inArray(sgqProcessesTable.organizationId, orgIds));
    const sgqProcessIds = sgqProcesses.map((process) => process.id);

    const internalAudits = await tx
      .select({ id: internalAuditsTable.id })
      .from(internalAuditsTable)
      .where(inArray(internalAuditsTable.organizationId, orgIds));
    const internalAuditIds = internalAudits.map((audit) => audit.id);

    const internalAuditFindings = await tx
      .select({ id: internalAuditFindingsTable.id })
      .from(internalAuditFindingsTable)
      .where(inArray(internalAuditFindingsTable.organizationId, orgIds));
    const internalAuditFindingIds = internalAuditFindings.map((finding) => finding.id);

    const nonconformities = await tx
      .select({ id: nonconformitiesTable.id })
      .from(nonconformitiesTable)
      .where(inArray(nonconformitiesTable.organizationId, orgIds));
    const nonconformityIds = nonconformities.map((nonconformity) => nonconformity.id);

    const managementReviews = await tx
      .select({ id: managementReviewsTable.id })
      .from(managementReviewsTable)
      .where(inArray(managementReviewsTable.organizationId, orgIds));
    const managementReviewIds = managementReviews.map((review) => review.id);

    if (planIds.length > 0) {
      const actions = await tx
        .select({ id: strategicPlanActionsTable.id })
        .from(strategicPlanActionsTable)
        .where(inArray(strategicPlanActionsTable.planId, planIds));
      const actionIds = actions.map((action) => action.id);
      const riskItems = await tx
        .select({ id: strategicPlanRiskOpportunityItemsTable.id })
        .from(strategicPlanRiskOpportunityItemsTable)
        .where(inArray(strategicPlanRiskOpportunityItemsTable.planId, planIds));
      const riskItemIds = riskItems.map((item) => item.id);

      if (actionIds.length > 0) {
        await tx
          .delete(strategicPlanActionUnitsTable)
          .where(inArray(strategicPlanActionUnitsTable.actionId, actionIds));
      }
      if (riskItemIds.length > 0) {
        await tx
          .delete(strategicPlanRiskOpportunityEffectivenessReviewsTable)
          .where(
            inArray(
              strategicPlanRiskOpportunityEffectivenessReviewsTable.riskOpportunityItemId,
              riskItemIds,
            ),
          );
      }

      await tx
        .delete(strategicPlanRevisionsTable)
        .where(inArray(strategicPlanRevisionsTable.planId, planIds));
      await tx
        .delete(strategicPlanActionsTable)
        .where(inArray(strategicPlanActionsTable.planId, planIds));
      await tx
        .delete(strategicPlanRiskOpportunityItemsTable)
        .where(inArray(strategicPlanRiskOpportunityItemsTable.planId, planIds));
      await tx
        .delete(strategicPlanSwotItemsTable)
        .where(inArray(strategicPlanSwotItemsTable.planId, planIds));
      await tx
        .delete(strategicPlanInterestedPartiesTable)
        .where(inArray(strategicPlanInterestedPartiesTable.planId, planIds));
      await tx
        .delete(strategicPlanObjectivesTable)
        .where(inArray(strategicPlanObjectivesTable.planId, planIds));
      await tx
        .delete(strategicPlansTable)
        .where(inArray(strategicPlansTable.id, planIds));
    }

    if (managementReviewIds.length > 0) {
      await tx
        .delete(managementReviewInputsTable)
        .where(inArray(managementReviewInputsTable.reviewId, managementReviewIds));
      await tx
        .delete(managementReviewOutputsTable)
        .where(inArray(managementReviewOutputsTable.reviewId, managementReviewIds));
      await tx
        .delete(managementReviewsTable)
        .where(inArray(managementReviewsTable.id, managementReviewIds));
    }

    if (nonconformityIds.length > 0) {
      await tx
        .delete(correctiveActionsTable)
        .where(inArray(correctiveActionsTable.nonconformityId, nonconformityIds));
      await tx
        .delete(nonconformitiesTable)
        .where(inArray(nonconformitiesTable.id, nonconformityIds));
    }

    if (internalAuditIds.length > 0) {
      await tx
        .delete(internalAuditChecklistItemsTable)
        .where(inArray(internalAuditChecklistItemsTable.auditId, internalAuditIds));
      await tx
        .delete(internalAuditsTable)
        .where(inArray(internalAuditsTable.id, internalAuditIds));
    }

    if (internalAuditFindingIds.length > 0) {
      await tx
        .delete(internalAuditFindingsTable)
        .where(inArray(internalAuditFindingsTable.id, internalAuditFindingIds));
    }

    if (sgqProcessIds.length > 0) {
      await tx
        .delete(sgqProcessInteractionsTable)
        .where(inArray(sgqProcessInteractionsTable.processId, sgqProcessIds));
      await tx
        .delete(sgqProcessRevisionsTable)
        .where(inArray(sgqProcessRevisionsTable.processId, sgqProcessIds));
      await tx
        .delete(sgqProcessesTable)
        .where(inArray(sgqProcessesTable.id, sgqProcessIds));
    }

    if (departmentIds.length > 0) {
      await tx
        .delete(departmentUnitsTable)
        .where(inArray(departmentUnitsTable.departmentId, departmentIds));
      await tx
        .delete(departmentsTable)
        .where(inArray(departmentsTable.id, departmentIds));
    }

    if (positionIds.length > 0) {
      await tx
        .delete(positionsTable)
        .where(inArray(positionsTable.id, positionIds));
    }

    if (supplierIds.length > 0) {
      await tx
        .delete(supplierFailuresTable)
        .where(inArray(supplierFailuresTable.supplierId, supplierIds));
      await tx
        .delete(supplierReceiptChecksTable)
        .where(inArray(supplierReceiptChecksTable.supplierId, supplierIds));
      await tx
        .delete(supplierPerformanceReviewsTable)
        .where(inArray(supplierPerformanceReviewsTable.supplierId, supplierIds));
      await tx
        .delete(supplierQualificationReviewsTable)
        .where(inArray(supplierQualificationReviewsTable.supplierId, supplierIds));
      await tx
        .delete(supplierRequirementCommunicationsTable)
        .where(inArray(supplierRequirementCommunicationsTable.supplierId, supplierIds));
      await tx
        .delete(supplierDocumentReviewsTable)
        .where(inArray(supplierDocumentReviewsTable.supplierId, supplierIds));
      await tx
        .delete(supplierDocumentSubmissionsTable)
        .where(inArray(supplierDocumentSubmissionsTable.supplierId, supplierIds));
      await tx
        .delete(supplierOfferingsTable)
        .where(inArray(supplierOfferingsTable.supplierId, supplierIds));
      await tx
        .delete(supplierTypeLinksTable)
        .where(inArray(supplierTypeLinksTable.supplierId, supplierIds));
      await tx
        .delete(supplierUnitsTable)
        .where(inArray(supplierUnitsTable.supplierId, supplierIds));
      await tx.delete(suppliersTable).where(inArray(suppliersTable.id, supplierIds));
    }

    if (documentIds.length > 0) {
      await tx
        .delete(documentRecipientGroupLinksTable)
        .where(inArray(documentRecipientGroupLinksTable.documentId, documentIds));
      await tx
        .delete(documentVersionsTable)
        .where(inArray(documentVersionsTable.documentId, documentIds));
      await tx
        .delete(documentAttachmentsTable)
        .where(inArray(documentAttachmentsTable.documentId, documentIds));
      await tx
        .delete(documentReferencesTable)
        .where(inArray(documentReferencesTable.documentId, documentIds));
      await tx
        .delete(documentRecipientsTable)
        .where(inArray(documentRecipientsTable.documentId, documentIds));
      await tx
        .delete(documentApproversTable)
        .where(inArray(documentApproversTable.documentId, documentIds));
      await tx
        .delete(documentCriticalAnalysisTable)
        .where(inArray(documentCriticalAnalysisTable.documentId, documentIds));
      await tx
        .delete(documentCriticalReviewersTable)
        .where(inArray(documentCriticalReviewersTable.documentId, documentIds));
      await tx
        .delete(documentElaboratorsTable)
        .where(inArray(documentElaboratorsTable.documentId, documentIds));
      await tx
        .delete(documentUnitsTable)
        .where(inArray(documentUnitsTable.documentId, documentIds));
      await tx
        .delete(documentsTable)
        .where(inArray(documentsTable.id, documentIds));
    }

    if (contactGroupIds.length > 0) {
      await tx
        .delete(documentRecipientGroupLinksTable)
        .where(inArray(documentRecipientGroupLinksTable.groupId, contactGroupIds));
      await tx
        .delete(organizationContactGroupMembersTable)
        .where(
          inArray(organizationContactGroupMembersTable.groupId, contactGroupIds),
        );
      await tx
        .delete(organizationContactGroupsTable)
        .where(inArray(organizationContactGroupsTable.id, contactGroupIds));
    }

    if (contactIds.length > 0) {
      await tx
        .delete(organizationContactGroupMembersTable)
        .where(inArray(organizationContactGroupMembersTable.contactId, contactIds));
      await tx
        .delete(organizationContactsTable)
        .where(inArray(organizationContactsTable.id, contactIds));
    }

    if (employeeIds.length > 0) {
      if (documentIds.length > 0) {
        await tx
          .delete(documentElaboratorsTable)
          .where(inArray(documentElaboratorsTable.documentId, documentIds));
      }

      const profileItems = await tx
        .select({ id: employeeProfileItemsTable.id })
        .from(employeeProfileItemsTable)
        .where(inArray(employeeProfileItemsTable.employeeId, employeeIds));
      const profileItemIds = profileItems.map((item) => item.id);

      if (profileItemIds.length > 0) {
        await tx
          .delete(employeeProfileItemAttachmentsTable)
          .where(
            inArray(employeeProfileItemAttachmentsTable.itemId, profileItemIds),
          );
      }

      await tx
        .delete(employeeProfileItemsTable)
        .where(inArray(employeeProfileItemsTable.employeeId, employeeIds));
      await tx
        .delete(employeeCompetenciesTable)
        .where(inArray(employeeCompetenciesTable.employeeId, employeeIds));
      await tx
        .delete(employeeTrainingsTable)
        .where(inArray(employeeTrainingsTable.employeeId, employeeIds));
      await tx
        .delete(employeeAwarenessTable)
        .where(inArray(employeeAwarenessTable.employeeId, employeeIds));
      await tx
        .delete(employeeUnitsTable)
        .where(inArray(employeeUnitsTable.employeeId, employeeIds));
      await tx
        .delete(employeesTable)
        .where(inArray(employeesTable.id, employeeIds));
    }

    if (supplierTemplateIds.length > 0) {
      await tx
        .delete(supplierRequirementCommunicationsTable)
        .where(
          inArray(
            supplierRequirementCommunicationsTable.templateId,
            supplierTemplateIds,
          ),
        );
      await tx
        .delete(supplierRequirementTemplatesTable)
        .where(inArray(supplierRequirementTemplatesTable.id, supplierTemplateIds));
    }

    if (supplierRequirementIds.length > 0) {
      await tx
        .delete(supplierDocumentSubmissionsTable)
        .where(
          inArray(
            supplierDocumentSubmissionsTable.requirementId,
            supplierRequirementIds,
          ),
        );
      await tx
        .delete(supplierDocumentRequirementsTable)
        .where(
          inArray(supplierDocumentRequirementsTable.id, supplierRequirementIds),
        );
    }

    if (supplierTypeIds.length > 0) {
      await tx
        .delete(supplierTypeLinksTable)
        .where(inArray(supplierTypeLinksTable.typeId, supplierTypeIds));
      await tx
        .delete(supplierTypesTable)
        .where(inArray(supplierTypesTable.id, supplierTypeIds));
    }

    if (supplierCategoryIds.length > 0) {
      await tx
        .delete(supplierCategoriesTable)
        .where(inArray(supplierCategoriesTable.id, supplierCategoryIds));
    }

    if (unitIds.length > 0) {
      await tx
        .delete(unitLegislationsTable)
        .where(inArray(unitLegislationsTable.unitId, unitIds));
    }

    if (legislationIds.length > 0) {
      await tx
        .delete(unitLegislationsTable)
        .where(inArray(unitLegislationsTable.legislationId, legislationIds));
      await tx
        .delete(legislationsTable)
        .where(inArray(legislationsTable.id, legislationIds));
    }

    if (unitIds.length > 0) {
      await tx.delete(unitsTable).where(inArray(unitsTable.id, unitIds));
    }

    if (userIds.length > 0) {
      await tx
        .delete(notificationsTable)
        .where(inArray(notificationsTable.userId, userIds));
    }

    if (userIds.length > 0) {
      await tx
        .delete(userModulePermissionsTable)
        .where(inArray(userModulePermissionsTable.userId, userIds));
      await tx.delete(usersTable).where(inArray(usersTable.id, userIds));
    }

    await deleteStandaloneUsers(tx, standaloneUserIds);

    await tx
      .delete(organizationsTable)
      .where(inArray(organizationsTable.id, orgIds));
  });
}
