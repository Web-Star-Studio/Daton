import { eq } from "drizzle-orm";
import {
  db,
  regulatoryDocumentAuditLogTable,
  usersTable,
  type RegulatoryDocumentAuditAction,
  type RegulatoryDocumentAuditChanges,
  type RegulatoryDocumentAuditEntityType,
} from "@workspace/db";

// Tiny per-request cache for user.name lookups: if a single mutation triggers
// multiple log entries (rare today but cheap to support), we hit the DB once.
// The cache is purely a `Map` the caller can pass in; nothing global.
export type AuditUserNameCache = Map<number, string | null>;

export function createAuditUserNameCache(): AuditUserNameCache {
  return new Map();
}

async function resolveUserName(
  userId: number | null | undefined,
  cache: AuditUserNameCache | undefined,
): Promise<string | null> {
  if (!userId) return null;
  if (cache?.has(userId)) return cache.get(userId) ?? null;
  try {
    const [row] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const name = row?.name ?? null;
    if (cache) cache.set(userId, name);
    return name;
  } catch (err) {
    // Audit must never block: if we can't resolve the name, log it as null.
    console.error("[regulatory-audit] failed to resolve user name", {
      userId,
      err,
    });
    return null;
  }
}

// Fields that don't carry semantic value for an audit diff. They're noisy
// (change on every write) and add no information for an auditor.
const IGNORED_DIFF_FIELDS = new Set<string>([
  "updatedAt",
  "createdAt",
  "organizationId",
  "id",
  // status is derived from expirationDate + alertDaysOverride. Showing it as a
  // separate diff entry would double-count an expirationDate change. We still
  // log it for renewals though, where it's user-driven.
]);

function normalizeValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function shallowEqual(a: unknown, b: unknown): boolean {
  // Both null/undefined
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  // Dates already normalized to ISO strings before this is called.
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  entityType: RegulatoryDocumentAuditEntityType,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    if (IGNORED_DIFF_FIELDS.has(key)) continue;
    // For documents, status is derived — skip to avoid double entries.
    if (entityType === "document" && key === "status") continue;

    const from = normalizeValue(before[key]);
    const to = normalizeValue(after[key]);
    if (!shallowEqual(from, to)) {
      diff[key] = { from, to };
    }
  }
  return diff;
}

function buildSnapshot(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "createdAt" || key === "updatedAt") continue;
    snapshot[key] = normalizeValue(value);
  }
  return snapshot;
}

export interface LogAuditParams {
  orgId: number;
  documentId: number;
  entityType: RegulatoryDocumentAuditEntityType;
  entityId?: number | null;
  action: RegulatoryDocumentAuditAction;
  userId?: number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Optional per-request cache so user.name is fetched at most once. */
  userNameCache?: AuditUserNameCache;
}

/**
 * Persist an audit entry. NEVER throws — audit failure must not break the
 * user's mutation. Errors are surfaced via console.error.
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const {
      orgId,
      documentId,
      entityType,
      entityId,
      action,
      userId,
      before,
      after,
      userNameCache,
    } = params;

    let changes: RegulatoryDocumentAuditChanges;
    if (action === "updated") {
      const diff = buildDiff(before ?? {}, after ?? {}, entityType);
      // If literally nothing changed (e.g. PATCH no-op), skip logging entirely.
      if (Object.keys(diff).length === 0) return;
      changes = { kind: "diff", fields: diff };
    } else if (action === "created") {
      changes = {
        kind: "snapshot",
        snapshot: buildSnapshot(after ?? before ?? {}),
      };
    } else {
      changes = {
        kind: "snapshot",
        snapshot: buildSnapshot(before ?? after ?? {}),
      };
    }

    const userName = await resolveUserName(userId, userNameCache);

    await db.insert(regulatoryDocumentAuditLogTable).values({
      organizationId: orgId,
      documentId,
      entityType,
      entityId: entityId ?? null,
      action,
      userId: userId ?? null,
      userName,
      changes,
    });
  } catch (err) {
    console.error("[regulatory-audit] failed to write audit entry", {
      params: {
        orgId: params.orgId,
        documentId: params.documentId,
        entityType: params.entityType,
        action: params.action,
      },
      err,
    });
  }
}
