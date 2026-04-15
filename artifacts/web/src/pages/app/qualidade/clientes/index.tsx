import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { useAuth } from "@/contexts/AuthContext";
import {
  useHeaderActions,
  usePageSubtitle,
  usePageTitle,
} from "@/contexts/LayoutContext";
import { toast } from "@/hooks/use-toast";
import {
  createCustomer,
  customersKeys,
  listCustomers,
  type CustomerListItem,
} from "@/lib/customers-client";
import {
  Building2,
  ChevronRight,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";

type CustomerFormState = {
  personType: "pj" | "pf";
  legalIdentifier: string;
  legalName: string;
  tradeName: string;
  responsibleName: string;
  email: string;
  phone: string;
  status: string;
  criticality: string;
  notes: string;
};

const emptyCustomerForm: CustomerFormState = {
  personType: "pj",
  legalIdentifier: "",
  legalName: "",
  tradeName: "",
  responsibleName: "",
  email: "",
  phone: "",
  status: "active",
  criticality: "medium",
  notes: "",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

const CRITICALITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-gray-100 text-gray-500 border-gray-200",
};

const CRITICALITY_COLORS: Record<string, string> = {
  low: "bg-sky-50 text-sky-700 border-sky-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-red-50 text-red-700 border-red-200",
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] || status;
}

function criticalityLabel(criticality: string) {
  return CRITICALITY_LABELS[criticality] || criticality;
}

function metricValue(
  customers: CustomerListItem[],
  key: keyof CustomerListItem,
) {
  return customers.reduce((total, customer) => {
    const value = customer[key];
    return total + (typeof value === "number" ? value : 0);
  }, 0);
}

