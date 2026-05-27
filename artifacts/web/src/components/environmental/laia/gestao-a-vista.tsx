import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Clock,
  Flame,
  Gauge,
  Inbox,
  Scale,
  ShieldCheck,
  Sprout,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useLaiaAssessments,
  useLaiaDashboard,
  useLaiaRevisions,
  type LaiaAssessmentListItem,
} from "@/lib/environmental-laia-client";

interface GestaoAVistaProps {
  orgId?: number;
}

const COLORS = {
  critical: "#a32d2d",
  moderate: "#c98e1a",
  negligible: "#1d9e75",
  significant: "#a32d2d",
  notSignificant: "#1d9e75",
  neutral: "#6b7280",
  blue: "#185fa5",
  amber: "#854f0b",
};

const ODS_NAMES: Record<number, string> = {
  1: "Erradicação da Pobreza",
  2: "Fome Zero",
  3: "Saúde e Bem-Estar",
  4: "Educação de Qualidade",
  5: "Igualdade de Gênero",
  6: "Água Limpa e Saneamento",
  7: "Energia Limpa e Acessível",
  8: "Trabalho Decente",
  9: "Indústria e Inovação",
  10: "Redução das Desigualdades",
  11: "Cidades Sustentáveis",
  12: "Consumo Responsável",
  13: "Ação Climática",
  14: "Vida na Água",
  15: "Vida Terrestre",
  16: "Paz e Justiça",
  17: "Parcerias e Meios",
};

