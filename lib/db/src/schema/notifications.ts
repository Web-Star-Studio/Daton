import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  read: boolean("read").notNull().default(false),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: integer("related_entity_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Notification = typeof notificationsTable.$inferSelect;
