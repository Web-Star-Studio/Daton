import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListOrganizationContactGroupsQueryKey,
  useCreateOrganizationContactGroup,
  useDeleteOrganizationContactGroup,
  useListOrganizationContactGroups,
  useUpdateOrganizationContactGroup,
  type OrganizationContact,
  type OrganizationContactGroup,
} from "@workspace/api-client-react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Textarea } from "@/components/ui/textarea";
import { useOrganizationContactMultiPicker } from "@/hooks/use-organization-contact-multi-picker";
import { toast } from "@/hooks/use-toast";
import {
  formatOrganizationContactSummary,
  summarizeOrganizationContactGroupMembers,
} from "@/lib/organization-contacts";

type GroupFormState = {
  id?: number;
  name: string;
  description: string;
  contactIds: number[];
  initialContacts?: OrganizationContact[];
};

const emptyForm = (): GroupFormState => ({
  name: "",
  description: "",
  contactIds: [],
});

export function OrganizationContactGroupsSection({
  orgId,
}: {
  orgId: number;
}) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<GroupFormState>(emptyForm);
  const { data: groups = [], isLoading } = useListOrganizationContactGroups(orgId, {
    query: {
      queryKey: getListOrganizationContactGroupsQueryKey(orgId),
    },
  });
  const contactPicker = useOrganizationContactMultiPicker({
    orgId,
    selectedIds: form.contactIds,
    enabled: dialogOpen,
    includeArchived: true,
    initialContacts: form.initialContacts,
  });
  const createGroupMut = useCreateOrganizationContactGroup();
  const updateGroupMut = useUpdateOrganizationContactGroup();
  const deleteGroupMut = useDeleteOrganizationContactGroup();

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: getListOrganizationContactGroupsQueryKey(orgId),
    });
  };

  const resetForm = () => setForm(emptyForm());

  const startEdit = (group: OrganizationContactGroup) => {
    setForm({
      id: group.id,
      name: group.name,
      description: group.description ?? "",
      contactIds: group.members.map((member) => member.id),
      initialContacts: group.members,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({
        title: "Informe o nome do grupo",
        variant: "destructive",
      });
      return;
    }

    if (form.contactIds.length === 0) {
      toast({
        title: "Selecione ao menos um contato",
        variant: "destructive",
      });
      return;
    }

    try {
      if (form.id) {
        await updateGroupMut.mutateAsync({
          orgId,
          groupId: form.id,
          data: {
            name: form.name.trim(),
            description: form.description.trim() || null,
            contactIds: form.contactIds,
          },
        });
        toast({ title: "Grupo atualizado" });
      } else {
        await createGroupMut.mutateAsync({
          orgId,
          data: {
            name: form.name.trim(),
            description: form.description.trim() || null,
            contactIds: form.contactIds,
          },
        });
        toast({ title: "Grupo criado" });
      }
      await refresh();
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      toast({
        title: "Não foi possível salvar o grupo",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (group: OrganizationContactGroup) => {
    if (!window.confirm(`Excluir o grupo "${group.name}"?`)) {
      return;
    }

    try {
      await deleteGroupMut.mutateAsync({ orgId, groupId: group.id });
      toast({ title: "Grupo excluído" });
      await refresh();
    } catch (error) {
      toast({
        title: "Não foi possível excluir o grupo",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Grupos
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Agrupe contatos mistos para reutilizar em documentos e outros fluxos da organização.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Novo grupo
          </Button>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Carregando...</div>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Grupo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Composição
                  </th>
                  <th className="w-24 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-10 text-center text-[13px] text-muted-foreground"
                    >
                      Nenhum grupo reutilizável cadastrado.
                    </td>
                  </tr>
                ) : (
                  groups.map((group) => (
                    <tr key={group.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            {group.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {group.description || "Sem descrição"}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {summarizeOrganizationContactGroupMembers(group.members)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(group)}
                            className="cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                            title="Editar grupo"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(group)}
                            className="cursor-pointer rounded p-1.5 text-destructive transition-colors hover:text-destructive/80"
                            title="Excluir grupo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
        title={form.id ? "Editar grupo" : "Novo grupo"}
        description="Monte grupos com qualquer combinação de usuários, colaboradores e contatos externos."
      >
        <div className="space-y-5">
          <div>
            <Label>Nome</Label>
            <Input
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Membros</Label>
            <SearchableMultiSelect
              options={contactPicker.options.map((contact) => ({
                value: contact.id,
                label: contact.name,
                keywords: [formatOrganizationContactSummary(contact)],
              }))}
              selected={form.contactIds}
              onToggle={(id) =>
                setForm((prev) => ({
                  ...prev,
                  contactIds: prev.contactIds.includes(id)
                    ? prev.contactIds.filter((currentId) => currentId !== id)
                    : [...prev.contactIds, id],
                }))
              }
              placeholder="Selecionar contatos"
              searchPlaceholder="Buscar contatos..."
              emptyMessage="Nenhum contato encontrado."
              onSearchValueChange={contactPicker.setSearchValue}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {form.contactIds.length} contato(s) selecionado(s).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDialogOpen(false);
              resetForm();
            }}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            isLoading={createGroupMut.isPending || updateGroupMut.isPending}
            onClick={handleSave}
          >
            {form.id ? "Salvar grupo" : "Criar grupo"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
