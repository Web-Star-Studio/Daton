import React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full border-0 border-b border-border bg-transparent px-0 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:border-foreground disabled:cursor-not-allowed disabled:opacity-50 transition-colors resize-y",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";