export default function CustomersPage() {
  const { organization, role } = useAuth();
  const orgId = organization?.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [criticalityFilter, setCriticalityFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CustomerFormState>(emptyCustomerForm);
  const canManageCustomers = role !== "analyst";

  usePageTitle("Clientes SGI");
  usePageSubtitle(
    "Requisitos de clientes, análise crítica de capacidade e evidências do combinado.",
  );

  const filters = useMemo(
    () => ({
      search: search || undefined,
      status: statusFilter || undefined,
      criticality: criticalityFilter || undefined,
    }),
    [criticalityFilter, search, statusFilter],
  );

  const customersQuery = useQuery({
    queryKey: customersKeys.list(orgId || 0, filters),
    enabled: !!orgId,
    queryFn: () => listCustomers(orgId!, filters),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createCustomer(orgId!, {
        ...form,
        tradeName: form.tradeName || null,
        responsibleName: form.responsibleName || null,
        email: form.email || null,
        phone: form.phone || null,
        notes: form.notes || null,
      }),
    onSuccess: async (customer) => {
      await queryClient.invalidateQueries({ queryKey: customersKeys.all });
      setDialogOpen(false);
      setForm(emptyCustomerForm);
      toast({ title: "Cliente SGI criado" });
      navigate(`/qualidade/clientes/${customer.id}`);
    },
    onError: (error) => {
      toast({
        title: "Falha ao criar cliente",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    },
  });

  useHeaderActions(
    canManageCustomers ? (
      <HeaderActionButton
        label="Novo cliente"
        icon={<Plus className="h-4 w-4" />}
        onClick={() => setDialogOpen(true)}
      />
    ) : null,
  );

  const customers = customersQuery.data || [];
  const metrics = useMemo(
    () => ({
      activeCustomers: customers.filter(
        (customer) => customer.status === "active",
      ).length,
      pendingRequirements: metricValue(customers, "pendingRequirementCount"),
      acceptedRequirements: metricValue(customers, "acceptedRequirementCount"),
      restrictedRequirements: metricValue(
        customers,
        "restrictedRequirementCount",
      ),
    }),
    [customers],
  );

  const canSubmit =
    form.legalIdentifier.trim().length > 0 && form.legalName.trim().length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-4 py-4 lg:px-6">
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="rounded-lg">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Clientes ativos</p>
            <p className="mt-2 text-2xl font-semibold">
              {metrics.activeCustomers}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              Requisitos pendentes
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {metrics.pendingRequirements}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Requisitos aceitos</p>
            <p className="mt-2 text-2xl font-semibold">
              {metrics.acceptedRequirements}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              Aceitos com restrição
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {metrics.restrictedRequirements}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/70 p-3 md:flex-row md:items-end">
        <div className="flex-1">
          <Label htmlFor="customer-search">Busca</Label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-0 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="customer-search"
              className="pl-6"
              placeholder="Nome, documento ou responsável"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <div className="w-full md:w-44">
          <Label htmlFor="customer-status-filter">Status</Label>
          <Select
            id="customer-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">Todos</option>
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </Select>
        </div>
        <div className="w-full md:w-44">
          <Label htmlFor="customer-criticality-filter">Criticidade</Label>
          <Select
            id="customer-criticality-filter"
            value={criticalityFilter}
            onChange={(event) => setCriticalityFilter(event.target.value)}
          >
            <option value="">Todas</option>
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60 bg-card/70">
        {customersQuery.isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">
            Carregando clientes SGI...
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <Building2 className="h-9 w-9 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                Nenhum cliente SGI cadastrado
              </p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Registre clientes e requisitos para evidenciar análise crítica
                de capacidade antes do aceite.
              </p>
            </div>
            {canManageCustomers && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Novo cliente
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Responsável</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Criticidade</th>
                  <th className="px-4 py-3 font-medium">Requisitos</th>
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{customer.legalName}</div>
                      <div className="text-xs text-muted-foreground">
                        {customer.tradeName || customer.legalIdentifier}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {customer.responsibleName || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={STATUS_COLORS[customer.status]}
                      >
                        {statusLabel(customer.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={CRITICALITY_COLORS[customer.criticality]}
                      >
                        {criticalityLabel(customer.criticality)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs">
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        <span>{customer.requirementCount}</span>
                        <span className="text-muted-foreground">
                          total / {customer.pendingRequirementCount} pendente(s)
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          navigate(`/qualidade/clientes/${customer.id}`)
                        }
                      >
                        Abrir
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setForm(emptyCustomerForm);
        }}
        title="Novo cliente SGI"
        description="Cadastre apenas os dados necessários para controle SGI de requisitos do cliente."
        size="lg"
      >
        <div className="grid gap-4 p-6 md:grid-cols-2">
          <div>
            <Label htmlFor="customer-person-type">Tipo</Label>
            <Select
              id="customer-person-type"
              value={form.personType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  personType: event.target.value as "pj" | "pf",
                }))
              }
            >
              <option value="pj">Pessoa jurídica</option>
              <option value="pf">Pessoa física</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="customer-identifier">
              {form.personType === "pf" ? "CPF" : "CNPJ"} *
            </Label>
            <Input
              id="customer-identifier"
              value={form.legalIdentifier}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  legalIdentifier: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="customer-legal-name">
              {form.personType === "pf" ? "Nome" : "Razão social"} *
            </Label>
            <Input
              id="customer-legal-name"
              value={form.legalName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  legalName: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="customer-trade-name">Nome usual</Label>
            <Input
              id="customer-trade-name"
              value={form.tradeName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  tradeName: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="customer-responsible">Responsável no cliente</Label>
            <Input
              id="customer-responsible"
              value={form.responsibleName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  responsibleName: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="customer-email">E-mail</Label>
            <Input
              id="customer-email"
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="customer-phone">Telefone</Label>
            <Input
              id="customer-phone"
              value={form.phone}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="customer-criticality">Criticidade</Label>
            <Select
              id="customer-criticality"
              value={form.criticality}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  criticality: event.target.value,
                }))
              }
            >
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="customer-notes">Observações SGI</Label>
            <Textarea
              id="customer-notes"
              rows={3}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDialogOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
            isLoading={createMutation.isPending}
          >
            Criar cliente
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
