import React from "react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        className={cn(
          "flex h-9 w-full appearance-none border-0 border-b border-border bg-transparent px-0 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground/50 [color-scheme:light] dark:[color-scheme:dark] [&>option]:bg-background [&>option]:text-foreground focus-visible:outline-none focus-visible:border-foreground disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer",
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";
