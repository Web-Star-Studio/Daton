import { integer, jsonb, pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type OrganizationOnboardingStatus = "pending" | "completed" | "skipped";

export type OrganizationSector =
  | "manufacturing"
  | "agro"
  | "food_beverage"
  | "mining"
  | "oil_gas"
  | "energy"
  | "chemical"
  | "pulp_paper"
  | "steel"
  | "logistics"
  | "financial"
  | "telecom"
  | "public"
  | "pharma_cosmetics"
  | "automotive"
  | "technology"
  | "consumer_goods"
  | "utilities"
  | "healthcare"
  | "education"
  | "retail"
  | "construction"
  | "services"
  | "other";

export type OrganizationSize = "micro" | "small" | "medium" | "large" | "xlarge" | "enterprise";

export type OrganizationGoal =
  | "emissions_reduction"
  | "environmental_compliance"
  | "health_safety"
  | "energy_efficiency"
  | "water_management"
  | "waste_reduction"
  | "sustainability"
  | "quality"
  | "compliance"
  | "performance"
  | "innovation"
  | "cost_reduction";

export type OrganizationMaturityLevel = "beginner" | "intermediate" | "advanced";

export interface OrganizationOnboardingData {
  companyProfile: {
    sector: OrganizationSector;
    customSector: string | null;
    size: OrganizationSize;
    goals: OrganizationGoal[];
    maturityLevel: OrganizationMaturityLevel;
    currentChallenges: string[];
  };
}

export const organizationsTable = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  statusOperacional: text("status_operacional").default("ativa"),
  tradeName: text("trade_name"),
  legalIdentifier: text("legal_identifier"),
  openingDate: text("opening_date"),
  taxRegime: text("tax_regime"),
  primaryCnae: text("primary_cnae"),
  stateRegistration: text("state_registration"),
  municipalRegistration: text("municipal_registration"),
  onboardingStatus: text("onboarding_status").notNull().default("completed"),
  onboardingData: jsonb("onboarding_data").$type<OrganizationOnboardingData>(),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  authVersion: integer("auth_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrganizationSchema = createInsertSchema(organizationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationsTable.$inferSelect;
