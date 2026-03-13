import React, { useState } from "react";
import ReactDOM from "react-dom";
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

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-[2px] animate-[overlayIn_200ms_ease-out]"
        onClick={onClose}
      />
      <div className="relative z-[201] w-full max-w-lg bg-card shadow-xl sm:rounded-2xl border border-border animate-[modalIn_250ms_cubic-bezier(0.16,1,0.3,1)] mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-semibold leading-none tracking-tight">Notificações</h2>
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
              className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className="px-6 py-4 border-t border-border/60"
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
          <div className="flex items-center justify-between px-6 py-3 border-t border-border/60">
            <span className="text-[11px] text-muted-foreground">
              Último evento em {lastEvent}
            </span>
            <button className="text-[12px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1">
              Ver tudo <span>→</span>
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
