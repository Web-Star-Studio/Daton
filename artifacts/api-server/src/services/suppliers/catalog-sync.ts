import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  supplierCatalogItemsTable,
  supplierOfferingsTable,
} from "@workspace/db";

type CatalogSyncExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

function toDbFlag(value: boolean) {
  return value ? 1 : 0;
}

export async function syncSupplierCatalogAssociations(
  tx: CatalogSyncExecutor,
  supplierId: number,
  organizationId: number,
  catalogItemIds: number[] | undefined,
) {
  if (!catalogItemIds) return;

  const requestedCatalogItemIds = Array.from(new Set(catalogItemIds));
  const requestedCatalogItemIdSet = new Set(requestedCatalogItemIds);

  const catalogItems = requestedCatalogItemIds.length === 0
    ? []
    : await tx
        .select()
        .from(supplierCatalogItemsTable)
        .where(
          and(
            eq(supplierCatalogItemsTable.organizationId, organizationId),
            inArray(supplierCatalogItemsTable.id, requestedCatalogItemIds),
          ),
        );

  const existingAssociations = await tx
    .select({
      id: supplierOfferingsTable.id,
      catalogItemId: supplierOfferingsTable.catalogItemId,
    })
    .from(supplierOfferingsTable)
    .where(eq(supplierOfferingsTable.supplierId, supplierId));
  const existingByCatalogItemId = new Map(
    existingAssociations
      .filter((association) => association.catalogItemId !== null)
      .map((association) => [association.catalogItemId as number, association]),
  );

  const currentCatalogItemIds = new Set(catalogItems.map((item) => item.id));
  const associationIdsToDelete = existingAssociations
    .filter(
      (association) =>
        association.catalogItemId !== null &&
        (
          !requestedCatalogItemIdSet.has(association.catalogItemId) ||
          !currentCatalogItemIds.has(association.catalogItemId)
        ),
    )
    .map((association) => association.id);

  if (associationIdsToDelete.length > 0) {
    await tx
      .delete(supplierOfferingsTable)
      .where(inArray(supplierOfferingsTable.id, associationIdsToDelete));
  }

  if (catalogItems.length === 0) {
    return;
  }

  const catalogItemsToInsert = catalogItems.filter((catalogItem) => !existingByCatalogItemId.has(catalogItem.id));
  const catalogItemsToUpdate = catalogItems.filter((catalogItem) => existingByCatalogItemId.has(catalogItem.id));

  if (catalogItemsToInsert.length > 0) {
    await tx
      .insert(supplierOfferingsTable)
      .values(
        catalogItemsToInsert.map((catalogItem) => ({
          supplierId,
          catalogItemId: catalogItem.id,
          name: catalogItem.name,
          offeringType: catalogItem.offeringType,
          unitOfMeasure: catalogItem.unitOfMeasure,
          description: catalogItem.description,
          status: catalogItem.status,
          isApprovedScope: toDbFlag(false),
        })),
      );
  }

  for (const catalogItem of catalogItemsToUpdate) {
    const association = existingByCatalogItemId.get(catalogItem.id);
    if (!association) continue;

    await tx
      .update(supplierOfferingsTable)
      .set({
        name: catalogItem.name,
        offeringType: catalogItem.offeringType,
        unitOfMeasure: catalogItem.unitOfMeasure,
        description: catalogItem.description,
        status: catalogItem.status,
        updatedAt: new Date(),
      })
      .where(eq(supplierOfferingsTable.id, association.id));
  }
}
