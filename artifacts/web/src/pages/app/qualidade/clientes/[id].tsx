import { useMemo, useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getListUnitsQueryKey,
  getListUserOptionsQueryKey,
  useListUnits,
  useListUserOptions,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  createCustomerRequirement,
  createCustomerRequirementReview,
  customersKeys,
  getCustomerDetail,
  type CustomerRequirement,
} from "@/lib/customers-client";
import { useAllActiveSgqProcesses } from "@/lib/governance-system-client";
import { ClipboardCheck, History, Plus, ShieldCheck } from "lucide-react";

type RequirementFormState = {
  unitId: string;
  processId: string;
  responsibleUserId: string;
  serviceType: string;
  title: string;
  description: string;
  source: string;
};

type ReviewFormState = {
  requirementId: string;
  decision: string;
  capacityAnalysis: string;
  restrictions: string;
  justification: string;
};

const emptyRequirementForm: RequirementFormState = {
  unitId: "",
  processId: "",
  responsibleUserId: "",
  serviceType: "",
  title: "",
  description: "",
  source: "",
};

const emptyReviewForm: ReviewFormState = {
  requirementId: "",
  decision: "accepted",
  capacityAnalysis: "",
  restrictions: "",
  justification: "",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  draft: "Rascunho",
  under_review: "Em análise",
  accepted: "Aceito",
  accepted_with_restrictions: "Aceito com restrições",
  adjustment_required: "Ajuste necessário",
  rejected: "Rejeitado",
  superseded: "Substituído",
};

const DECISION_LABELS: Record<string, string> = {
  accepted: "Aceito",
  accepted_with_restrictions: "Aceito com restrições",
  adjustment_required: "Ajuste necessário",
  rejected: "Rejeitado",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-gray-100 text-gray-500 border-gray-200",
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  under_review: "bg-sky-50 text-sky-700 border-sky-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  accepted_with_restrictions: "bg-amber-50 text-amber-700 border-amber-200",
  adjustment_required: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  superseded: "bg-gray-100 text-gray-500 border-gray-200",
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] || status;
}

function decisionLabel(decision: string) {
  return DECISION_LABELS[decision] || decision;
}

