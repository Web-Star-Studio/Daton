import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  Globe2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  useLaiaComplianceItems,
  useLaiaDashboard,
  useLaiaRevisions,
  useUpdateLaiaComplianceItem,
  type LaiaComplianceClause,
  type LaiaComplianceItem,
  type LaiaComplianceStatus,
} from "@/lib/environmental-laia-client";

const STATUS_OPTIONS: Array<{ value: LaiaComplianceStatus; label: string }> = [
  { value: "atendido", label: "Atendido" },
  { value: "parcial", label: "Parcial" },
  { value: "nao_atendido", label: "Não atendido" },
];

const STATUS_BADGE: Record<LaiaComplianceStatus, string> = {
  atendido: "border-emerald-200 bg-emerald-50 text-emerald-700",
  parcial: "border-amber-200 bg-amber-50 text-amber-700",
  nao_atendido: "border-red-200 bg-red-50 text-red-700",
};

const STATUS_LABEL: Record<LaiaComplianceStatus, string> = {
  atendido: "Atendido",
  parcial: "Parcial",
  nao_atendido: "Não atendido",
};

const ODS_BADGES: Array<{ ods: number; label: string; color: string }> = [
  { ods: 6, label: "Água Limpa", color: "bg-cyan-100 text-cyan-800" },
  { ods: 7, label: "Energia Limpa", color: "bg-yellow-100 text-yellow-800" },
  { ods: 11, label: "Cidades Sustentáveis", color: "bg-orange-100 text-orange-800" },
  { ods: 12, label: "Consumo Responsável", color: "bg-amber-100 text-amber-800" },
  { ods: 13, label: "Ação Climática", color: "bg-emerald-100 text-emerald-800" },
  { ods: 15, label: "Vida Terrestre", color: "bg-green-100 text-green-800" },
];

