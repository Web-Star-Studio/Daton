import React, { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useHeaderActions } from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { OrganizationContactsCatalogSection } from "@/components/settings/OrganizationContactsCatalogSection";
import { OrganizationContactGroupsSection } from "@/components/settings/OrganizationContactGroupsSection";
import {
  Plus,
  Trash2,
  Mail,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  Shield,
  ShieldCheck,
  Eye,
  Settings2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  useListInvitations,
  useCreateInvitation,
  useRevokeInvitation,
  useDeleteInvitation,
  getListInvitationsQueryKey,
  useListOrgUsers,
  useCreateOrgUser,
  useUpdateUserRole,
  useUpdateUserModules,
  getListOrgUsersQueryKey,
  type AppModule as GeneratedAppModule,
  type UpdateUserRoleBodyRole,
} from "@workspace/api-client-react";

type OrgUserModule = string;

type CreateUserFormData = {
  name: string;
  email: string;
  password: string;
  role: "org_admin" | "operator" | "analyst";
  modules: OrgUserModule[];
};

type InviteFormData = {
  email: string;
  role: "org_admin" | "operator" | "analyst";
  modules: OrgUserModule[];
};

const ROLE_LABELS: Record<string, string> = {
  platform_admin: "Admin Plataforma",
  org_admin: "Administrador",
  operator: "Operador",
  analyst: "Analista",
};

const MODULE_LABELS: Record<string, string> = {
  documents: "Documentos",
  legislations: "Legislações",
  employees: "Colaboradores",
  units: "Unidades",
  departments: "Departamentos",
  positions: "Cargos",
  governance: "Governança",
  suppliers: "Fornecedores",
  customers: "Clientes SGI",
  environmental: "Ambiental",
};

const ALL_MODULES: OrgUserModule[] = [
  "documents",
  "legislations",
  "employees",
  "units",
  "departments",
  "positions",
  "governance",
  "suppliers",
  "customers",
  "environmental",
];

const emptyCreateUserForm: CreateUserFormData = {
  name: "",
  email: "",
  password: "",
  role: "analyst",
  modules: [],
};

const emptyInviteForm: InviteFormData = {
  email: "",
  role: "analyst",
  modules: [],
};

