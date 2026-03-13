import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  title: string;
  description?: string;
}

export function Dialog({ open, onOpenChange, children, title, description }: DialogProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [open]);

  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div 
        className="fixed inset-0 bg-black/20 backdrop-blur-[2px] animate-[overlayIn_200ms_ease-out]" 
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-[201] grid w-full max-w-lg gap-4 bg-card p-6 shadow-xl sm:rounded-2xl border border-border animate-[modalIn_250ms_cubic-bezier(0.16,1,0.3,1)] mx-4">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
        >
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </button>
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h2 className="text-xl font-semibold leading-none tracking-tight">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
