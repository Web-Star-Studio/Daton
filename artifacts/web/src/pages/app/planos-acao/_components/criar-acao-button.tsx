import { useState, type ComponentProps } from "react";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NovaAcaoDialog, type ActionSource } from "./nova-acao-dialog";

/**
 * Drop-in affordance for any module to spawn an action plan from its own entity.
 * Renders a button + the (prefilled, origin-bound) creation dialog.
 *
 *   <CriarAcaoButton orgId={orgId} source={{ sourceModule: "nonconformity",
 *     sourceRef: { nonconformityId: nc.id }, defaultTitle: nc.title }} />
 */
export function CriarAcaoButton({
  orgId,
  source,
  label = "Criar plano de ação",
  variant = "outline",
  size = "sm",
  className,
  icon = true,
}: {
  orgId: number;
  source: ActionSource;
  label?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
  icon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        {icon && <ClipboardList className="mr-1.5 h-4 w-4" />}
        {label}
      </Button>
      <NovaAcaoDialog orgId={orgId} open={open} onOpenChange={setOpen} source={source} />
    </>
  );
}
