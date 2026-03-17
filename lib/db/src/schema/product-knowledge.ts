import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export type ProductKnowledgeArticleStatus = "draft" | "published" | "archived";
export type ProductKnowledgeIndexStatus =
  | "not_indexed"
  | "indexing"
  | "indexed"
  | "failed";

export const productKnowledgeArticlesTable = pgTable(
  "product_knowledge_articles",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    summary: text("summary").notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    status: text("status")
      .notNull()
      .default("draft")
      .$type<ProductKnowledgeArticleStatus>(),
    version: integer("version").notNull().default(0),
    checksum: text("checksum").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => usersTable.id),
    updatedById: integer("updated_by_id")
      .notNull()
      .references(() => usersTable.id),
    openaiFileId: text("openai_file_id"),
    lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
    lastIndexStatus: text("last_index_status")
      .notNull()
      .default("not_indexed")
      .$type<ProductKnowledgeIndexStatus>(),
    lastIndexError: text("last_index_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique("product_knowledge_articles_slug_unique").on(table.slug)],
);

export const productKnowledgeArticleRevisionsTable = pgTable(
  "product_knowledge_article_revisions",
  {
    id: serial("id").primaryKey(),
    articleId: integer("article_id")
      .notNull()
      .references(() => productKnowledgeArticlesTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    checksum: text("checksum").notNull(),
    publishedById: integer("published_by_id")
      .notNull()
      .references(() => usersTable.id),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("product_knowledge_article_revision_unique").on(table.articleId, table.version),
  ],
);

export type ProductKnowledgeArticle = typeof productKnowledgeArticlesTable.$inferSelect;
export type ProductKnowledgeArticleRevision =
  typeof productKnowledgeArticleRevisionsTable.$inferSelect;
