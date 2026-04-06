import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";
import { employeesTable } from "./employees";

export const assetsTable = pgTable("assets", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  unitId: integer("unit_id").references(() => unitsTable.id),
  name: text("name").notNull(),
  assetType: text("asset_type").notNull(),
  criticality: text("criticality").notNull().default("media"),
  status: text("status").notNull().default("ativo"),
  location: text("location"),
  impactedProcess: text("impacted_process"),
  responsibleId: integer("responsible_id").references(() => employeesTable.id, { onDelete: "set null" }),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAssetSchema = createInsertSchema(assetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assetsTable.$inferSelect;