function StatusPill({
  level,
  children,
}: {
  level: "critical" | "moderate" | "ok";
  children: React.ReactNode;
}) {
  const map = {
    critical: "bg-red-50 text-red-700 border-red-200",
    moderate: "bg-amber-50 text-amber-800 border-amber-200",
    ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${map[level]}`}
    >
      {children}
    </span>
  );
}

function SemaforoCard({
  item,
}: {
  item: {
    level: "critical" | "moderate" | "ok";
    title: string;
    subtitle: string;
    score: number | null;
    action: string;
    actionLevel: "critical" | "moderate" | "ok";
  };
}) {
  const borderColor = {
    critical: "border-l-red-500",
    moderate: "border-l-amber-500",
    ok: "border-l-emerald-500",
  } as const;
  return (
    <div
      className={`rounded-lg border border-l-4 ${borderColor[item.level]} bg-card p-3 shadow-sm`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {item.subtitle}
          </p>
          <p className="line-clamp-2 text-sm font-semibold leading-snug">
            {item.title}
          </p>
        </div>
        <StatusPill level={item.level}>
          {item.level === "critical"
            ? "CRÍTICO"
            : item.level === "moderate"
              ? "MODERADO"
              : "CONTROLADO"}
        </StatusPill>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">
          Score: {item.score ?? "—"}
        </span>
        <StatusPill level={item.actionLevel}>{item.action}</StatusPill>
      </div>
    </div>
  );
}

function semaforoFromAssessment(
  assessment: LaiaAssessmentListItem,
): {
  level: "critical" | "moderate" | "ok";
  title: string;
  subtitle: string;
  score: number | null;
  action: string;
  actionLevel: "critical" | "moderate" | "ok";
} {
  const level: "critical" | "moderate" | "ok" =
    assessment.category === "critico"
      ? "critical"
      : assessment.category === "moderado"
        ? "moderate"
        : "ok";

  let action = "Controle ativo";
  let actionLevel: "critical" | "moderate" | "ok" = "ok";
  const controlTypes = assessment.controlTypes ?? [];
  if (controlTypes.includes("NC")) {
    action = "Sem controle — NC";
    actionLevel = "critical";
  } else if (assessment.hasLegalRequirements) {
    action = "Req. Legal aplicável";
    actionLevel = "moderate";
  } else if (assessment.operationalSituation === "emergencia") {
    action = "Cenário de emergência";
    actionLevel = "critical";
  } else if (!assessment.isVigente) {
    action = "Pendente vigência";
    actionLevel = "moderate";
  }

  return {
    level,
    title: assessment.environmentalAspect,
    subtitle: `${assessment.aspectCode} · ${assessment.sectorName ?? assessment.unitName ?? "Sem setor"}`,
    score: assessment.totalScore,
    action,
    actionLevel,
  };
}

export function LaiaGestaoAVista({ orgId }: GestaoAVistaProps) {
  const { data: dashboard } = useLaiaDashboard(orgId);
  const { data: assessments = [] } = useLaiaAssessments(orgId);
  const { data: revisions = [] } = useLaiaRevisions(orgId);

  const semaforoItems = useMemo(() => {
    const critical = assessments
      .filter(
        (a) =>
          a.category === "critico" ||
          a.significance === "significant" ||
          a.operationalSituation === "emergencia",
      )
      .slice(0, 6);
    return critical.map(semaforoFromAssessment);
  }, [assessments]);

  const significanceData = useMemo(() => {
    if (!dashboard) return [];
    return [
      {
        name: "Crítico",
        value: dashboard.criticalAssessments,
        color: COLORS.critical,
      },
      {
        name: "Moderado",
        value: dashboard.moderateAssessments,
        color: COLORS.moderate,
      },
      {
        name: "Desprezível",
        value: dashboard.negligibleAssessments,
        color: COLORS.negligible,
      },
    ].filter((entry) => entry.value > 0);
  }, [dashboard]);

  const opSituationData = useMemo(() => {
    if (!dashboard?.byOperationalSituation) return [];
    const map: Record<string, { name: string; color: string }> = {
      normal: { name: "Normal", color: COLORS.blue },
      anormal: { name: "Anormal", color: COLORS.amber },
      emergencia: { name: "Emergência", color: COLORS.critical },
      nao_informado: { name: "Não informado", color: COLORS.neutral },
    };
    return Object.entries(dashboard.byOperationalSituation)
      .map(([key, value]) => ({
        name: map[key]?.name ?? key,
        total: value,
        color: map[key]?.color ?? COLORS.neutral,
      }))
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [dashboard]);

  const odsData = useMemo(() => {
    if (!dashboard?.byOds) return [];
    return Object.entries(dashboard.byOds)
      .map(([key, value]) => ({
        ods: Number(key),
        name: `ODS ${key} · ${ODS_NAMES[Number(key)] ?? ""}`,
        total: value.total,
        significant: value.significant,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [dashboard]);

  const recentRevisions = useMemo(() => revisions.slice(0, 6), [revisions]);

  if (!orgId) return null;

  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight">
          Gestão à Vista
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Aspectos críticos em aberto, distribuição de significância e
          movimentações recentes. Atualizado em tempo real.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        <Card className="border-red-200/70">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Flame className="h-4 w-4 text-red-500" /> Críticos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tracking-tight text-red-700">
              {dashboard?.criticalAssessments ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200/70">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Moderados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tracking-tight text-amber-700">
              {dashboard?.moderateAssessments ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200/70">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sprout className="h-4 w-4 text-emerald-500" /> Não Sig.
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tracking-tight text-emerald-700">
              {dashboard?.negligibleAssessments ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Scale className="h-4 w-4" /> Com Req. Legal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tracking-tight">
              {dashboard?.withLegalRequirement ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Inbox className="h-4 w-4" /> Total LAIA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tracking-tight">
              {dashboard?.totalAssessments ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4" /> Semáforo — Aspectos críticos em aberto
            </CardTitle>
          </CardHeader>
          <CardContent>
            {semaforoItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum aspecto crítico ou significativo no momento.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {semaforoItems.map((item, idx) => (
                  <SemaforoCard key={idx} item={item} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por significância</CardTitle>
          </CardHeader>
          <CardContent>
            {significanceData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem avaliações classificadas.
              </p>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={significanceData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                    >
                      {significanceData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        value,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-2 space-y-1 text-[12px]">
              {significanceData.map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: entry.color }}
                    />
                    {entry.name}
                  </span>
                  <span className="text-muted-foreground">{entry.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Por situação operacional
            </CardTitle>
          </CardHeader>
          <CardContent>
            {opSituationData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={opSituationData} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={88}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip cursor={{ fill: "transparent" }} />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                      {opSituationData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4" /> Alinhamento com ODS
            </CardTitle>
          </CardHeader>
          <CardContent>
            {odsData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Marque ODS nas avaliações para visualizar aqui.
              </p>
            ) : (
              <ul className="space-y-2 text-[12px]">
                {odsData.map((entry) => (
                  <li
                    key={entry.ods}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="line-clamp-1">{entry.name}</span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">
                        {entry.significant} sig.
                      </Badge>
                      <span>{entry.total}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" /> Últimas movimentações
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentRevisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem revisões registradas.
              </p>
            ) : (
              <ol className="space-y-3">
                {recentRevisions.map((rev) => (
                  <li key={rev.id} className="flex gap-3">
                    <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    <div className="min-w-0 space-y-0.5">
                      <p className="line-clamp-2 text-[12px] font-medium leading-snug">
                        Rev. {rev.revisionNumber} ·{" "}
                        {rev.title ?? "Alteração de avaliação"}
                      </p>
                      {rev.createdAt && (
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(rev.createdAt).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {dashboard &&
        ((dashboard.pendingVigence ?? 0) > 0 ||
          (dashboard.trashCount ?? 0) > 0 ||
          dashboard.compliance) && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200/70 bg-amber-50/40 px-3 py-2 text-[12px] text-amber-900">
            {(dashboard.pendingVigence ?? 0) > 0 && (
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> {dashboard.pendingVigence}{" "}
                avaliações aguardando vigência
              </span>
            )}
            {(dashboard.trashCount ?? 0) > 0 && (
              <span className="flex items-center gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> {dashboard.trashCount} na
                lixeira (purga em até 1h)
              </span>
            )}
            {dashboard.compliance && (
              <span className="ml-auto flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Conformidade 6.1:{" "}
                <strong>{dashboard.compliance.score}%</strong>
              </span>
            )}
          </div>
        )}
    </section>
  );
}
