import React, { useEffect, useId } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
};

export function Dialog({
  open,
  onOpenChange,
  children,
  title,
  description,
  size = "md",
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [open]);

  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-[2px] animate-[overlayIn_200ms_ease-out]"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          "relative z-[201] flex flex-col w-full bg-card shadow-xl sm:rounded-2xl border border-border/60 animate-[modalIn_250ms_cubic-bezier(0.16,1,0.3,1)] mx-4 max-h-[90vh]",
          sizeClasses[size],
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-border/60">
          <div className="flex flex-col pt-0.5">
            <h2
              id={titleId}
              className="text-[15px] font-semibold leading-none tracking-tight"
            >
              {title}
            </h2>
            {description && (
              <p
                id={descriptionId}
                className="text-[13px] text-muted-foreground mt-1.5"
              >
                {description}
              </p>
            )}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Fechar diálogo"
            title="Fechar diálogo"
            className="p-1 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-secondary/60 transition-colors cursor-pointer shrink-0 ml-4"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function DialogFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex justify-end gap-2 pt-5 mt-2 border-t border-border/40",
        className,
      )}
    >
      {children}
    </div>
  );
}
