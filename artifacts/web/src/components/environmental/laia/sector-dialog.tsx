import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useCreateLaiaSector } from "@/lib/environmental-laia-client";

type LaiaSectorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId?: number;
  unitId: number;
  unitName?: string | null;
};

const DEFAULT_FORM = {
  code: "",
  name: "",
  description: "",
};

export function LaiaSectorDialog({
  open,
  onOpenChange,
  orgId,
  unitId,
  unitName,
}: LaiaSectorDialogProps) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const createSectorMutation = useCreateLaiaSector(orgId);

  useEffect(() => {
    if (!open) {
      setForm(DEFAULT_FORM);
    }
  }, [open]);

  const handleCreateSector = async () => {
    if (!orgId) return;

    try {
      await createSectorMutation.mutateAsync({
        code: form.code.trim(),
        name: form.name.trim(),
        unitId,
        description: form.description.trim() || null,
      });
      onOpenChange(false);
      toast({
        title: "Setor criado",
        description: "O setor LAIA foi registrado com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Falha ao criar setor",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Novo setor LAIA"
      description={`Cadastre o setor operacional vinculado à unidade ${unitName || unitId}.`}
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="sector-code">Código</Label>
            <Input
              id="sector-code"
              value={form.code}
              onChange={(event) =>
                setForm((current) => ({ ...current, code: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="sector-name">Atividade</Label>
            <Input
              id="sector-name"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
        </div>
        <div>
          <Label>Unidade</Label>
          <div className="mt-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground">
            {unitName || `Unidade ${unitId}`}
          </div>
        </div>
        <div>
          <Label htmlFor="sector-description">Descrição</Label>
          <Textarea
            id="sector-description"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button
          onClick={handleCreateSector}
          disabled={!orgId || !form.code.trim() || !form.name.trim()}
          isLoading={createSectorMutation.isPending}
        >
          Salvar setor
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
