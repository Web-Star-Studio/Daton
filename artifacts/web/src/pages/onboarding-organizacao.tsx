import React, { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, CircleDashed, LogOut, X } from "lucide-react";
import { useCompleteOrganizationOnboarding } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const authBg = "/images/bg-auth.png";

const sectorOptions = [
  ["manufacturing", "Indústria de transformação"],
  ["agro", "Agro"],
  ["food_beverage", "Alimentos e bebidas"],
  ["mining", "Mineração"],
  ["oil_gas", "Óleo e gás"],
  ["energy", "Energia"],
  ["chemical", "Químico"],
  ["pulp_paper", "Papel e celulose"],
  ["steel", "Siderurgia"],
  ["logistics", "Logística"],
  ["financial", "Financeiro"],
  ["telecom", "Telecom"],
  ["public", "Setor público"],
  ["pharma_cosmetics", "Farma e cosméticos"],
  ["automotive", "Automotivo"],
  ["technology", "Tecnologia"],
  ["consumer_goods", "Bens de consumo"],
  ["utilities", "Utilities"],
  ["healthcare", "Saúde"],
  ["education", "Educação"],
  ["retail", "Varejo"],
  ["construction", "Construção"],
  ["services", "Serviços"],
  ["other", "Outro"],
] as const;

const sizeOptions = [
  ["micro", "Micro"],
  ["small", "Pequena"],
  ["medium", "Média"],
  ["large", "Grande"],
  ["xlarge", "Muito grande"],
  ["enterprise", "Enterprise"],
] as const;

const goalOptions = [
  ["emissions_reduction", "Redução de emissões"],
  ["environmental_compliance", "Conformidade ambiental"],
  ["health_safety", "Saúde e segurança"],
  ["energy_efficiency", "Eficiência energética"],
  ["water_management", "Gestão de água"],
  ["waste_reduction", "Redução de resíduos"],
  ["sustainability", "Sustentabilidade"],
  ["quality", "Qualidade"],
  ["compliance", "Compliance"],
  ["performance", "Performance"],
  ["innovation", "Inovação"],
  ["cost_reduction", "Redução de custos"],
] as const;

const maturityOptions = [
  ["beginner", "Inicial"],
  ["intermediate", "Intermediário"],
  ["advanced", "Avançado"],
] as const;

const onboardingSchema = z
  .object({
    sector: z.string().min(1, "Selecione o setor principal"),
    customSector: z.string().max(120, "Use até 120 caracteres").optional(),
    size: z.string().min(1, "Selecione o porte da empresa"),
    goals: z.array(z.string()).min(1, "Selecione pelo menos um objetivo"),
    maturityLevel: z.string().min(1, "Selecione o nível de maturidade"),
    currentChallenges: z
      .array(z.string().trim().min(1).max(120, "Cada desafio deve ter até 120 caracteres"))
      .max(12, "Adicione no máximo 12 desafios"),
    openingDate: z.string().optional(),
    taxRegime: z.string().max(120, "Use até 120 caracteres").optional(),
    primaryCnae: z.string().max(120, "Use até 120 caracteres").optional(),
    stateRegistration: z.string().max(120, "Use até 120 caracteres").optional(),
    municipalRegistration: z.string().max(120, "Use até 120 caracteres").optional(),
  })
  .superRefine((value, ctx) => {
    if (value.sector === "other" && !value.customSector?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customSector"],
        message: "Informe o setor",
      });
    }
  });

type OnboardingFormData = z.infer<typeof onboardingSchema>;

const stepDefinitions = [
  {
    key: "company_profile",
    title: "Perfil da empresa",
    description: "Defina o contexto principal da organização para calibrar o produto desde o primeiro acesso.",
  },
  {
    key: "goals_maturity",
    title: "Objetivos e maturidade",
    description: "Entenda o que precisa ser priorizado agora e em que nível de estrutura a organização já opera.",
  },
  {
    key: "fiscal_registration",
    title: "Dados fiscais e cadastrais",
    description: "Complete a base cadastral que sustenta a organização e seus próximos módulos.",
  },
  {
    key: "review",
    title: "Revisão final",
    description: "Confira os dados antes de liberar o acesso completo ao ambiente.",
  },
] as const;

function labelFor(value: string | null | undefined, options: readonly (readonly [string, string])[]) {
  if (!value) return "Não informado";
  return options.find(([optionValue]) => optionValue === value)?.[1] ?? value;
}

