import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListOrganizationContactsQueryKey,
  useCreateOrganizationContact,
  useDeleteOrganizationContact,
  useListOrganizationContacts,
  useUpdateOrganizationContact,
  type OrganizationContact,
  type OrganizationContactClassificationType,
  type OrganizationContactSourceType,
} from "@workspace/api-client-react";
import { Archive, Pencil, Plus, Trash2, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEmployeeMultiPicker } from "@/hooks/use-employee-multi-picker";
import { useUserMultiPicker } from "@/hooks/use-user-multi-picker";
import { toast } from "@/hooks/use-toast";
import {
  formatOrganizationContactSummary,
  ORGANIZATION_CONTACT_CLASSIFICATION_LABELS,
  ORGANIZATION_CONTACT_SOURCE_LABELS,
} from "@/lib/organization-contacts";

type ContactFormState = {
  id?: number;
  sourceType: OrganizationContactSourceType;
  sourceId: number | null;
  name: string;
  email: string;
  phone: string;
  organizationName: string;
  classificationType: OrganizationContactClassificationType;
  classificationDescription: string;
  notes: string;
  archived: boolean;
};

const emptyForm = (): ContactFormState => ({
  sourceType: "external_contact",
  sourceId: null,
  name: "",
  email: "",
  phone: "",
  organizationName: "",
  classificationType: "other",
  classificationDescription: "",
  notes: "",
  archived: false,
});

