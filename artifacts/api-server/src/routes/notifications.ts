import { Router, type IRouter } from "express";
import { eq, and, desc, count } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import {
  ListNotificationsParams,
  MarkNotificationReadParams,
  MarkAllNotificationsReadParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/organizations/:orgId/notifications", requireAuth, async (req, res): Promise<void> => {
  const params = ListNotificationsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const userId = req.auth!.userId;

  const notifications = await db.select()
    .from(notificationsTable)
    .where(and(
      eq(notificationsTable.organizationId, params.data.orgId),
      eq(notificationsTable.userId, userId),
    ))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  const [unreadResult] = await db.select({ count: count() })
    .from(notificationsTable)
    .where(and(
      eq(notificationsTable.organizationId, params.data.orgId),
      eq(notificationsTable.userId, userId),
      eq(notificationsTable.read, false),
    ));

  res.json({
    notifications: notifications.map(n => ({
      ...n,
      createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
    })),
    unreadCount: unreadResult.count,
  });
});

router.post("/organizations/:orgId/notifications/:notifId/read", requireAuth, async (req, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  await db.update(notificationsTable)
    .set({ read: true })
    .where(and(
      eq(notificationsTable.id, params.data.notifId),
      eq(notificationsTable.userId, req.auth!.userId),
    ));

  res.json({ message: "Notificação marcada como lida" });
});

router.post("/organizations/:orgId/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  const params = MarkAllNotificationsReadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  await db.update(notificationsTable)
    .set({ read: true })
    .where(and(
      eq(notificationsTable.organizationId, params.data.orgId),
      eq(notificationsTable.userId, req.auth!.userId),
      eq(notificationsTable.read, false),
    ));

  res.json({ message: "Todas as notificações marcadas como lidas" });
});

export default router;