export function OrganizationUsersSettingsSection() {
  const queryClient = useQueryClient();
  const { organization, user: currentUser } = useAuth();
  const { isOrgAdmin } = usePermissions();
  const orgId = organization?.id;

  const { data: invitationsData, isLoading: invitationsLoading } =
    useListInvitations({
      query: {
        queryKey: getListInvitationsQueryKey(),
        enabled: !!orgId && isOrgAdmin,
      },
    });
  const createInviteMut = useCreateInvitation();
  const revokeInviteMut = useRevokeInvitation();
  const deleteInviteMut = useDeleteInvitation();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [selectedInviteIds, setSelectedInviteIds] = useState<Set<number>>(
    new Set(),
  );
  const [inviteForm, setInviteForm] = useState<InviteFormData>(emptyInviteForm);

  const { data: orgUsersData, isLoading: orgUsersLoading } = useListOrgUsers(
    orgId!,
    {
      query: {
        queryKey: getListOrgUsersQueryKey(orgId!),
        enabled: !!orgId && isOrgAdmin,
      },
    },
  );
  const createOrgUserMut = useCreateOrgUser();
  const updateRoleMut = useUpdateUserRole();
  const updateModulesMut = useUpdateUserModules();
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [createUserError, setCreateUserError] = useState("");
  const createUserForm = useForm<CreateUserFormData>({
    defaultValues: emptyCreateUserForm,
  });
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{
    id: number;
    name: string;
    email: string;
    role: string;
    modules: OrgUserModule[];
  } | null>(null);
  const [editRole, setEditRole] = useState<UpdateUserRoleBodyRole>("operator");
  const [editModules, setEditModules] = useState<OrgUserModule[]>([]);
  const createUserRole = createUserForm.watch("role");
  const createUserModules = createUserForm.watch("modules") || [];

  useEffect(() => {
    if (createUserRole === "org_admin") {
      createUserForm.setValue("modules", [], { shouldValidate: true });
      createUserForm.clearErrors("modules");
    }
  }, [createUserForm, createUserRole]);

  useEffect(() => {
    if (inviteForm.role === "org_admin" && inviteForm.modules.length > 0) {
      setInviteForm((prev) => ({ ...prev, modules: [] }));
    }
  }, [inviteForm.modules.length, inviteForm.role]);

  const resetCreateUserDialog = () => {
    createUserForm.reset(emptyCreateUserForm);
    createUserForm.clearErrors();
    setCreateUserError("");
  };

  const headerActions = useMemo(() => {
    if (!isOrgAdmin) return null;

    if (selectedInviteIds.size > 0) {
      const selectedInvites =
        invitationsData?.invitations?.filter((inv) =>
          selectedInviteIds.has(inv.id),
        ) || [];
      const pendingIds = selectedInvites
        .filter((inv) => inv.status === "pending")
        .map((inv) => inv.id);
      const deletableIds = selectedInvites
        .filter((inv) => inv.status !== "pending")
        .map((inv) => inv.id);

      return (
        <div className="flex items-center gap-2">
          <span className="mr-1 text-xs text-muted-foreground">
            {selectedInviteIds.size} selecionado
            {selectedInviteIds.size > 1 ? "s" : ""}
          </span>
          {pendingIds.length > 0 && (
            <HeaderActionButton
              size="sm"
              variant="destructive"
              onClick={async () => {
                const failed: number[] = [];
                for (const id of pendingIds) {
                  try {
                    await revokeInviteMut.mutateAsync({ invitationId: id });
                  } catch {
                    failed.push(id);
                  }
                }
                queryClient.invalidateQueries({
                  queryKey: getListInvitationsQueryKey(),
                });
                if (failed.length > 0) {
                  toast({
                    title: "Erro ao revogar convites",
                    description: `${failed.length} convite(s) não puderam ser revogados.`,
                    variant: "destructive",
                  });
                  setSelectedInviteIds(new Set(failed));
                } else {
                  setSelectedInviteIds(new Set());
                }
              }}
              isLoading={revokeInviteMut.isPending}
              label={`Revogar (${pendingIds.length})`}
              icon={<X className="h-3.5 w-3.5" />}
            >
              Revogar ({pendingIds.length})
            </HeaderActionButton>
          )}
          {deletableIds.length > 0 && (
            <HeaderActionButton
              size="sm"
              variant="destructive"
              onClick={async () => {
                const failed: number[] = [];
                for (const id of deletableIds) {
                  try {
                    await deleteInviteMut.mutateAsync({ invitationId: id });
                  } catch {
                    failed.push(id);
                  }
                }
                queryClient.invalidateQueries({
                  queryKey: getListInvitationsQueryKey(),
                });
                if (failed.length > 0) {
                  toast({
                    title: "Erro ao excluir convites",
                    description: `${failed.length} convite(s) não puderam ser excluídos.`,
                    variant: "destructive",
                  });
                  setSelectedInviteIds(new Set(failed));
                } else {
                  setSelectedInviteIds(new Set());
                }
              }}
              isLoading={deleteInviteMut.isPending}
              label={`Excluir (${deletableIds.length})`}
              icon={<Trash2 className="h-3.5 w-3.5" />}
            >
              Excluir ({deletableIds.length})
            </HeaderActionButton>
          )}
          <HeaderActionButton
            size="sm"
            variant="outline"
            onClick={() => setSelectedInviteIds(new Set())}
            label="Cancelar seleção"
            icon={<X className="h-3.5 w-3.5" />}
          >
            Cancelar
          </HeaderActionButton>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <HeaderActionButton
          size="sm"
          variant="outline"
          onClick={() => {
            setInviteForm(emptyInviteForm);
            setInviteError("");
            setInviteDialogOpen(true);
          }}
          label="Convidar Usuário"
          icon={<Mail className="h-3.5 w-3.5" />}
        >
          Convidar Usuário
        </HeaderActionButton>
        <HeaderActionButton
          size="sm"
          onClick={() => {
            resetCreateUserDialog();
            setCreateUserDialogOpen(true);
          }}
          label="Criar Usuário"
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          Criar Usuário
        </HeaderActionButton>
      </div>
    );
  }, [
    deleteInviteMut,
    invitationsData,
    isOrgAdmin,
    queryClient,
    revokeInviteMut,
    selectedInviteIds,
  ]);

  useHeaderActions(headerActions);

  if (!orgId || !isOrgAdmin) {
    return null;
  }

  return (
    <>
      <div className="space-y-8">
        <div>
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Membros da Organização
          </h3>
          {orgUsersLoading ? (
            <div className="py-12 text-center text-muted-foreground">
              Carregando...
            </div>
          ) : (
            <div className="overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Cargo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Módulos
                    </th>
                    <th className="w-16 px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(!orgUsersData?.users ||
                    orgUsersData.users.length === 0) && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-12 text-center text-[13px] text-muted-foreground"
                      >
                        Nenhum usuário encontrado.
                      </td>
                    </tr>
                  )}
                  {orgUsersData?.users?.map((u) => {
                    const isSelf = u.id === currentUser?.id;
                    const isProtected =
                      u.role === "org_admin" || u.role === "platform_admin";

                    return (
                      <tr
                        key={u.id}
                        className="transition-colors hover:bg-muted/50"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-xs font-medium text-foreground/60">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-[13px] font-medium text-foreground">
                              {u.name}
                            </span>
                            {isSelf && (
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                              >
                                Você
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-[13px] text-muted-foreground">
                          {u.email}
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            variant={isProtected ? "default" : "outline"}
                            className="text-[11px]"
                          >
                            {u.role === "org_admin" && (
                              <ShieldCheck className="mr-1 h-3 w-3" />
                            )}
                            {u.role === "operator" && (
                              <Shield className="mr-1 h-3 w-3" />
                            )}
                            {u.role === "analyst" && (
                              <Eye className="mr-1 h-3 w-3" />
                            )}
                            {ROLE_LABELS[u.role] || u.role}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          {isProtected ? (
                            <span className="text-[12px] text-muted-foreground">
                              Acesso total
                            </span>
                          ) : u.modules.length === 0 ? (
                            <span className="text-[12px] text-muted-foreground">
                              Nenhum
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {u.modules.map((module) => (
                                <Badge
                                  key={module}
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  {MODULE_LABELS[module] || module}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {!isProtected && !isSelf && (
                            <button
                              onClick={() => {
                                setEditingUser({
                                  id: u.id,
                                  name: u.name,
                                  email: u.email,
                                  role: u.role,
                                  modules: u.modules,
                                });
                                setEditRole(
                                  u.role === "analyst" ? "analyst" : "operator",
                                );
                                setEditModules([...u.modules]);
                                setPermDialogOpen(true);
                              }}
                              className="cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                              title="Configurar permissões"
                              aria-label="Configurar permissões"
                            >
                              <Settings2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Convites
          </h3>
          {invitationsLoading ? (
            <div className="py-12 text-center text-muted-foreground">
              Carregando...
            </div>
          ) : (
            <div className="overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={
                          !!invitationsData?.invitations?.length &&
                          invitationsData.invitations.every((inv) =>
                            selectedInviteIds.has(inv.id),
                          )
                        }
                        onChange={() => {
                          const all = invitationsData?.invitations ?? [];
                          if (
                            all.length > 0 &&
                            all.every((inv) => selectedInviteIds.has(inv.id))
                          ) {
                            setSelectedInviteIds(new Set());
                          } else {
                            setSelectedInviteIds(
                              new Set(all.map((inv) => inv.id)),
                            );
                          }
                        }}
                        className="cursor-pointer rounded border-border text-primary"
                        disabled={!invitationsData?.invitations?.length}
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Cargo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Módulos
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Convidado por
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Enviado em
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(!invitationsData?.invitations ||
                    invitationsData.invitations.length === 0) && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-6 py-12 text-center text-[13px] text-muted-foreground"
                      >
                        Nenhum convite enviado.
                      </td>
                    </tr>
                  )}
                  {invitationsData?.invitations?.map((inv) => {
                    const isSelected = selectedInviteIds.has(inv.id);

                    return (
                      <tr
                        key={inv.id}
                        className={
                          isSelected
                            ? "bg-primary/5"
                            : "transition-colors hover:bg-muted/50"
                        }
                      >
                        <td className="w-10 px-3 py-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedInviteIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(inv.id)) next.delete(inv.id);
                                else next.add(inv.id);
                                return next;
                              });
                            }}
                            className="cursor-pointer rounded border-border text-primary"
                          />
                        </td>
                        <td className="px-6 py-4 text-[13px] font-medium text-foreground">
                          {inv.email}
                        </td>
                        <td className="px-6 py-4">
                          {inv.status === "pending" && (
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-50 text-amber-600"
                            >
                              <Clock className="mr-1 h-3 w-3" />
                              Pendente
                            </Badge>
                          )}
                          {inv.status === "accepted" && (
                            <Badge
                              variant="outline"
                              className="border-green-200 bg-green-50 text-green-600"
                            >
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Aceito
                            </Badge>
                          )}
                          {inv.status === "revoked" && (
                            <Badge
                              variant="outline"
                              className="border-red-200 bg-red-50 text-red-600"
                            >
                              <XCircle className="mr-1 h-3 w-3" />
                              Revogado
                            </Badge>
                          )}
                          {inv.status === "expired" && (
                            <Badge
                              variant="outline"
                              className="border-border text-muted-foreground"
                            >
                              <Clock className="mr-1 h-3 w-3" />
                              Expirado
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className="text-[11px]">
                            {ROLE_LABELS[inv.role] || inv.role}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          {inv.role === "org_admin" ? (
                            <span className="text-[12px] text-muted-foreground">
                              Acesso total
                            </span>
                          ) : inv.modules.length === 0 ? (
                            <span className="text-[12px] text-muted-foreground">
                              Nenhum
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {inv.modules.map((module) => (
                                <Badge
                                  key={module}
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  {MODULE_LABELS[module] || module}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-[13px] text-muted-foreground">
                          {inv.invitedByName}
                        </td>
                        <td className="px-6 py-4 text-[13px] text-muted-foreground">
                          {new Date(inv.createdAt).toLocaleDateString("pt-BR")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <OrganizationContactsCatalogSection orgId={orgId} />
        <OrganizationContactGroupsSection orgId={orgId} />
      </div>

      <Dialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        title="Convidar Usuário"
        description="Envie um convite por email para adicionar um novo usuário à organização."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setInviteError("");

            if (!inviteForm.email.trim()) return;
            if (
              inviteForm.role !== "org_admin" &&
              inviteForm.modules.length === 0
            ) {
              setInviteError("Selecione ao menos um módulo para este convite");
              return;
            }

            try {
              await createInviteMut.mutateAsync({
                data: {
                  email: inviteForm.email.trim(),
                  role: inviteForm.role,
                  modules: (inviteForm.role === "org_admin"
                    ? []
                    : inviteForm.modules) as GeneratedAppModule[],
                },
              });
              setInviteForm(emptyInviteForm);
              setInviteDialogOpen(false);
              queryClient.invalidateQueries({
                queryKey: getListInvitationsQueryKey(),
              });
            } catch (err: unknown) {
              const message =
                err instanceof Error
                  ? err.message
                  : typeof err === "object" && err !== null && "data" in err
                    ? (err as { data?: { error?: string } }).data?.error
                    : undefined;
              setInviteError(message || "Erro ao enviar convite");
            }
          }}
        >
          <div className="space-y-5">
            <div>
              <Label>Email do convidado</Label>
              <Input
                type="email"
                value={inviteForm.email}
                onChange={(e) => {
                  setInviteForm((prev) => ({ ...prev, email: e.target.value }));
                  setInviteError("");
                }}
                placeholder="colaborador@empresa.com"
                autoFocus
              />
            </div>
            <div>
              <Label>Cargo</Label>
              <Select
                value={inviteForm.role}
                onChange={(e) => {
                  setInviteForm((prev) => ({
                    ...prev,
                    role: e.target.value as InviteFormData["role"],
                  }));
                  setInviteError("");
                }}
              >
                <option value="org_admin">Administrador</option>
                <option value="operator">Operador</option>
                <option value="analyst">Analista</option>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {inviteForm.role === "org_admin"
                  ? "Administradores da organização recebem acesso total."
                  : inviteForm.role === "operator"
                    ? "Operadores podem editar os módulos atribuídos."
                    : "Analistas possuem acesso de visualização aos módulos atribuídos."}
              </p>
            </div>
            <div>
              <Label>Módulos</Label>
              {inviteForm.role === "org_admin" ? (
                <div className="mt-2 rounded-lg border border-border bg-muted/20 px-3 py-3 text-[13px] text-muted-foreground">
                  Admins da organização recebem acesso total. Nenhum módulo
                  precisa ser selecionado.
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {ALL_MODULES.map((mod) => (
                    <label
                      key={mod}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        checked={inviteForm.modules.includes(mod)}
                        onChange={() => {
                          setInviteForm((prev) => ({
                            ...prev,
                            modules: prev.modules.includes(mod)
                              ? prev.modules.filter(
                                  (currentModule) => currentModule !== mod,
                                )
                              : [...prev.modules, mod],
                          }));
                          setInviteError("");
                        }}
                        className="rounded border-border text-primary"
                      />
                      <span className="text-[13px]">
                        {MODULE_LABELS[mod] || mod}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          {inviteError && (
            <p className="mt-3 text-sm text-destructive">{inviteError}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setInviteDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={createInviteMut.isPending}
            >
              <Mail className="mr-1.5 h-4 w-4" />
              Enviar Convite
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog
        open={createUserDialogOpen}
        onOpenChange={(open) => {
          setCreateUserDialogOpen(open);
          if (!open) resetCreateUserDialog();
        }}
        title="Criar Usuário"
        description="Crie uma conta diretamente na organização e defina o acesso inicial."
      >
        <form
          onSubmit={createUserForm.handleSubmit(async (data) => {
            setCreateUserError("");

            if (data.role !== "org_admin" && data.modules.length === 0) {
              createUserForm.setError("modules", {
                type: "manual",
                message: "Selecione ao menos um módulo",
              });
              return;
            }

            try {
              await createOrgUserMut.mutateAsync({
                orgId,
                data: {
                  name: data.name.trim(),
                  email: data.email.trim(),
                  password: data.password,
                  role: data.role,
                  modules: (data.role === "org_admin"
                    ? []
                    : data.modules) as GeneratedAppModule[],
                },
              });
              queryClient.invalidateQueries({
                queryKey: getListOrgUsersQueryKey(orgId),
              });
              setCreateUserDialogOpen(false);
              resetCreateUserDialog();
            } catch (err: unknown) {
              const message =
                typeof err === "object" && err !== null && "data" in err
                  ? (err as { data?: { error?: string } }).data?.error
                  : err instanceof Error
                    ? err.message
                    : undefined;
              setCreateUserError(message || "Erro ao criar usuário");
            }
          })}
        >
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              <div>
                <Label>Nome</Label>
                <Input
                  {...createUserForm.register("name", {
                    required: "Nome é obrigatório",
                  })}
                  placeholder="Nome completo"
                />
                {createUserForm.formState.errors.name && (
                  <p className="mt-1.5 text-xs text-destructive">
                    {createUserForm.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  {...createUserForm.register("email", {
                    required: "Email é obrigatório",
                  })}
                  placeholder="colaborador@empresa.com"
                />
                {createUserForm.formState.errors.email && (
                  <p className="mt-1.5 text-xs text-destructive">
                    {createUserForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div>
                <Label>Senha</Label>
                <Input
                  type="password"
                  {...createUserForm.register("password", {
                    required: "Senha é obrigatória",
                    minLength: {
                      value: 6,
                      message: "A senha deve ter no mínimo 6 caracteres",
                    },
                  })}
                  placeholder="Mínimo de 6 caracteres"
                />
                {createUserForm.formState.errors.password && (
                  <p className="mt-1.5 text-xs text-destructive">
                    {createUserForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              <div>
                <Label>Cargo</Label>
                <Select {...createUserForm.register("role")}>
                  <option value="org_admin">Administrador</option>
                  <option value="operator">Operador</option>
                  <option value="analyst">Analista</option>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {createUserRole === "org_admin"
                    ? "Administradores da organização recebem acesso total."
                    : createUserRole === "operator"
                      ? "Operadores podem editar os módulos atribuídos."
                      : "Analistas possuem acesso de visualização aos módulos atribuídos."}
                </p>
              </div>
            </div>

            <div>
              <Label>Módulos</Label>
              {createUserRole === "org_admin" ? (
                <div className="mt-2 rounded-lg border border-border bg-muted/20 px-3 py-3 text-[13px] text-muted-foreground">
                  Admins da organização recebem acesso total. Nenhum módulo
                  precisa ser selecionado.
                </div>
              ) : (
                <>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {ALL_MODULES.map((mod) => (
                      <label
                        key={mod}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/30"
                      >
                        <input
                          type="checkbox"
                          checked={createUserModules.includes(mod)}
                          onChange={() => {
                            const nextModules = createUserModules.includes(mod)
                              ? createUserModules.filter(
                                  (currentModule) => currentModule !== mod,
                                )
                              : [...createUserModules, mod];
                            createUserForm.setValue("modules", nextModules, {
                              shouldValidate: true,
                            });
                            createUserForm.clearErrors("modules");
                          }}
                          className="rounded border-border text-primary"
                        />
                        <span className="text-[13px]">
                          {MODULE_LABELS[mod] || mod}
                        </span>
                      </label>
                    ))}
                  </div>
                  {createUserForm.formState.errors.modules && (
                    <p className="mt-1.5 text-xs text-destructive">
                      {
                        createUserForm.formState.errors.modules
                          .message as string
                      }
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          {createUserError && (
            <p className="mt-4 text-sm text-destructive">{createUserError}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCreateUserDialogOpen(false);
                resetCreateUserDialog();
              }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={createOrgUserMut.isPending}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Criar Usuário
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog
        open={permDialogOpen}
        onOpenChange={setPermDialogOpen}
        title="Configurar Permissões"
        description={
          editingUser ? `Defina o cargo e módulos de ${editingUser.name}.` : ""
        }
      >
        {editingUser && (
          <div className="space-y-5">
            <div>
              <Label>Cargo</Label>
              <Select
                value={editRole}
                onChange={(e) =>
                  setEditRole(e.target.value as UpdateUserRoleBodyRole)
                }
              >
                <option value="operator">Operador</option>
                <option value="analyst">Analista</option>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {editRole === "operator"
                  ? "Pode visualizar e editar dados dos módulos atribuídos."
                  : "Somente visualização dos módulos atribuídos."}
              </p>
            </div>
            <div>
              <Label>Módulos</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {ALL_MODULES.map((mod) => (
                  <label
                    key={mod}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/30"
                  >
                    <input
                      type="checkbox"
                      checked={editModules.includes(mod)}
                      onChange={() => {
                        setEditModules((prev) =>
                          prev.includes(mod)
                            ? prev.filter(
                                (currentModule) => currentModule !== mod,
                              )
                            : [...prev, mod],
                        );
                      }}
                      className="rounded border-border text-primary"
                    />
                    <span className="text-[13px]">
                      {MODULE_LABELS[mod] || mod}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPermDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                isLoading={
                  updateRoleMut.isPending || updateModulesMut.isPending
                }
                onClick={async () => {
                  if (!editingUser) return;

                  try {
                    if (editRole !== editingUser.role) {
                      await updateRoleMut.mutateAsync({
                        orgId,
                        userId: editingUser.id,
                        data: { role: editRole },
                      });
                    }

                    const modulesChanged =
                      [...editModules].sort().join(",") !==
                      [...editingUser.modules].sort().join(",");
                    if (modulesChanged) {
                      await updateModulesMut.mutateAsync({
                        orgId,
                        userId: editingUser.id,
                        data: { modules: editModules as GeneratedAppModule[] },
                      });
                    }

                    queryClient.invalidateQueries({
                      queryKey: getListOrgUsersQueryKey(orgId),
                    });
                    setPermDialogOpen(false);
                  } catch {
                    queryClient.invalidateQueries({
                      queryKey: getListOrgUsersQueryKey(orgId),
                    });
                    toast({
                      title: "Erro ao atualizar permissões",
                      description:
                        "Não foi possível salvar todas as alterações. Tente novamente.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Salvar
              </Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>
    </>
  );
}
