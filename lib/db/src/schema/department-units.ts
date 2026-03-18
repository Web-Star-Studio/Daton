import { pgTable, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { departmentsTable } from "./departments";
import { unitsTable } from "./units";

export const departmentUnitsTable = pgTable("department_units", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().references(() => departmentsTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("department_unit_unique").on(table.departmentId, table.unitId),
]);

export type DepartmentUnit = typeof departmentUnitsTable.$inferSelect;
