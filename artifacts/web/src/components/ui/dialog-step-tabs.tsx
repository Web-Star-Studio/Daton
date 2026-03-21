import { Fragment } from "react";
import { cn } from "@/lib/utils";

export function DialogStepTabs({
  steps,
  step,
  onStepChange,
  className,
  maxAccessibleStep = step,
}: {
  steps: string[];
  step: number;
  onStepChange: (step: number) => void;
  className?: string;
  maxAccessibleStep?: number;
}) {
  return (
    <div className={cn("mb-5 flex items-center gap-1", className)}>
      {steps.map((label, index) => (
        <Fragment key={label}>
          {index > 0 && <div className="h-px flex-1 bg-border" />}
          <button
            type="button"
            onClick={() => onStepChange(index)}
            disabled={index > maxAccessibleStep}
            className={cn(
              "whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              step === index
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
              index > maxAccessibleStep
                ? "cursor-not-allowed opacity-50 hover:text-muted-foreground"
                : "cursor-pointer",
            )}
          >
            {label}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