export function OrganizationContactsCatalogSection({
  orgId,
}: {
  orgId: number;
}) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ContactFormState>(emptyForm());
  const { data: contacts = [], isLoading } = useListOrganizationContacts(
    orgId,
    { includeArchived: true },
    {
      query: {
        queryKey: getListOrganizationContactsQueryKey(orgId, {
          includeArchived: true,
        }),
      },
    },
  );
  const createContactMut = useCreateOrganizationContact();
  const updateContactMut = useUpdateOrganizationContact();
  const deleteContactMut = useDeleteOrganizationContact();

  const userPicker = useUserMultiPicker({
    orgId,
    selectedIds: form.sourceType === "system_user" && form.sourceId ? [form.sourceId] : [],
    enabled: dialogOpen && form.sourceType === "system_user",
  });
  const employeePicker = useEmployeeMultiPicker({
    orgId,
    selectedIds: form.sourceType === "employee" && form.sourceId ? [form.sourceId] : [],
    enabled: dialogOpen && form.sourceType === "employee",
  });

  const classificationOptions = useMemo(
    () =>
      Object.entries(ORGANIZATION_CONTACT_CLASSIFICATION_LABELS).map(
        ([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ),
      ),
    [],
  );

  const resetForm = () => setForm(emptyForm());

  const startEdit = (contact: OrganizationContact) => {
    setForm({
      id: contact.id,
      sourceType: contact.sourceType,
      sourceId: contact.sourceId ?? null,
      name: contact.name,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      organizationName: contact.organizationName ?? "",
      classificationType: contact.classificationType,
      classificationDescription: contact.classificationDescription ?? "",
      notes: contact.notes ?? "",
      archived: !!contact.archivedAt,
    });
    setDialogOpen(true);
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: getListOrganizationContactsQueryKey(orgId, {
        includeArchived: true,
      }),
    });
  };

  const handleSave = async () => {
    if (form.sourceType !== "external_contact" && !form.sourceId) {
      toast({
        title: "Selecione a origem do contato",
        variant: "destructive",
      });
      return;
    }

    if (form.sourceType === "external_contact" && (!form.name.trim() || !form.email.trim())) {
      toast({
        title: "Informe nome e email do contato externo",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      sourceType: form.sourceType,
      sourceId: form.sourceType === "external_contact" ? null : form.sourceId,
      name: form.sourceType === "external_contact" ? form.name.trim() : undefined,
      email: form.sourceType === "external_contact" ? form.email.trim() : undefined,
      phone: form.phone.trim() || null,
      organizationName: form.organizationName.trim() || null,
      classificationType: form.classificationType,
      classificationDescription: form.classificationDescription.trim() || null,
      notes: form.notes.trim() || null,
      archived: form.id ? form.archived : undefined,
    };

    try {
      if (form.id) {
        await updateContactMut.mutateAsync({
          orgId,
          contactId: form.id,
          data: payload,
        });
        toast({ title: "Contato atualizado" });
      } else {
        await createContactMut.mutateAsync({
          orgId,
          data: payload,
        });
        toast({ title: "Contato criado" });
      }
      await refresh();
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      toast({
        title: "Não foi possível salvar o contato",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleArchiveToggle = async (contact: OrganizationContact) => {
    try {
      await updateContactMut.mutateAsync({
        orgId,
        contactId: contact.id,
        data: {
          archived: !contact.archivedAt,
        },
      });
      toast({
        title: contact.archivedAt ? "Contato reativado" : "Contato arquivado",
      });
      await refresh();
    } catch (error) {
      toast({
        title: "Não foi possível atualizar o status do contato",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (contact: OrganizationContact) => {
    if (!window.confirm(`Excluir o contato "${contact.name}"?`)) {
      return;
    }

    try {
      await deleteContactMut.mutateAsync({ orgId, contactId: contact.id });
      toast({ title: "Contato excluído" });
      await refresh();
    } catch (error) {
      toast({
        title: "Não foi possível excluir o contato",
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
              Contatos reutilizáveis
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Catálogo organizacional para usuários do sistema, colaboradores e contatos externos.
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
            Novo contato
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
                    Contato
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Origem
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Classificação
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Status
                  </th>
                  <th className="w-28 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contacts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-[13px] text-muted-foreground"
                    >
                      Nenhum contato reutilizável cadastrado.
                    </td>
                  </tr>
                ) : (
                  contacts.map((contact) => (
                    <tr key={contact.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            {contact.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatOrganizationContactSummary(contact)}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {ORGANIZATION_CONTACT_SOURCE_LABELS[contact.sourceType]}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {ORGANIZATION_CONTACT_CLASSIFICATION_LABELS[
                          contact.classificationType
                        ]}
                        {contact.classificationDescription
                          ? ` • ${contact.classificationDescription}`
                          : ""}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {contact.archivedAt ? "Arquivado" : "Ativo"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(contact)}
                            className="cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                            title="Editar contato"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleArchiveToggle(contact)}
                            className="cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                            title={contact.archivedAt ? "Reativar contato" : "Arquivar contato"}
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(contact)}
                            className="cursor-pointer rounded p-1.5 text-destructive transition-colors hover:text-destructive/80"
                            title="Excluir contato"
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
        title={form.id ? "Editar contato" : "Novo contato reutilizável"}
        description="Cadastre usuários, colaboradores ou pessoas externas para reutilizar em grupos."
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Origem</Label>
              <Select
                value={form.sourceType}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    sourceType: e.target.value as OrganizationContactSourceType,
                    sourceId: null,
                  }))
                }
              >
                <option value="external_contact">Contato externo</option>
                <option value="system_user">Usuário do sistema</option>
                <option value="employee">Colaborador</option>
              </Select>
            </div>
            <div>
              <Label>Classificação</Label>
              <Select
                value={form.classificationType}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    classificationType:
                      e.target.value as OrganizationContactClassificationType,
                  }))
                }
              >
                {classificationOptions}
              </Select>
            </div>
          </div>

          {form.sourceType === "system_user" ? (
            <div>
              <Label>Usuário</Label>
              <SearchableMultiSelect
                options={userPicker.options.map((user) => ({
                  value: user.id,
                  label: user.name,
                  keywords: [user.email],
                }))}
                selected={form.sourceId ? [form.sourceId] : []}
                onToggle={(id) =>
                  setForm((prev) => ({
                    ...prev,
                    sourceId: prev.sourceId === id ? null : id,
                  }))
                }
                placeholder="Selecionar usuário"
                searchPlaceholder="Buscar usuário..."
                emptyMessage="Nenhum usuário encontrado."
                onSearchValueChange={userPicker.setSearchValue}
                renderSummary={(selected) => selected[0]?.label ?? "Selecionar usuário"}
              />
            </div>
          ) : null}

          {form.sourceType === "employee" ? (
            <div>
              <Label>Colaborador</Label>
              <SearchableMultiSelect
                options={employeePicker.options.map((employee) => ({
                  value: employee.id,
                  label: employee.name,
                  keywords: [employee.email ?? ""],
                }))}
                selected={form.sourceId ? [form.sourceId] : []}
                onToggle={(id) =>
                  setForm((prev) => ({
                    ...prev,
                    sourceId: prev.sourceId === id ? null : id,
                  }))
                }
                placeholder="Selecionar colaborador"
                searchPlaceholder="Buscar colaborador..."
                emptyMessage="Nenhum colaborador encontrado."
                onSearchValueChange={employeePicker.setSearchValue}
                renderSummary={(selected) =>
                  selected[0]?.label ?? "Selecionar colaborador"
                }
              />
            </div>
          ) : null}

          {form.sourceType === "external_contact" ? (
            <div className="grid grid-cols-2 gap-4">
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
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Telefone</Label>
              <Input
                value={form.phone}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, phone: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Organização / empresa</Label>
              <Input
                value={form.organizationName}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    organizationName: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div>
            <Label>Descrição complementar da classificação</Label>
            <Input
              value={form.classificationDescription}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  classificationDescription: e.target.value,
                }))
              }
              placeholder="Ex.: cliente estratégico, fornecedor homologado..."
            />
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea
              value={form.notes}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, notes: e.target.value }))
              }
            />
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
            isLoading={
              createContactMut.isPending || updateContactMut.isPending
            }
            onClick={handleSave}
          >
            {form.sourceType === "system_user" ? (
              <UserRound className="mr-1.5 h-4 w-4" />
            ) : (
              <Users className="mr-1.5 h-4 w-4" />
            )}
            {form.id ? "Salvar contato" : "Criar contato"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
