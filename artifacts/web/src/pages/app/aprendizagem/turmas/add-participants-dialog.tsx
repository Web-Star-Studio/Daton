import React, { useState } from "react";
import { useAddTrainingClassParticipants } from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { EmployeePicker } from "./employee-picker";

/**
 * Inscreve colaboradores numa turma que já existe. O backend
 * (POST .../training-classes/:id/participants) faz onConflictDoNothing, então
 * reenviar alguém já inscrito é inofensivo.
 */
export function AddParticipantsDialog({
  orgId,
  classId,
  open,
  onOpenChange,
  enrolledIds,
  onAdded,
}: {
  orgId: number;
  classId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrolledIds: Set<number>;
  onAdded: () => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const addParticipants = useAddTrainingClassParticipants();

  const close = (next: boolean) => {
    if (!next) setSelected([]);
    onOpenChange(next);
  };

  const handleAdd = async () => {
    if (selected.length === 0) return;
    try {
      await addParticipants.mutateAsync({
        orgId,
        id: classId,
        data: { employeeIds: selected },
      });
      onAdded();
      close(false);
      toast({
        title: "Colaboradores inscritos",
        description: `${selected.length} participante(s) adicionado(s) à turma.`,
      });
    } catch {
      toast({
        title: "Erro ao inscrever",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Adicionar colaboradores"
      description="Selecione quem participou desta turma."
      size="md"
    >
      <EmployeePicker
        orgId={orgId}
        enabled={open}
        selected={selected}
        onChange={setSelected}
        enrolledIds={enrolledIds}
      />
      <DialogFooter>
        <Button variant="outline" onClick={() => close(false)}>
          Cancelar
        </Button>
        <Button
          onClick={() => void handleAdd()}
          disabled={selected.length === 0 || addParticipants.isPending}
        >
          {addParticipants.isPending
            ? "Inscrevendo..."
            : `Inscrever ${selected.length || ""}`.trim()}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