function ComplianceItemRow({
  item,
  onSave,
  isSaving,
}: {
  item: LaiaComplianceItem;
  onSave: (params: {
    clause: LaiaComplianceClause;
    status: LaiaComplianceStatus;
    evidence: string | null;
    notes: string | null;
  }) => Promise<void>;
  isSaving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<LaiaComplianceStatus>(item.status);
  const [evidence, setEvidence] = useState(item.evidence ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");

  const dirty =
    status !== item.status ||
    (evidence || "") !== (item.evidence ?? "") ||
    (notes || "") !== (item.notes ?? "");

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((s) => !s)}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        <Badge variant="outline" className="shrink-0 font-mono">
          {item.clause}
        </Badge>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium leading-snug">{item.title}</p>
            <Badge
              variant="outline"
              className={`shrink-0 ${STATUS_BADGE[item.status]}`}
            >
              {STATUS_LABEL[item.status]}
            </Badge>
          </div>
          {item.description && (
            <p className="text-[12px] text-muted-foreground">
              {item.description}
            </p>
          )}
          {item.evidence && (
            <p className="text-[11px] text-muted-foreground">
              <strong>Evidência:</strong> {item.evidence}
            </p>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="space-y-3 border-t px-3 pb-3 pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`status-${item.clause}`}>Status</Label>
              <Select
                id={`status-${item.clause}`}
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as LaiaComplianceStatus)
                }
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={`evidence-${item.clause}`}>
                Evidência / referência
              </Label>
              <Textarea
                id={`evidence-${item.clause}`}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Ex: FPLAN-002 Rev.11 · 30/06/2025"
                rows={2}
              />
            </div>
          </div>
          <div>
            <Label htmlFor={`notes-${item.clause}`}>Notas internas</Label>
            <Textarea
              id={`notes-${item.clause}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!dirty || isSaving}
              onClick={async () => {
                await onSave({
                  clause: item.clause,
                  status,
                  evidence: evidence.trim() || null,
                  notes: notes.trim() || null,
                });
              }}
            >
              {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LaiaConformidade({ orgId }: { orgId?: number }) {
  const { data: items = [], isLoading } = useLaiaComplianceItems(orgId);
  const { data: dashboard } = useLaiaDashboard(orgId);
  const updateMutation = useUpdateLaiaComplianceItem(orgId);

  const score = dashboard?.compliance?.score ?? 0;
  const byStatus = dashboard?.compliance?.itemsByStatus ?? {
    atendido: 0,
    parcial: 0,
    nao_atendido: 0,
  };

  if (!orgId) return null;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-emerald-100 px-3 py-2 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  ISO 14001
                </p>
                <p className="text-[10px] text-emerald-700">:2015</p>
              </div>
              <div>
                <CardTitle className="text-lg">
                  Conformidade — Cláusula 6 (Planejamento)
                </CardTitle>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Avaliação de atendimento aos requisitos 6.1.1, 6.1.2, 6.1.3,
                  6.1.4 e 6.2.
                </p>
              </div>
            </div>
            <div className="text-right">
              <p
                className={`text-4xl font-bold ${
                  score >= 80
                    ? "text-emerald-700"
                    : score >= 60
                      ? "text-amber-700"
                      : "text-red-700"
                }`}
              >
                {score}%
              </p>
              <p className="text-[12px] text-muted-foreground">
                Conformidade geral
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-[12px] sm:grid-cols-3">
            <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
              <CheckCircle2 className="mb-1 inline h-3.5 w-3.5" /> Atendidos:{" "}
              <strong>{byStatus.atendido}</strong>
            </div>
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
              <ShieldAlert className="mb-1 inline h-3.5 w-3.5" /> Parciais:{" "}
              <strong>{byStatus.parcial}</strong>
            </div>
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              <ClipboardList className="mb-1 inline h-3.5 w-3.5" /> Não
              atendidos: <strong>{byStatus.nao_atendido}</strong>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {isLoading && (
          <p className="text-sm text-muted-foreground">
            Carregando itens de conformidade…
          </p>
        )}
        {items.map((item) => (
          <ComplianceItemRow
            key={item.clause}
            item={item}
            isSaving={updateMutation.isPending}
            onSave={async (payload) => {
              try {
                await updateMutation.mutateAsync(payload);
                toast({ title: "Conformidade atualizada" });
              } catch (error) {
                toast({
                  title: "Falha ao salvar",
                  description:
                    error instanceof Error ? error.message : "Tente novamente.",
                  variant: "destructive",
                });
              }
            }}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe2 className="h-4 w-4 text-emerald-600" /> Alinhamento com ODS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-[13px] text-muted-foreground">
            Aspectos significativos vinculados a Objetivos de Desenvolvimento
            Sustentável (ONU 2030).
          </p>
          <div className="flex flex-wrap gap-2">
            {ODS_BADGES.map((entry) => {
              const aggregated = dashboard?.byOds?.[String(entry.ods)];
              return (
                <div
                  key={entry.ods}
                  className={`rounded-md px-3 py-2 text-[12px] ${entry.color}`}
                >
                  <div className="font-semibold">ODS {entry.ods}</div>
                  <div>{entry.label}</div>
                  <div className="mt-1 text-[10px] opacity-80">
                    {aggregated
                      ? `${aggregated.significant} sig. / ${aggregated.total} total`
                      : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-emerald-600" /> Documentos de
            referência
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <DocCard
              code="FPLAN-002"
              label="LAIA"
              detail={`${dashboard?.totalAssessments ?? 0} aspectos`}
              tone="emerald"
            />
            <DocCard
              code="FPLAN-003"
              label="LIRA — Requisitos Legais"
              detail={`${dashboard?.withLegalRequirement ?? 0} com req. legal`}
              tone="blue"
            />
            <DocCard
              code="FPLAN-006"
              label="Objetivos Ambientais"
              detail="Ligados a aspectos significativos"
              tone="amber"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DocCard({
  code,
  label,
  detail,
  tone,
}: {
  code: string;
  label: string;
  detail: string;
  tone: "emerald" | "blue" | "amber";
}) {
  const toneClass = {
    emerald: "border-emerald-200 bg-emerald-50/40",
    blue: "border-blue-200 bg-blue-50/40",
    amber: "border-amber-200 bg-amber-50/40",
  }[tone];
  const Icon = {
    emerald: ShieldCheck,
    blue: ClipboardList,
    amber: Target,
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-[11px] text-muted-foreground">
          {code}
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold">{label}</p>
      <p className="text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

export function LaiaEvidencias({ orgId }: { orgId?: number }) {
  const { data: dashboard } = useLaiaDashboard(orgId);
  const { data: items = [] } = useLaiaComplianceItems(orgId);
  const { data: revisions = [] } = useLaiaRevisions(orgId);

  const checklist = useMemo(() => {
    return items.map((it) => ({
      clause: it.clause,
      title: it.title,
      ok: it.status === "atendido",
      partial: it.status === "parcial",
      evidence: it.evidence,
    }));
  }, [items]);

  const lastRevision = revisions[0];

  if (!orgId) return null;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="md:flex md:items-start md:justify-between md:gap-4">
          <div>
            <CardTitle className="text-lg">
              Evidências para Auditoria
            </CardTitle>
            <p className="mt-1 text-[13px] text-muted-foreground">
              ISO 14001:2015 · 6.1.2 — Informações documentadas obrigatórias.
            </p>
          </div>
          <div className="flex gap-2 pt-2 md:pt-0">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Imprimir relatório
            </Button>
            <Button
              size="sm"
              onClick={() => {
                toast({
                  title: "Pacote em preparo",
                  description:
                    "Use 'Imprimir relatório' e salve como PDF até a exportação dedicada estar pronta.",
                });
              }}
            >
              Exportar pacote (PDF)
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <EvidenceCard
          title="LAIA"
          accent="emerald"
          rows={[
            { label: "Documento", value: "FPLAN-002" },
            {
              label: "Revisão",
              value: lastRevision
                ? `${lastRevision.revisionNumber} · ${new Date(lastRevision.createdAt ?? Date.now()).toLocaleDateString("pt-BR")}`
                : "—",
            },
            {
              label: "Registros",
              value: `${dashboard?.totalAssessments ?? 0} aspectos`,
            },
            { label: "Norma atendida", value: "6.1.2 ISO 14001:2015" },
          ]}
        />
        <EvidenceCard
          title="Requisitos Legais"
          accent="blue"
          rows={[
            { label: "Documento", value: "FPLAN-003 (LIRA)" },
            { label: "Norma atendida", value: "6.1.3 ISO 14001:2015" },
            {
              label: "Mapeados",
              value: `${dashboard?.withLegalRequirement ?? 0} com req. legal`,
            },
            { label: "Atualização", value: "Mensal (automática)" },
          ]}
        />
        <EvidenceCard
          title="Objetivos Ambientais"
          accent="amber"
          rows={[
            { label: "Documento", value: "FPLAN-006" },
            { label: "Norma atendida", value: "6.2.1 e 6.2.2" },
            {
              label: "Ligados a sig.",
              value: `${dashboard?.significantAssessments ?? 0} aspectos`,
            },
            { label: "Revisão", value: "Anual" },
          ]}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Checklist de Evidências — Item 6.1
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {checklist.map((c) => (
              <li
                key={c.clause}
                className="flex items-start gap-3 rounded-md border p-3"
              >
                <div
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold ${
                    c.ok
                      ? "bg-emerald-100 text-emerald-700"
                      : c.partial
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                  }`}
                >
                  {c.ok ? "✓" : c.partial ? "⚠" : "✗"}
                </div>
                <div className="flex-1 space-y-0.5">
                  <p className="text-[13px] font-medium">
                    {c.clause} — {c.title}
                  </p>
                  {c.evidence && (
                    <p className="text-[11px] text-emerald-700">
                      📋 {c.evidence}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function EvidenceCard({
  title,
  accent,
  rows,
}: {
  title: string;
  accent: "emerald" | "blue" | "amber";
  rows: Array<{ label: string; value: string }>;
}) {
  const headerCls = {
    emerald: "bg-emerald-100 text-emerald-900",
    blue: "bg-blue-100 text-blue-900",
    amber: "bg-amber-100 text-amber-900",
  }[accent];
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className={`px-3 py-2 text-sm font-semibold ${headerCls}`}>
        {title}
      </div>
      <div className="space-y-1.5 p-3 text-[12px]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-2">
            <span className="text-muted-foreground">{row.label}:</span>
            <span className="text-right font-medium">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
