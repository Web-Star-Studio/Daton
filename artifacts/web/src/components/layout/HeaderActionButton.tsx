import { type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HeaderActionButtonProps = ComponentProps<typeof Button> & {
  label: string;
  icon?: ReactNode;
  collapseLabel?: boolean;
};

export function HeaderActionButton({
  label,
  icon,
  collapseLabel = Boolean(icon),
  className,
  children,
  ...props
}: HeaderActionButtonProps) {
  const shouldCollapseLabel = collapseLabel && Boolean(icon);

  return (
    <Button
      aria-label={label}
      title={label}
      className={cn(
        shouldCollapseLabel ? "px-2.5 min-[1280px]:px-3" : undefined,
        className,
      )}
      {...props}
    >
      {icon ? (
        <span
          className={cn(shouldCollapseLabel ? "min-[1280px]:mr-1.5" : "mr-1.5")}
        >
          {icon}
        </span>
      ) : null}
      <span
        className={cn(
          shouldCollapseLabel ? "hidden min-[1280px]:inline" : undefined,
        )}
      >
        {children ?? label}
      </span>
    </Button>
  );
}
