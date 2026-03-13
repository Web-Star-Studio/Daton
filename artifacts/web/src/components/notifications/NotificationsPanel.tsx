import React from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface NotificationsPanelProps {
  onClose: () => void;
}

function formatDate(d: string | null | undefined) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return String(d);
  }
}

export function NotificationsPanel({ onClose }: NotificationsPanelProps) {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const queryClient = useQueryClient();

  const { data } = useListNotifications(orgId!, {
    query: { enabled: !!orgId },
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const markReadMut = useMarkNotificationRead();
  const markAllReadMut = useMarkAllNotificationsRead();

  const lastEvent = notifications.length > 0 ? notifications[0].createdAt : null;

  const handleMarkAllRead = async () => {
    if (!orgId) return;
    await markAllReadMut.mutateAsync({ orgId });
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey(orgId) });
  };

  const handleMarkRead = async (notifId: number) => {
    if (!orgId) return;
    await markReadMut.mutateAsync({ orgId, notifId });
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey(orgId) });
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-[2px] animate-[overlayIn_200ms_ease-out]"
        onClick={onClose}
      />
      <div className="relative z-[201] w-full max-w-lg bg-card shadow-xl sm:rounded-2xl border border-border/60 animate-[modalIn_250ms_cubic-bezier(0.16,1,0.3,1)] mx-4 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold leading-none tracking-tight">Notificações</h2>
            {unreadCount > 0 && (
              <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-muted text-foreground text-[11px] font-semibold">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="px-3 py-1 rounded-lg text-muted-foreground text-[12px] font-medium hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Marcar todas como lidas
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[480px]">
          {notifications.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            notifications.map((notification: any) => (
              <div
                key={notification.id}
                onClick={() => !notification.read && handleMarkRead(notification.id)}
                className={`px-6 py-4 border-b border-border/40 hover:bg-muted/50 transition-colors cursor-pointer ${
                  !notification.read ? "bg-blue-50/30" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2">
                    {!notification.read && (
                      <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    )}
                    <h4 className="text-[13px] font-semibold text-foreground leading-snug">
                      {notification.title}
                    </h4>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-md bg-muted text-[11px] text-muted-foreground whitespace-nowrap">
                    {formatDate(notification.createdAt)}
                  </span>
                </div>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  {notification.description}
                </p>
              </div>
            ))
          )}
        </div>

        {notifications.length > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-border/60">
            <span className="text-[11px] text-muted-foreground">
              Último evento em {formatDate(lastEvent)}
            </span>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