export default function OnboardingOrganizationPage() {
  const [, navigate] = useLocation();
  const { organization, role, logout, refreshAuth } = useAuth();
  const completeOnboardingMutation = useCompleteOrganizationOnboarding();
  const [stepIndex, setStepIndex] = useState(0);
  const [challengeInput, setChallengeInput] = useState("");

  const form = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      sector: organization?.onboardingData?.companyProfile?.sector ?? "",
      customSector: organization?.onboardingData?.companyProfile?.customSector ?? "",
      size: organization?.onboardingData?.companyProfile?.size ?? "",
      goals: organization?.onboardingData?.companyProfile?.goals ?? [],
      maturityLevel: organization?.onboardingData?.companyProfile?.maturityLevel ?? "",
      currentChallenges: organization?.onboardingData?.companyProfile?.currentChallenges ?? [],
      openingDate: organization?.openingDate ?? "",
      taxRegime: organization?.taxRegime ?? "",
      primaryCnae: organization?.primaryCnae ?? "",
      stateRegistration: organization?.stateRegistration ?? organization?.inscricaoEstadual ?? "",
      municipalRegistration: organization?.municipalRegistration ?? "",
    },
  });

  const values = form.watch();
  const currentChallenges = values.currentChallenges ?? [];
  const canEdit = role === "org_admin";

  const reviewGroups = useMemo(
    () => [
      {
        title: "Base da organização",
        items: [
          ["Razão social", organization?.legalName ?? organization?.name ?? "Não informado"],
          ["Nome fantasia", organization?.tradeName ?? organization?.nomeFantasia ?? "Não informado"],
          ["CNPJ", organization?.legalIdentifier ?? organization?.cnpj ?? "Não informado"],
        ],
      },
      {
        title: "Perfil da empresa",
        items: [
          [
            "Setor principal",
            values.sector === "other"
              ? values.customSector?.trim() || "Não informado"
              : labelFor(values.sector, sectorOptions),
          ],
          ["Porte", labelFor(values.size, sizeOptions)],
          ["Objetivos", values.goals.length > 0 ? values.goals.map((goal) => labelFor(goal, goalOptions)).join(", ") : "Não informado"],
          ["Maturidade", labelFor(values.maturityLevel, maturityOptions)],
          ["Desafios atuais", currentChallenges.length > 0 ? currentChallenges.join(", ") : "Não informado"],
        ],
      },
      {
        title: "Dados fiscais e cadastrais",
        items: [
          ["Data de abertura", values.openingDate || "Não informado"],
          ["Regime tributário", values.taxRegime?.trim() || "Não informado"],
          ["CNAE principal", values.primaryCnae?.trim() || "Não informado"],
          ["Inscrição estadual", values.stateRegistration?.trim() || "Não informado"],
          ["Inscrição municipal", values.municipalRegistration?.trim() || "Não informado"],
        ],
      },
    ],
    [currentChallenges, organization, values],
  );

  const addChallenge = () => {
    const nextValue = challengeInput.trim();

    if (!nextValue) return;
    if (nextValue.length > 120) {
      form.setError("currentChallenges", { type: "manual", message: "Cada desafio deve ter até 120 caracteres" });
      return;
    }
    if (currentChallenges.length >= 12) {
      form.setError("currentChallenges", { type: "manual", message: "Adicione no máximo 12 desafios" });
      return;
    }

    form.clearErrors("currentChallenges");
    form.setValue("currentChallenges", [...currentChallenges, nextValue], { shouldDirty: true, shouldValidate: true });
    setChallengeInput("");
  };

  const removeChallenge = (challengeToRemove: string) => {
    form.setValue(
      "currentChallenges",
      currentChallenges.filter((challenge) => challenge !== challengeToRemove),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const toggleGoal = (goal: string, checked: boolean) => {
    const nextGoals = checked ? [...values.goals, goal] : values.goals.filter((item) => item !== goal);
    form.setValue("goals", nextGoals, { shouldDirty: true, shouldValidate: true });
  };

  const goNext = async () => {
    const fieldsByStep: Record<number, Array<keyof OnboardingFormData>> = {
      0: ["sector", "customSector", "size"],
      1: ["goals", "maturityLevel", "currentChallenges"],
      2: ["openingDate", "taxRegime", "primaryCnae", "stateRegistration", "municipalRegistration"],
    };

    const fields = fieldsByStep[stepIndex];
    if (!fields) {
      setStepIndex((current) => Math.min(current + 1, stepDefinitions.length - 1));
      return;
    }

    const isValid = await form.trigger(fields);
    if (isValid) {
      setStepIndex((current) => Math.min(current + 1, stepDefinitions.length - 1));
    }
  };

  const handleFormSubmit = form.handleSubmit(async (data) => {
    if (!organization?.id) return;

    await completeOnboardingMutation.mutateAsync({
      orgId: organization.id,
      data: {
        companyProfile: {
          sector: data.sector as never,
          customSector: data.sector === "other" ? data.customSector?.trim() || null : null,
          size: data.size as never,
          goals: data.goals as never,
          maturityLevel: data.maturityLevel as never,
          currentChallenges: data.currentChallenges,
        },
        fiscalRegistration: {
          openingDate: data.openingDate?.trim() || null,
          taxRegime: data.taxRegime?.trim() || null,
          primaryCnae: data.primaryCnae?.trim() || null,
          stateRegistration: data.stateRegistration?.trim() || null,
          municipalRegistration: data.municipalRegistration?.trim() || null,
        },
      },
    });

    await refreshAuth();
    navigate("/organizacao");
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (stepIndex !== stepDefinitions.length - 1) return;
    handleFormSubmit(e);
  };

  return (
    <div className="relative h-screen overflow-hidden bg-slate-950">
      <img src={authBg} alt="" className="absolute inset-0 h-full w-full object-cover scale-[1.03]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_34%),linear-gradient(135deg,rgba(7,12,24,0.82),rgba(6,12,22,0.56))]" />
      <div className="absolute inset-0 backdrop-blur-[7px]" />

      <div className="relative z-10 flex h-screen items-center justify-center px-6 py-8 lg:px-10">
        <div className="w-full max-w-4xl">
          <section className="flex max-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-[30px] border border-border/60 bg-card shadow-[0_28px_80px_rgba(0,0,0,0.28)] animate-[modalIn_250ms_cubic-bezier(0.16,1,0.3,1)]">
            <div className="border-b border-border/60 px-6 py-5 sm:px-8">
              <div className="mb-5">
                <div className="grid grid-cols-4 gap-2">
                  {stepDefinitions.map((step, index) => {
                    const isActive = index <= stepIndex;

                    return (
                      <div
                        key={step.key}
                        className={cn(
                          "h-1.5 rounded-full transition-colors",
                          isActive ? "bg-[#007AFF]" : "bg-secondary",
                        )}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                    {stepDefinitions[stepIndex].title}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {stepDefinitions[stepIndex].description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sair
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-6 py-6 sm:px-8 sm:py-7">
              {!canEdit ? (
                <div className="flex min-h-[440px] flex-col items-center justify-center rounded-[24px] border border-dashed border-border bg-secondary/30 px-6 text-center">
                  <CircleDashed className="h-10 w-10 text-muted-foreground/60" />
                  <h3 className="mt-5 text-xl font-semibold text-foreground">Aguardando conclusão do onboarding</h3>
                  <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
                    Assim que um administrador concluir este formulário, o acesso às rotas internas e aos módulos da plataforma será liberado.
                  </p>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="space-y-6">
                  {stepIndex === 0 && (
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div className="lg:col-span-2">
                        <Label>Setor principal</Label>
                        <Select className="mt-2" value={values.sector} onChange={(event) => form.setValue("sector", event.target.value, { shouldValidate: true })}>
                          <option value="">Selecione</option>
                          {sectorOptions.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                        {form.formState.errors.sector && (
                          <p className="mt-1.5 text-xs text-destructive">{form.formState.errors.sector.message}</p>
                        )}
                      </div>

                      {values.sector === "other" && (
                        <div className="lg:col-span-2">
                          <Label>Qual é o setor?</Label>
                          <Input className="mt-2" {...form.register("customSector")} placeholder="Descreva o setor principal" />
                          {form.formState.errors.customSector && (
                            <p className="mt-1.5 text-xs text-destructive">{form.formState.errors.customSector.message}</p>
                          )}
                        </div>
                      )}

                      <div className="lg:col-span-2">
                        <Label>Porte da empresa</Label>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {sizeOptions.map(([value, label]) => {
                            const checked = values.size === value;

                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() => form.setValue("size", value, { shouldValidate: true, shouldDirty: true })}
                                className={cn(
                                  "cursor-pointer rounded-2xl border px-4 py-4 text-left transition-colors",
                                  checked
                                    ? "border-[#007AFF] bg-[#007AFF] text-white"
                                    : "border-border bg-background text-foreground hover:border-foreground/15",
                                )}
                              >
                                <p className="text-sm font-medium">{label}</p>
                              </button>
                            );
                          })}
                        </div>
                        {form.formState.errors.size && (
                          <p className="mt-1.5 text-xs text-destructive">{form.formState.errors.size.message}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {stepIndex === 1 && (
                    <div className="space-y-6">
                      <div>
                        <Label>Objetivos de negócio</Label>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Selecione pelo menos uma frente que precisa ganhar estrutura ou tração no curto prazo.
                        </p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {goalOptions.map(([value, label]) => {
                            const checked = values.goals.includes(value);

                            return (
                              <label
                                key={value}
                                className={cn(
                                  "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4 transition-colors",
                                  checked ? "border-foreground/20 bg-secondary" : "border-border bg-background hover:border-foreground/15",
                                )}
                              >
                                <Checkbox checked={checked} onCheckedChange={(next) => toggleGoal(value, next === true)} className="mt-0.5" />
                                <span className="text-sm text-foreground">{label}</span>
                              </label>
                            );
                          })}
                        </div>
                        {form.formState.errors.goals && (
                          <p className="mt-1.5 text-xs text-destructive">{form.formState.errors.goals.message}</p>
                        )}
                      </div>

                      <div>
                        <Label>Nível de maturidade</Label>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          {maturityOptions.map(([value, label]) => {
                            const checked = values.maturityLevel === value;

                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() => form.setValue("maturityLevel", value, { shouldValidate: true, shouldDirty: true })}
                                className={cn(
                                  "cursor-pointer rounded-2xl border px-4 py-4 text-left transition-colors",
                                  checked
                                    ? "border-[#007AFF] bg-[#007AFF] text-white"
                                    : "border-border bg-background text-foreground hover:border-foreground/15",
                                )}
                              >
                                <p className="text-sm font-medium">{label}</p>
                              </button>
                            );
                          })}
                        </div>
                        {form.formState.errors.maturityLevel && (
                          <p className="mt-1.5 text-xs text-destructive">{form.formState.errors.maturityLevel.message}</p>
                        )}
                      </div>

                      <div>
                        <Label>Desafios atuais</Label>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Opcional. Liste até 12 desafios para orientar a configuração inicial do produto.
                        </p>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                          <Input
                            value={challengeInput}
                            onChange={(event) => setChallengeInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addChallenge();
                              }
                            }}
                            placeholder="Ex.: consolidar requisitos legais entre unidades"
                          />
                          <Button type="button" variant="secondary" onClick={addChallenge}>
                            Adicionar
                          </Button>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{currentChallenges.length}/12 itens</p>
                        {form.formState.errors.currentChallenges && (
                          <p className="mt-1.5 text-xs text-destructive">{form.formState.errors.currentChallenges.message}</p>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2">
                          {currentChallenges.map((challenge) => (
                            <span
                              key={challenge}
                              className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/55 px-3 py-1.5 text-xs text-foreground"
                            >
                              {challenge}
                              <button type="button" onClick={() => removeChallenge(challenge)} className="text-muted-foreground hover:text-foreground">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {stepIndex === 2 && (
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div>
                        <Label>Data de abertura</Label>
                        <Input type="date" className="mt-2" {...form.register("openingDate")} />
                      </div>
                      <div>
                        <Label>Regime tributário</Label>
                        <Input className="mt-2" {...form.register("taxRegime")} placeholder="Ex.: Lucro Real" />
                      </div>
                      <div>
                        <Label>CNAE principal</Label>
                        <Input className="mt-2" {...form.register("primaryCnae")} placeholder="Ex.: 6201-5/01" />
                      </div>
                      <div>
                        <Label>Inscrição estadual</Label>
                        <Input className="mt-2" {...form.register("stateRegistration")} />
                      </div>
                      <div className="lg:col-span-2">
                        <Label>Inscrição municipal</Label>
                        <Input className="mt-2" {...form.register("municipalRegistration")} />
                      </div>
                    </div>
                  )}

                  {stepIndex === 3 && (
                    <div className="space-y-10">
                      {reviewGroups.map((group) => (
                        <div key={group.title}>
                          <h3 className="mb-5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {group.title}
                          </h3>
                          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                            {group.items.map(([label, value]) => (
                              <div key={label}>
                                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                  {label}
                                </p>
                                <p className="text-[14px] leading-6 text-foreground">{value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-3 border-t border-border/50 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-muted-foreground">
                      {stepIndex === stepDefinitions.length - 1
                        ? "Ao confirmar, o acesso às rotas internas será liberado para a organização."
                        : "Você pode voltar e revisar qualquer etapa antes da confirmação final."}
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
                        disabled={stepIndex === 0}
                      >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar
                      </Button>
                      {stepIndex < stepDefinitions.length - 1 ? (
                        <Button key="next-step" type="button" onClick={goNext}>
                          Próximo
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      ) : (
                        <Button key="submit-onboarding" type="submit" isLoading={completeOnboardingMutation.isPending}>
                          Confirmar e liberar acesso
                        </Button>
                      )}
                    </div>
                  </div>
                </form>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
