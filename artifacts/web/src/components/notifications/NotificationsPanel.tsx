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
            {notifications.length > 0 && (
              <button
                onClick={handleClear}
                className="px-3 py-1 rounded-lg text-muted-foreground text-[12px] font-medium hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Limpar
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
            notifications.map((notification) => (
              <div
                key={notification.id}
                className="px-6 py-4 border-b border-border/40 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <h4 className="text-[13px] font-semibold text-foreground leading-snug">
                    {notification.title}
                  </h4>
                  <span className="shrink-0 px-2 py-0.5 rounded-md bg-muted text-[11px] text-muted-foreground whitespace-nowrap">
                    {notification.date}
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
