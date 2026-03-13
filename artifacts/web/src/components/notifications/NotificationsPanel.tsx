import React, { useState } from "react";
import { X } from "lucide-react";

interface Notification {
  id: string;
  title: string;
  description: string;
  date: string;
  read: boolean;
}

const mockNotifications: Notification[] = [
  {
    id: "1",
    title: "Pendência documental em duas unidades",
    description: "Existem evidências mensais ainda não consolidadas nas unidades Sudeste e Nordeste.",
    date: "12/03/2026, 05:30",
    read: false,
  },
  {
    id: "2",
    title: "Time de pessoas com quadro atualizado",
    description: "A base de colaboradores foi sincronizada para a revisão semanal de headcount.",
    date: "11/03/2026, 12:10",
    read: false,
  },
  {
    id: "3",
    title: "Treinamento obrigatório vence em 3 dias",
    description: "A filial Nordeste precisa concluir a reciclagem do protocolo de segurança operacional.",
    date: "10/03/2026, 09:00",
    read: false,
  },
];

interface NotificationsPanelProps {
  onClose: () => void;
}

export function NotificationsPanel({ onClose }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState(mockNotifications);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const lastEvent = notifications.length > 0 ? notifications[0].date : null;

  const handleClear = () => {
    setNotifications([]);
  };

  return (
    <>
      <div className="fixed inset-0 z-[90]" onClick={onClose} />
      <div className="absolute right-0 top-full mt-2 z-[100] w-[420px] bg-white rounded-2xl shadow-xl border border-border/60 animate-[modalIn_250ms_cubic-bezier(0.16,1,0.3,1)] overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-semibold text-foreground">Notificações</h3>
            {unreadCount > 0 && (
              <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-[#007AFF] text-white text-[11px] font-semibold">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button
                onClick={handleClear}
                className="px-3 py-1.5 rounded-lg bg-[#007AFF] text-white text-[12px] font-medium hover:bg-[#0066DD] transition-colors cursor-pointer"
              >
                Limpar
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className="px-5 py-4 border-t border-border/60"
              >
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <h4 className="text-[13px] font-semibold text-foreground leading-snug">
                    {notification.title}
                  </h4>
                  <span className="shrink-0 px-2 py-0.5 rounded-md bg-muted text-[11px] text-muted-foreground whitespace-nowrap">
                    {notification.date}
                  </span>
                </div>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                  {notification.description}
                </p>
                <button className="px-3 py-1.5 rounded-lg bg-[#007AFF] text-white text-[12px] font-medium hover:bg-[#0066DD] transition-colors cursor-pointer">
                  Ver mais
                </button>
              </div>
            ))
          )}
        </div>

        {notifications.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border/60">
            <span className="text-[11px] text-muted-foreground">
              Último evento em {lastEvent}
            </span>
            <button className="text-[12px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1">
              Ver tudo <span>→</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
