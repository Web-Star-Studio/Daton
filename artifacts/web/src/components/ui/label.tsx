import React from "react";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "text-xs font-semibold leading-none text-foreground mb-1 block",
        className
      )}
      {...props}
    />
  )
);
Label.displayName = "Label";
