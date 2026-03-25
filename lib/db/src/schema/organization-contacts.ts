import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export const ORGANIZATION_CONTACT_SOURCE_TYPES = [
  "system_user",
  "employee",
  "external_contact",
] as const;

export const ORGANIZATION_CONTACT_CLASSIFICATION_TYPES = [
  "supplier",
  "customer",
  "partner",
  "auditor",
  "consultant",
  "other",
] as const;

export const organizationContactsTable = pgTable(
  "organization_contacts",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceUserId: integer("source_user_id").references(() => usersTable.id),
    sourceEmployeeId: integer("source_employee_id").references(
      () => employeesTable.id,
    ),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    organizationName: text("organization_name"),
    classificationType: text("classification_type")
      .notNull()
      .default("other"),
    classificationDescription: text("classification_description"),
    notes: text("notes"),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => usersTable.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("organization_contacts_org_source_user_unique").on(
      table.organizationId,
      table.sourceUserId,
    ),
    unique("organization_contacts_org_source_employee_unique").on(
      table.organizationId,
      table.sourceEmployeeId,
    ),
  ],
);

export const organizationContactGroupsTable = pgTable("organization_contact_groups", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdById: integer("created_by_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const organizationContactGroupMembersTable = pgTable(
  "organization_contact_group_members",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => organizationContactGroupsTable.id, {
        onDelete: "cascade",
      }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => organizationContactsTable.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("organization_contact_group_members_group_contact_unique").on(
      table.groupId,
      table.contactId,
    ),
  ],
);
