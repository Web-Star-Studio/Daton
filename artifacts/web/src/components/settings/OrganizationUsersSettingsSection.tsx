import React, { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Command as CommandPrimitive } from "cmdk";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useHeaderActions } from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { OrganizationContactsCatalogSection } from "@/components/settings/OrganizationContactsCatalogSection";
import { OrganizationContactGroupsSection } from "@/components/settings/OrganizationContactGroupsSection";
import {
  Check,
  ChevronsUpDown,
  Plus,
  Trash2,
  Mail,
  Search,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  Shield,
  ShieldCheck,
  Eye,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  listEmployees,
  useListInvitations,
  useCreateInvitation,
  useRevokeInvitation,
  useDeleteInvitation,
  getListInvitationsQueryKey,
  useListOrgUsers,
  useListUnits,
  getListUnitsQueryKey,
  useCreateOrgUser,
  useUpdateUserRole,
  useUpdateUserModules,
  getListOrgUsersQueryKey,
  type AppModule,
  type UpdateUserRoleBodyRole,
} from "@workspace/api-client-react";

type OrgUserModule = AppModule;

type CreateUserFormData = {
  name: string;
  email: string;
  password: string;
  role: "org_admin" | "manager" | "operator" | "analyst";
  modules: OrgUserModule[];
  unitId: number | null;
};

type InviteFormData = {
  email: string;
  role: "org_admin" | "operator" | "analyst";
  modules: OrgUserModule[];
};

const ROLE_LABELS: Record<string, string> = {
  platform_admin: "Admin Plataforma",
  org_admin: "Administrador",
  manager: "Gerente",
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
  environmental: "Ambiental",
  kpi: "Indicadores",
  roadSafety: "Fatores de Desempenho (SV)",
  assets: "Infraestrutura",
  regulatoryDocuments: "Documentos Regulatórios",
  swot: "SWOT",
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
  "environmental",
  "kpi",
  "roadSafety",
  "assets",
  "regulatoryDocuments",
  "swot",
];

const emptyCreateUserForm: CreateUserFormData = {
  name: "",
  email: "",
  password: "",
  role: "analyst",
  modules: [],
  unitId: null,
};

const emptyInviteForm: InviteFormData = {
  email: "",
  role: "analyst",
  modules: [],
};

type EmployeeOption = { id: number; name: string; email: string | null };

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

type EmployeePickerProps = {
  orgId: number;
  value: string;
  onChange: (value: string) => void;
  onPick: (employee: EmployeeOption) => void;
  placeholder?: string;
  /** Emails (lowercase) that should be hidden from the picker — e.g. existing users or pending invitations. */
  excludeEmails?: Set<string>;
};