function toOptionalNumber(value: string) {
  return value ? Number(value) : null;
}

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = Number(params.id);
  const { organization, role } = useAuth();
  const orgId = organization?.id;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("requirements");
  const [requirementDialogOpen, setRequirementDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [requirementForm, setRequirementForm] =
    useState<RequirementFormState>(emptyRequirementForm);
  const [reviewForm, setReviewForm] =
    useState<ReviewFormState>(emptyReviewForm);
  const canManageCustomers = role !== "analyst";

  const detailQuery = useQuery({
    queryKey: customersKeys.detail(orgId || 0, customerId),
    enabled: !!orgId && Number.isFinite(customerId),
    queryFn: () => getCustomerDetail(orgId!, customerId),
  });
  const unitsQuery = useListUnits(orgId!, {
    query: {
      queryKey: getListUnitsQueryKey(orgId!),
      enabled: !!orgId,
    },
  });
  const userOptionsQuery = useListUserOptions(
    orgId!,
    {},
    {
      query: {
        queryKey: getListUserOptionsQueryKey(orgId!),
        enabled: !!orgId,
      },
    },
  );
  const processesQuery = useAllActiveSgqProcesses(orgId);

  const customer = detailQuery.data;
  usePageTitle(customer?.legalName || "Cliente SGI");
  usePageSubtitle(
    "Requisitos do cliente, capacidade de atendimento e histórico auditável.",
  );

  const openRequirementDialog = () => {
    setRequirementForm(emptyRequirementForm);
    setRequirementDialogOpen(true);
  };

  const openReviewDialog = (requirement?: CustomerRequirement) => {
    setReviewForm({
      ...emptyReviewForm,
      requirementId: requirement ? String(requirement.id) : "",
    });
    setReviewDialogOpen(true);
  };

  useHeaderActions(
    canManageCustomers ? (
      <div className="flex items-center gap-2">
        <HeaderActionButton
          label="Novo requisito"
          icon={<Plus className="h-4 w-4" />}
          onClick={openRequirementDialog}
        />
        <HeaderActionButton
          label="Registrar análise"
          icon={<ClipboardCheck className="h-4 w-4" />}
          variant="secondary"
          onClick={() => openReviewDialog()}
        />
      </div>
    ) : null,
  );

  const invalidateDetail = async () => {
    if (!orgId) return;
    await queryClient.invalidateQueries({
      queryKey: customersKeys.detail(orgId, customerId),
    });
    await queryClient.invalidateQueries({ queryKey: customersKeys.all });
  };

  const createRequirementMutation = useMutation({
    mutationFn: () =>
      createCustomerRequirement(orgId!, customerId, {
        unitId: toOptionalNumber(requirementForm.unitId),
        processId: toOptionalNumber(requirementForm.processId),
        responsibleUserId: toOptionalNumber(requirementForm.responsibleUserId),
        serviceType: requirementForm.serviceType,
        title: requirementForm.title,
        description: requirementForm.description,
        source: requirementForm.source || null,
      }),
    onSuccess: async () => {
      await invalidateDetail();
      setRequirementDialogOpen(false);
      setRequirementForm(emptyRequirementForm);
      setActiveTab("requirements");
      toast({ title: "Requisito registrado" });
    },
    onError: (error) => {
      toast({
        title: "Falha ao registrar requisito",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    },
  });

  const createReviewMutation = useMutation({
    mutationFn: () =>
      createCustomerRequirementReview(
        orgId!,
        customerId,
        Number(reviewForm.requirementId),
        {
          decision: reviewForm.decision,
          capacityAnalysis: reviewForm.capacityAnalysis,
          restrictions: reviewForm.restrictions || null,
          justification: reviewForm.justification || null,
          decisionDate: new Date().toISOString(),
          attachments: [],
        },
      ),
    onSuccess: async () => {
      await invalidateDetail();
      setReviewDialogOpen(false);
      setReviewForm(emptyReviewForm);
      setActiveTab("reviews");
      toast({ title: "Análise crítica registrada" });
    },
    onError: (error) => {
      toast({
        title: "Falha ao registrar análise",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    },
  });

  const reviewsByRequirementId = useMemo(() => {
    const map = new Map<number, number>();
    for (const review of customer?.reviews || []) {
      map.set(review.requirementId, (map.get(review.requirementId) || 0) + 1);
    }
    return map;
  }, [customer?.reviews]);

  const canCreateRequirement =
    requirementForm.serviceType.trim().length > 0 &&
    requirementForm.title.trim().length > 0 &&
    requirementForm.description.trim().length > 0;
  const canCreateReview =
    reviewForm.requirementId &&
    reviewForm.capacityAnalysis.trim().length > 0 &&
    reviewForm.decision;

  if (detailQuery.isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Carregando cliente SGI...
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Cliente SGI não encontrado.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-4 py-4 lg:px-6">
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="rounded-lg">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge
              variant="outline"
              className={`mt-2 ${STATUS_COLORS[customer.status]}`}
            >
              {statusLabel(customer.status)}
            </Badge>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Requisitos</p>
            <p className="mt-2 text-2xl font-semibold">
              {customer.requirements.length}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Análises críticas</p>
            <p className="mt-2 text-2xl font-semibold">
              {customer.reviews.length}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              Versões no histórico
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {customer.history.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="profile">Cadastro</TabsTrigger>
          <TabsTrigger value="requirements">Requisitos</TabsTrigger>
          <TabsTrigger value="reviews">Análises críticas</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="grid gap-4 rounded-lg border border-border/60 bg-card/70 p-4 md:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Identificação</p>
              <p className="mt-1 text-sm font-medium">
                {customer.legalIdentifier}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Nome usual</p>
              <p className="mt-1 text-sm font-medium">
                {customer.tradeName || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Responsável</p>
              <p className="mt-1 text-sm font-medium">
                {customer.responsibleName || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Contato</p>
              <p className="mt-1 text-sm font-medium">
                {[customer.email, customer.phone].filter(Boolean).join(" · ") ||
                  "—"}
              </p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs text-muted-foreground">Observações SGI</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {customer.notes || "Nenhuma observação registrada."}
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="requirements">
          {customer.requirements.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border/60 bg-card/70 p-10 text-center">
              <ShieldCheck className="h-9 w-9 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  Nenhum requisito de cliente registrado
                </p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Registre o combinado antes de aceitar o fornecimento ou
                  serviço.
                </p>
              </div>
              {canManageCustomers && (
                <Button onClick={openRequirementDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo requisito
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {customer.requirements.map((requirement) => (
                <div
                  key={requirement.id}
                  className="rounded-lg border border-border/60 bg-card/70 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">
                          {requirement.title}
                        </h3>
                        <Badge
                          variant="outline"
                          className={STATUS_COLORS[requirement.status]}
                        >
                          {statusLabel(requirement.status)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {requirement.serviceType}
                        {requirement.unit ? ` · ${requirement.unit.name}` : ""}
                        {requirement.process
                          ? ` · ${requirement.process.name}`
                          : ""}
                      </p>
                    </div>
                    {canManageCustomers && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openReviewDialog(requirement)}
                      >
                        <ClipboardCheck className="mr-2 h-4 w-4" />
                        Analisar
                      </Button>
                    )}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm">
                    {requirement.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Versão {requirement.currentVersion}</span>
                    <span>
                      {reviewsByRequirementId.get(requirement.id) || 0}{" "}
                      análise(s)
                    </span>
                    <span>Origem: {requirement.source || "não informada"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reviews">
          {customer.reviews.length === 0 ? (
            <div className="rounded-lg border border-border/60 bg-card/70 p-8 text-sm text-muted-foreground">
              Nenhuma análise crítica registrada.
            </div>
          ) : (
            <div className="grid gap-3">
              {customer.reviews.map((review) => {
                const requirement = customer.requirements.find(
                  (item) => item.id === review.requirementId,
                );
                return (
                  <div
                    key={review.id}
                    className="rounded-lg border border-border/60 bg-card/70 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={STATUS_COLORS[review.decision]}
                      >
                        {decisionLabel(review.decision)}
                      </Badge>
                      <span className="text-sm font-medium">
                        {requirement?.title || "Requisito"}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm">
                      {review.capacityAnalysis}
                    </p>
                    {review.restrictions && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Restrições: {review.restrictions}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">
                      Responsável:{" "}
                      {review.reviewedByName || review.reviewedById}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          {customer.history.length === 0 ? (
            <div className="rounded-lg border border-border/60 bg-card/70 p-8 text-sm text-muted-foreground">
              Nenhum histórico registrado.
            </div>
          ) : (
            <div className="grid gap-3">
              {customer.history.map((entry) => {
                const requirement = customer.requirements.find(
                  (item) => item.id === entry.requirementId,
                );
                return (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-border/60 bg-card/70 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {requirement?.title || entry.snapshot.title}
                      </span>
                      <Badge variant="outline">v{entry.version}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {entry.changeSummary || "Alteração registrada."}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Status: {statusLabel(entry.snapshot.status)} · Alterado
                      por {entry.changedByName || entry.changedById}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={requirementDialogOpen}
        onOpenChange={(open) => {
          setRequirementDialogOpen(open);
          if (!open) setRequirementForm(emptyRequirementForm);
        }}
        title="Novo requisito do cliente"
        description="Registre o requisito antes da decisão de aceite."
        size="xl"
      >
        <div className="grid gap-4 p-6 md:grid-cols-2">
          <div>
            <Label htmlFor="requirement-service-type">Tipo de serviço *</Label>
            <Input
              id="requirement-service-type"
              value={requirementForm.serviceType}
              onChange={(event) =>
                setRequirementForm((current) => ({
                  ...current,
                  serviceType: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="requirement-title">Título *</Label>
            <Input
              id="requirement-title"
              value={requirementForm.title}
              onChange={(event) =>
                setRequirementForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="requirement-unit">Unidade</Label>
            <Select
              id="requirement-unit"
              value={requirementForm.unitId}
              onChange={(event) =>
                setRequirementForm((current) => ({
                  ...current,
                  unitId: event.target.value,
                }))
              }
            >
              <option value="">Não vinculada</option>
              {(unitsQuery.data || []).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="requirement-process">Processo SGQ</Label>
            <Select
              id="requirement-process"
              value={requirementForm.processId}
              onChange={(event) =>
                setRequirementForm((current) => ({
                  ...current,
                  processId: event.target.value,
                }))
              }
            >
              <option value="">Não vinculado</option>
              {(processesQuery.data || []).map((process) => (
                <option key={process.id} value={process.id}>
                  {process.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="requirement-responsible">Responsável interno</Label>
            <Select
              id="requirement-responsible"
              value={requirementForm.responsibleUserId}
              onChange={(event) =>
                setRequirementForm((current) => ({
                  ...current,
                  responsibleUserId: event.target.value,
                }))
              }
            >
              <option value="">Não definido</option>
              {(userOptionsQuery.data || []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="requirement-source">Origem</Label>
            <Input
              id="requirement-source"
              placeholder="Ex.: contrato, e-mail, reunião"
              value={requirementForm.source}
              onChange={(event) =>
                setRequirementForm((current) => ({
                  ...current,
                  source: event.target.value,
                }))
              }
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="requirement-description">Descrição *</Label>
            <Textarea
              id="requirement-description"
              rows={5}
              value={requirementForm.description}
              onChange={(event) =>
                setRequirementForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setRequirementDialogOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => createRequirementMutation.mutate()}
            disabled={!canCreateRequirement}
            isLoading={createRequirementMutation.isPending}
          >
            Registrar requisito
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={reviewDialogOpen}
        onOpenChange={(open) => {
          setReviewDialogOpen(open);
          if (!open) setReviewForm(emptyReviewForm);
        }}
        title="Análise crítica de capacidade"
        description="Registre a decisão antes do aceite do requisito."
        size="lg"
      >
        <div className="grid gap-4 p-6">
          <div>
            <Label htmlFor="review-requirement">Requisito *</Label>
            <Select
              id="review-requirement"
              value={reviewForm.requirementId}
              onChange={(event) =>
                setReviewForm((current) => ({
                  ...current,
                  requirementId: event.target.value,
                }))
              }
            >
              <option value="">Selecione</option>
              {customer.requirements.map((requirement) => (
                <option key={requirement.id} value={requirement.id}>
                  {requirement.title}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="review-decision">Decisão *</Label>
            <Select
              id="review-decision"
              value={reviewForm.decision}
              onChange={(event) =>
                setReviewForm((current) => ({
                  ...current,
                  decision: event.target.value,
                }))
              }
            >
              <option value="accepted">Aceito</option>
              <option value="accepted_with_restrictions">
                Aceito com restrições
              </option>
              <option value="adjustment_required">Ajuste necessário</option>
              <option value="rejected">Rejeitado</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="review-capacity">Análise de capacidade *</Label>
            <Textarea
              id="review-capacity"
              rows={4}
              value={reviewForm.capacityAnalysis}
              onChange={(event) =>
                setReviewForm((current) => ({
                  ...current,
                  capacityAnalysis: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="review-restrictions">Restrições</Label>
            <Textarea
              id="review-restrictions"
              rows={3}
              value={reviewForm.restrictions}
              onChange={(event) =>
                setReviewForm((current) => ({
                  ...current,
                  restrictions: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="review-justification">Justificativa</Label>
            <Textarea
              id="review-justification"
              rows={3}
              value={reviewForm.justification}
              onChange={(event) =>
                setReviewForm((current) => ({
                  ...current,
                  justification: event.target.value,
                }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setReviewDialogOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => createReviewMutation.mutate()}
            disabled={!canCreateReview}
            isLoading={createReviewMutation.isPending}
          >
            Registrar análise
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