function EmployeePicker({ orgId, value, onChange, onPick, placeholder, excludeEmails }: EmployeePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 250);

  const PAGE_SIZE = 100;
  const { data: rawEmployees = [], isFetching } = useQuery({
    queryKey: ["user-create-employees", orgId, debouncedSearch],
    enabled: !!orgId && open,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: async () => {
      const search = debouncedSearch || undefined;
      const first = await listEmployees(orgId, { page: 1, pageSize: PAGE_SIZE, search });
      if (first.pagination.totalPages <= 1) return first.data as EmployeeOption[];
      const remainingPages = Array.from(
        { length: first.pagination.totalPages - 1 },
        (_, i) => i + 2,
      );
      const rest = await Promise.all(
        remainingPages.map((page) =>
          listEmployees(orgId, { page, pageSize: PAGE_SIZE, search }),
        ),
      );
      return rest.reduce((acc, r) => acc.concat(r.data as EmployeeOption[]), first.data as EmployeeOption[]);
    },
  });

  const employees = useMemo(() => {
    if (!excludeEmails || excludeEmails.size === 0) return rawEmployees;
    return rawEmployees.filter(
      (emp) => !emp.email || !excludeEmails.has(emp.email.trim().toLowerCase()),
    );
  }, [rawEmployees, excludeEmails]);
  const hiddenCount = rawEmployees.length - employees.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 w-full justify-between font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate text-left">{value || placeholder || "Selecione um colaborador"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0"
      >
        <CommandPrimitive loop filter={() => 1} className="overflow-hidden rounded-md bg-popover">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            <CommandPrimitive.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Buscar colaborador por nome..."
              className="h-10 w-full border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
          </div>
          <CommandPrimitive.List className="max-h-64 overflow-y-auto p-1">
            {isFetching && employees.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                Carregando...
              </div>
            ) : null}
            <CommandPrimitive.Empty className="px-3 py-4 text-center text-xs text-muted-foreground">
              {debouncedSearch ? "Nenhum colaborador encontrado" : "Comece a digitar para buscar"}
            </CommandPrimitive.Empty>
            {employees.map((emp) => {
              const isSelected = emp.name === value;
              return (
                <CommandPrimitive.Item
                  key={emp.id}
                  value={String(emp.id)}
                  onSelect={() => {
                    onChange(emp.name);
                    onPick(emp);
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-start justify-between gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{emp.name}</div>
                    {emp.email && (
                      <div className="truncate text-xs text-muted-foreground">{emp.email}</div>
                    )}
                  </div>
                  {isSelected && <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" />}
                </CommandPrimitive.Item>
              );
            })}
            {hiddenCount > 0 && (
              <div className="border-t border-border/60 px-3 py-2 text-center text-[11px] text-muted-foreground">
                {hiddenCount} colaborador{hiddenCount !== 1 ? "es" : ""} oculto{hiddenCount !== 1 ? "s" : ""} (já possui{hiddenCount !== 1 ? "em" : ""} conta ou convite)
              </div>
            )}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}

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
  const { data: orgUnits = [] } = useListUnits(orgId!, {
    query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId },
  });
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
    unitId: number | null;
    modules: AppModule[];
  } | null>(null);
  const [editRole, setEditRole] = useState<UpdateUserRoleBodyRole>("operator");
  const [editUnitId, setEditUnitId] = useState<number | null>(null);
  const [editUnitError, setEditUnitError] = useState("");
  const [editModules, setEditModules] = useState<AppModule[]>([]);
  const createUserRole = createUserForm.watch("role");
  const createUserModules = createUserForm.watch("modules") || [];

  const excludedEmployeeEmails = useMemo(() => {
    const set = new Set<string>();
    for (const u of orgUsersData?.users ?? []) {
      if (u.email) set.add(u.email.trim().toLowerCase());
    }
    for (const inv of invitationsData?.invitations ?? []) {
      if (inv.status === "pending" && inv.email) {
        set.add(inv.email.trim().toLowerCase());
      }
    }
    return set;
  }, [orgUsersData?.users, invitationsData?.invitations]);

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
                                  unitId: u.unitId ?? null,
                                  modules: u.modules,
                                });
                                setEditRole(
                                  u.role === "manager" ||
                                    u.role === "analyst"
                                    ? (u.role as UpdateUserRoleBodyRole)
                                    : "operator",
                                );
                                setEditUnitId(u.unitId ?? null);
                                setEditUnitError("");
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
                              className="border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300"
                            >
                              <Clock className="mr-1 h-3 w-3" />
                              Pendente
                            </Badge>
                          )}
                          {inv.status === "accepted" && (
                            <Badge
                              variant="outline"
                              className="border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                            >
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Aceito
                            </Badge>
                          )}
                          {inv.status === "revoked" && (
                            <Badge
                              variant="outline"
                              className="border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300"
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
                  modules:
                    inviteForm.role === "org_admin" ? [] : inviteForm.modules,
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

            if (data.role === "manager" && !data.unitId) {
              createUserForm.setError("unitId", {
                type: "manual",
                message: "Selecione a filial do gerente",
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
                  modules: data.role === "org_admin" ? [] : data.modules,
                  unitId: data.role === "org_admin" ? null : data.unitId ?? null,
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
                <input
                  type="hidden"
                  {...createUserForm.register("name", {
                    required: "Nome é obrigatório",
                  })}
                />
                {orgId ? (
                  <EmployeePicker
                    orgId={orgId}
                    value={createUserForm.watch("name") ?? ""}
                    onChange={(v) =>
                      createUserForm.setValue("name", v, { shouldValidate: true })
                    }
                    onPick={(emp) => {
                      const currentEmail = createUserForm.getValues("email").trim();
                      if (emp.email && !currentEmail) {
                        createUserForm.setValue("email", emp.email, {
                          shouldValidate: true,
                        });
                      }
                    }}
                    placeholder="Buscar colaborador..."
                    excludeEmails={excludedEmployeeEmails}
                  />
                ) : null}
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
                  <option value="manager">Gerente</option>
                  <option value="operator">Operador</option>
                  <option value="analyst">Analista</option>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {createUserRole === "org_admin"
                    ? "Administradores da organização recebem acesso total."
                    : createUserRole === "manager"
                      ? "Gerentes administram os indicadores da filial selecionada (e os corporativos)."
                      : createUserRole === "operator"
                        ? "Operadores podem editar os módulos atribuídos."
                        : "Analistas possuem acesso de visualização aos módulos atribuídos."}
                </p>
                {createUserRole !== "org_admin" && (
                  <div className="mt-3">
                    <Label>Filial{createUserRole === "manager" ? "" : " (opcional)"}</Label>
                    <Select
                      value={createUserForm.watch("unitId") ?? ""}
                      onChange={(e) =>
                        createUserForm.setValue(
                          "unitId",
                          e.target.value ? Number(e.target.value) : null,
                          { shouldValidate: true },
                        )
                      }
                    >
                      <option value="">Selecione uma filial</option>
                      {orgUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </Select>
                    {createUserForm.formState.errors.unitId && (
                      <p className="mt-1 text-xs text-destructive">
                        {createUserForm.formState.errors.unitId.message as string}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      O gerente verá e gerenciará os indicadores desta filial (e os
                      corporativos).
                    </p>
                  </div>
                )}
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
                onChange={(e) => {
                  const nextRole = e.target.value as UpdateUserRoleBodyRole;
                  setEditRole(nextRole);
                  if (nextRole !== "manager") {
                    setEditUnitError("");
                  }
                }}
              >
                <option value="operator">Operador</option>
                <option value="analyst">Analista</option>
                <option value="manager">Gerente</option>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {editRole === "manager"
                  ? "Gerentes administram os indicadores da filial selecionada (e os corporativos)."
                  : editRole === "operator"
                    ? "Pode visualizar e editar dados dos módulos atribuídos."
                    : "Somente visualização dos módulos atribuídos."}
              </p>
              <div className="mt-3">
                <Label>Filial{editRole === "manager" ? "" : " (opcional)"}</Label>
                <Select
                  value={editUnitId ?? ""}
                  onChange={(e) => {
                    setEditUnitId(
                      e.target.value ? Number(e.target.value) : null,
                    );
                    if (e.target.value) setEditUnitError("");
                  }}
                >
                  <option value="">Selecione uma filial</option>
                  {orgUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
                {editUnitError && (
                  <p className="mt-1 text-xs text-destructive">
                    {editUnitError}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {editRole === "manager"
                    ? "O gerente verá e gerenciará os indicadores desta filial (e os corporativos)."
                    : "A filial define o escopo do painel de pendências deste usuário."}
                </p>
              </div>
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

                  if (editRole === "manager" && !editUnitId) {
                    setEditUnitError("Selecione a filial do gerente.");
                    return;
                  }

                  const nextUnitId = editUnitId ?? null;

                  try {
                    const roleChanged = editRole !== editingUser.role;
                    const unitChanged =
                      (nextUnitId ?? null) !== (editingUser.unitId ?? null);
                    if (roleChanged || unitChanged) {
                      await updateRoleMut.mutateAsync({
                        orgId,
                        userId: editingUser.id,
                        data: { role: editRole, unitId: nextUnitId },
                      });
                    }

                    const modulesChanged =
                      [...editModules].sort().join(",") !==
                      [...editingUser.modules].sort().join(",");
                    if (modulesChanged) {
                      await updateModulesMut.mutateAsync({
                        orgId,
                        userId: editingUser.id,
                        data: { modules: editModules },
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
