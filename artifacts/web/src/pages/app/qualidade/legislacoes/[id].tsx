import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "wouter";
import { useHeaderActions, usePageTitle } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import {
  useGetLegislation,
  useUpdateLegislation,
  useListUnits,
  useAssignLegislationToUnit,
  useUpdateUnitLegislation,
  useRemoveUnitLegislation,
  useGetComplianceTagVocabulary,
  getGetLegislationQueryKey,
  getListLegislationsQueryKey,
  getListUnitsQueryKey,
  type UpdateUnitLegislationBodyComplianceStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getAuthHeaders, resolveApiUrl } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  ExternalLink,
  Link2,
  Building,
  AlertCircle,
  Pencil,
  Check,
  X,
  Paperclip,
  Trash2,
  FileText,
  Upload,
  Loader2,
  Sparkles,
} from "lucide-react";

interface Attachment {
  id: number;
  unitLegislationId: number;
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
  uploadedAt: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function InlineField({
  label,
  value,
  fieldKey,
  type = "text",
  editable = true,
  onSave,
}: {
  label: string;
  value: string | number | null | undefined;
  fieldKey: string;
  type?: "text" | "date" | "number" | "textarea";
  editable?: boolean;
  onSave: (key: string, val: string | number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  useEffect(() => {
    setDraft(String(value ?? ""));
  }, [value]);

  const save = () => {
    const trimmed = draft.trim();
    if (type === "number") {
      onSave(fieldKey, trimmed ? parseInt(trimmed, 10) : null);
    } else {
      onSave(fieldKey, trimmed || null);
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(String(value ?? ""));
    setEditing(false);
  };

  return (
    <div className="group">
      {label && (
        <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">
          {label}
        </p>
      )}
      {editing ? (
        <div className="flex items-start gap-2">
          {type === "textarea" ? (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="flex-1 text-[13px]"
              autoFocus
            />
          ) : (
            <Input
              type={
                type === "number" ? "number" : type === "date" ? "date" : "text"
              }
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 text-[13px]"
              autoFocus
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={save}
            className="shrink-0 h-8 w-8 p-0"
          >
            <Check className="w-4 h-4 text-emerald-600" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={cancel}
            className="shrink-0 h-8 w-8 p-0"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            "flex items-center gap-1",
            editable ? "cursor-pointer" : "",
          )}
          onClick={() => editable && setEditing(true)}
        >
          <p className="text-[13px] font-medium text-foreground min-h-[20px]">
            {value != null && value !== "" ? String(value) : "—"}
          </p>
          {editable && (
            <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          )}
        </div>
      )}
    </div>
  );
}

function TagEditor({
  tags,
  vocabulary,
  editable = true,
  onSave,
}: {
  tags: string[];
  vocabulary: string[];
  editable?: boolean;
  onSave: (tags: string[]) => void;
}) {
  const [inputVal, setInputVal] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = inputVal.trim()
    ? vocabulary
        .filter(
          (t) =>
            t.toLowerCase().includes(inputVal.toLowerCase()) &&
            !tags.includes(t),
        )
        .slice(0, 10)
    : [];

  const addTag = (tag: string) => {
    if (!tags.includes(tag)) {
      onSave([...tags, tag]);
    }
    setInputVal("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onSave(tags.filter((t) => t !== tag));
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef}>
      <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">
        Tags de Compliance
      </p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary"
          >
            {tag}
            {editable && (
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="hover:text-red-500 transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {editable && (
        <div className="relative">
          <Input
            ref={inputRef}
            value={inputVal}
            onChange={(e) => {
              setInputVal(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && inputVal.trim()) {
                e.preventDefault();
                if (filtered.length > 0) {
                  addTag(filtered[0]);
                } else if (inputVal.trim()) {
                  addTag(inputVal.trim());
                }
              }
            }}
            placeholder="Buscar ou adicionar tag..."
            className="text-[13px]"
          />
          {showSuggestions && filtered.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filtered.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => addTag(tag)}
                  className="w-full text-left px-3 py-2 text-[13px] hover:bg-muted/50 transition-colors cursor-pointer first:rounded-t-lg last:rounded-b-lg"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Tab = "geral" | "unidades";

export default function LegislationDetailPage() {
  const params = useParams<{ id: string }>();
  const legId = parseInt(params?.id || "0");

  const { organization } = useAuth();
  const { canWriteModule } = usePermissions();
  const orgId = organization?.id;
  const canWriteLegislations = canWriteModule("legislations");
  const queryClient = useQueryClient();

  const { data: leg, isLoading } = useGetLegislation(orgId!, legId, {
    query: {
      queryKey: getGetLegislationQueryKey(orgId!, legId),
      enabled: !!orgId && !!legId,
    },
  });
  const { data: allUnits } = useListUnits(orgId!, {
    query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId },
  });
  const { data: tagVocabulary } = useGetComplianceTagVocabulary();

  const updateMut = useUpdateLegislation();
  const assignMut = useAssignLegislationToUnit();
  const updateComplianceMut = useUpdateUnitLegislation();
  const removeMut = useRemoveUnitLegislation();

  const [activeTab, setActiveTab] = useState<Tab>("geral");
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState("");

  const [editingCompliance, setEditingCompliance] = useState<{
    unitId: number;
    complianceStatus: string;
    notes?: string | null;
    evidenceUrl?: string | null;
    unit: { name: string };
  } | null>(null);
  const [statusVal, setStatusVal] = useState("");
  const [notesVal, setNotesVal] = useState("");
  const [evidenceVal, setEvidenceVal] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [isAutoTagging, setIsAutoTagging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFieldSave = useCallback(
    async (key: string, val: string | number | null) => {
      if (!orgId) return;
      await updateMut.mutateAsync({
        orgId,
        legId,
        data: { [key]: val ?? undefined } as any,
      });
      queryClient.invalidateQueries({
        queryKey: getGetLegislationQueryKey(orgId, legId),
      });
    },
    [orgId, legId, updateMut, queryClient],
  );

  const onTagsSave = useCallback(
    async (newTags: string[]) => {
      if (!orgId) return;
      await updateMut.mutateAsync({ orgId, legId, data: { tags: newTags } });
      queryClient.invalidateQueries({
        queryKey: getGetLegislationQueryKey(orgId, legId),
      });
      queryClient.invalidateQueries({
        queryKey: getListLegislationsQueryKey(orgId),
      });
    },
    [orgId, legId, updateMut, queryClient],
  );

  const onAssign = async () => {
    if (!orgId || !selectedUnitId) return;
    await assignMut.mutateAsync({
      orgId,
      legId,
      data: {
        unitId: parseInt(selectedUnitId),
        complianceStatus: "nao_avaliado",
      },
    });
    queryClient.invalidateQueries({
      queryKey: getGetLegislationQueryKey(orgId, legId),
    });
    setIsAssignOpen(false);
    setSelectedUnitId("");
  };

  const loadAttachments = useCallback(
    async (unitId: number) => {
      if (!orgId) return;
      setLoadingAttachments(true);
      try {
        const res = await fetch(
          resolveApiUrl(
            `/api/organizations/${orgId}/legislations/${legId}/units/${unitId}/attachments`,
          ),
          {
            headers: getAuthHeaders(),
          },
        );
        if (res.ok) {
          setAttachments(await res.json());
        }
      } finally {
        setLoadingAttachments(false);
      }
    },
    [orgId, legId],
  );

  const openComplianceDialog = useCallback(
    (ul: {
      unitId: number;
      complianceStatus: string;
      notes?: string | null;
      evidenceUrl?: string | null;
      unit: { name: string };
    }) => {
      setEditingCompliance(ul);
      setStatusVal(ul.complianceStatus);
      setNotesVal(ul.notes || "");
      setEvidenceVal(ul.evidenceUrl || "");
      setAttachments([]);
      loadAttachments(ul.unitId);
    },
    [loadAttachments],
  );

  const uploadFile = async (file: File) => {
    if (!orgId || !editingCompliance) return;
    setIsUploading(true);
    try {
      const contentType = file.type || "application/octet-stream";
      const arrayBuffer = await file.arrayBuffer();
      const uploadRes = await fetch(
        resolveApiUrl("/api/storage/uploads/direct"),
        {
          method: "POST",
          headers: {
            "X-File-Content-Type": contentType,
            "X-File-Name": encodeURIComponent(file.name),
            "Content-Type": "application/octet-stream",
            ...getAuthHeaders(),
          },
          body: arrayBuffer,
        },
      );
      if (!uploadRes.ok) throw new Error("Falha ao enviar arquivo");
      const { objectPath } = await uploadRes.json();

      const attachRes = await fetch(
        resolveApiUrl(
          `/api/organizations/${orgId}/legislations/${legId}/units/${editingCompliance.unitId}/attachments`,
        ),
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            contentType,
            objectPath,
          }),
        },
      );
      if (!attachRes.ok) throw new Error("Falha ao registrar anexo");
      const attachment = await attachRes.json();
      setAttachments((prev) => [...prev, attachment]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao enviar arquivo");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteAttachment = async (attachmentId: number) => {
    if (!orgId || !editingCompliance) return;
    const res = await fetch(
      resolveApiUrl(
        `/api/organizations/${orgId}/legislations/${legId}/units/${editingCompliance.unitId}/attachments/${attachmentId}`,
      ),
      {
        method: "DELETE",
        headers: getAuthHeaders(),
      },
    );
    if (res.ok) {
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    }
  };

  const onSaveCompliance = async () => {
    if (!orgId || !editingCompliance) return;
    await updateComplianceMut.mutateAsync({
      orgId,
      legId,
      unitId: editingCompliance.unitId,
      data: {
        complianceStatus:
          statusVal as UpdateUnitLegislationBodyComplianceStatus,
        notes: notesVal,
        evidenceUrl: evidenceVal || undefined,
      },
    });
    queryClient.invalidateQueries({
      queryKey: getGetLegislationQueryKey(orgId, legId),
    });
    setEditingCompliance(null);
  };

  const onAutoTag = async () => {
    if (!orgId) return;
    setIsAutoTagging(true);
    try {
      const token = localStorage.getItem("daton_token");
      const res = await fetch(
        resolveApiUrl(
          `/api/organizations/${orgId}/legislations/${legId}/auto-tag`,
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      );
      if (res.ok) {
        queryClient.invalidateQueries({
          queryKey: getGetLegislationQueryKey(orgId, legId),
        });
      } else {
        const err = await res
          .json()
          .catch(() => ({ error: "Erro desconhecido" }));
        alert(err.error || "Erro ao classificar legislação");
      }
    } catch {
      alert("Erro de conexão ao classificar legislação");
    } finally {
      setIsAutoTagging(false);
    }
  };

  const onUnassign = async (unitId: number) => {
    if (!orgId || !confirm("Deseja desvincular esta unidade da legislação?"))
      return;
    await removeMut.mutateAsync({ orgId, legId, unitId });
    queryClient.invalidateQueries({
      queryKey: getGetLegislationQueryKey(orgId, legId),
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "conforme":
        return <Badge variant="success">Conforme</Badge>;
      case "nao_conforme":
        return <Badge variant="destructive">Não Conforme</Badge>;
      case "parcialmente_conforme":
        return <Badge variant="warning">Parcialmente Conforme</Badge>;
      default:
        return <Badge variant="secondary">Não Avaliado</Badge>;
    }
  };

  usePageTitle(leg?.title);
  useHeaderActions(
    leg ? (
      <div className="flex items-center gap-2">
        <Link href="/qualidade/legislacoes">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
        </Link>
        {canWriteLegislations && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onAutoTag}
            disabled={isAutoTagging}
          >
            {isAutoTagging ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {isAutoTagging ? "Classificando..." : "Auto-classificar tags"}
          </Button>
        )}
        {canWriteLegislations && activeTab === "unidades" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsAssignOpen(true)}
          >
            <Link2 className="w-4 h-4 mr-2" />
            Vincular Unidade
          </Button>
        )}
      </div>
    ) : null,
  );

  if (isLoading || !leg)
    return <div className="p-8 text-center">Carregando...</div>;

  const availableUnits =
    allUnits?.filter(
      (u) => !leg.unitLegislations.find((ul) => ul.unitId === u.id),
    ) || [];

  return (
    <>
      <div className="border-b border-border mb-8">
        <nav className="flex gap-8">
          <button
            onClick={() => setActiveTab("geral")}
            className={cn(
              "pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer",
              activeTab === "geral"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            Informações Gerais
          </button>
          <button
            onClick={() => setActiveTab("unidades")}
            className={cn(
              "pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer",
              activeTab === "unidades"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            Aplicabilidade nas Unidades
            {leg.unitLegislations.length > 0 && (
              <span className="ml-2 text-xs bg-secondary text-muted-foreground rounded-full px-2 py-0.5">
                {leg.unitLegislations.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {activeTab === "geral" && (
        <div className="bg-card border border-border p-8 rounded-3xl shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
            <InlineField
              label="Tipo de Norma"
              value={leg.tipoNorma}
              fieldKey="tipoNorma"
              editable={canWriteLegislations}
              onSave={onFieldSave}
            />
            <InlineField
              label="Número"
              value={leg.number}
              fieldKey="number"
              editable={canWriteLegislations}
              onSave={onFieldSave}
            />
            <InlineField
              label="Órgão Emissor"
              value={leg.emissor}
              fieldKey="emissor"
              editable={canWriteLegislations}
              onSave={onFieldSave}
            />
            <InlineField
              label="Data de Publicação"
              value={
                leg.publicationDate ? leg.publicationDate.split("T")[0] : null
              }
              fieldKey="publicationDate"
              type="date"
              editable={canWriteLegislations}
              onSave={onFieldSave}
            />
            <InlineField
              label="Esfera / Nível"
              value={leg.level}
              fieldKey="level"
              editable={canWriteLegislations}
              onSave={onFieldSave}
            />
            <InlineField
              label="UF"
              value={leg.uf}
              fieldKey="uf"
              editable={canWriteLegislations}
              onSave={onFieldSave}
            />
            <InlineField
              label="Município"
              value={leg.municipality}
              fieldKey="municipality"
              editable={canWriteLegislations}
              onSave={onFieldSave}
            />
            <InlineField
              label="Macrotema"
              value={leg.macrotema}
              fieldKey="macrotema"
              editable={canWriteLegislations}
              onSave={onFieldSave}
            />
            <InlineField
              label="Subtema"
              value={leg.subtema}
              fieldKey="subtema"
              editable={canWriteLegislations}
              onSave={onFieldSave}
            />
            <InlineField
              label="Aplicabilidade"
              value={leg.applicability}
              fieldKey="applicability"
              editable={canWriteLegislations}
              onSave={onFieldSave}
            />
            <InlineField
              label="Frequência de Revisão (dias)"
              value={leg.reviewFrequencyDays}
              fieldKey="reviewFrequencyDays"
              type="number"
              editable={canWriteLegislations}
              onSave={onFieldSave}
            />
            <InlineField
              label="Artigos Aplicáveis"
              value={leg.applicableArticles}
              fieldKey="applicableArticles"
              editable={canWriteLegislations}
              onSave={onFieldSave}
            />
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">
                Fonte
              </p>
              {leg.sourceUrl ? (
                <div className="flex items-center gap-2">
                  <a
                    href={leg.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline text-[13px] font-medium inline-flex items-center cursor-pointer"
                  >
                    Acessar <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </div>
              ) : (
                <InlineField
                  label=""
                  value={leg.sourceUrl}
                  fieldKey="sourceUrl"
                  onSave={onFieldSave}
                />
              )}
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-border space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground uppercase font-semibold">
                  Tags de Compliance
                </p>
                {canWriteLegislations && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onAutoTag}
                    disabled={isAutoTagging}
                    className="h-7 text-xs"
                  >
                    {isAutoTagging ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3 mr-1" />
                    )}
                    {isAutoTagging ? "Classificando..." : "Reclassificar"}
                  </Button>
                )}
              </div>
              <TagEditor
                tags={leg.tags ?? []}
                vocabulary={tagVocabulary ?? []}
                editable={canWriteLegislations}
                onSave={onTagsSave}
              />
            </div>
            <InlineField
              label="Descrição / Ementa"
              value={leg.description}
              fieldKey="description"
              type="textarea"
              editable={canWriteLegislations}
              onSave={onFieldSave}
            />
            <InlineField
              label="Observações (como é atendido)"
              value={leg.observations}
              fieldKey="observations"
              type="textarea"
              editable={canWriteLegislations}
              onSave={onFieldSave}
            />
            <InlineField
              label="Observações Gerais"
              value={leg.generalObservations}
              fieldKey="generalObservations"
              type="textarea"
              editable={canWriteLegislations}
              onSave={onFieldSave}
            />
          </div>
        </div>
      )}

      {activeTab === "unidades" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {leg.unitLegislations.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
                <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  Esta legislação ainda não foi vinculada a nenhuma unidade.
                </p>
                {canWriteLegislations && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-4"
                    onClick={() => setIsAssignOpen(true)}
                  >
                    <Link2 className="w-4 h-4 mr-2" /> Vincular Unidade
                  </Button>
                )}
              </div>
            ) : (
              leg.unitLegislations.map((ul) => (
                <Card key={ul.id} className="overflow-hidden">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center text-muted-foreground">
                        <Building className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-semibold">{ul.unit.name}</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {ul.unit.type} • {ul.unit.city || "Sem cidade"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-auto">
                      <div className="flex-1 sm:flex-initial text-right">
                        {getStatusBadge(ul.complianceStatus)}
                        {ul.evaluatedAt && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Atualizado em {formatDate(ul.evaluatedAt)}
                          </p>
                        )}
                      </div>
                      {canWriteLegislations && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openComplianceDialog(ul)}
                        >
                          Avaliar
                        </Button>
                      )}
                      {canWriteLegislations && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => onUnassign(ul.unitId)}
                        >
                          Desvincular
                        </Button>
                      )}
                    </div>
                  </div>
                  {ul.notes && (
                    <div className="px-5 pb-5 pt-0">
                      <div className="bg-muted p-3 rounded-lg text-sm text-muted-foreground border-l-2 border-border">
                        <strong>Anotações:</strong> {ul.notes}
                      </div>
                    </div>
                  )}
                </Card>
              ))
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">
                  Resumo de Conformidade
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    "conforme",
                    "parcialmente_conforme",
                    "nao_conforme",
                    "nao_avaliado",
                  ].map((st) => {
                    const count = leg.unitLegislations.filter(
                      (ul) => ul.complianceStatus === st,
                    ).length;
                    const total = leg.unitLegislations.length || 1;
                    const pct = Math.round((count / total) * 100);

                    return (
                      <div key={st}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="capitalize text-muted-foreground">
                            {st.replace(/_/g, " ")}
                          </span>
                          <span className="font-medium">{count}</span>
                        </div>
                        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full",
                              st === "conforme"
                                ? "bg-emerald-500"
                                : st === "nao_conforme"
                                  ? "bg-red-500"
                                  : st === "parcialmente_conforme"
                                    ? "bg-amber-500"
                                    : "bg-gray-300",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Dialog
        open={canWriteLegislations && isAssignOpen}
        onOpenChange={setIsAssignOpen}
        title="Vincular Unidade"
      >
        <div className="space-y-4 mt-4">
          <Label>Selecione a Unidade aplicável</Label>
          <Select
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(e.target.value)}
          >
            <option value="">Selecione...</option>
            {availableUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.type})
              </option>
            ))}
          </Select>
          {availableUnits.length === 0 && (
            <p className="text-sm text-amber-600">
              Todas as unidades já estão vinculadas.
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAssignOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={onAssign}
              disabled={!selectedUnitId || assignMut.isPending}
              isLoading={assignMut.isPending}
            >
              Confirmar Vínculo
            </Button>
          </DialogFooter>
        </div>
      </Dialog>

      <Dialog
        open={canWriteLegislations && !!editingCompliance}
        onOpenChange={(v) => !v && setEditingCompliance(null)}
        title="Avaliar Conformidade"
      >
        {editingCompliance && (
          <div className="space-y-4 mt-4">
            <p className="text-sm font-medium">
              Unidade: {editingCompliance.unit.name}
            </p>
            <div>
              <Label>Status de Conformidade</Label>
              <Select
                value={statusVal}
                onChange={(e) => setStatusVal(e.target.value)}
                className="mt-1"
              >
                <option value="conforme">Conforme</option>
                <option value="parcialmente_conforme">
                  Parcialmente Conforme
                </option>
                <option value="nao_conforme">Não Conforme</option>
                <option value="nao_avaliado">Não Avaliado</option>
              </Select>
            </div>
            <div>
              <Label>Anotações / Evidências</Label>
              <Textarea
                value={notesVal}
                onChange={(e) => setNotesVal(e.target.value)}
                placeholder="Descreva as evidências de conformidade ou planos de ação..."
                className="mt-1"
              />
            </div>
            <div>
              <Label>URL da Evidência</Label>
              <Input
                value={evidenceVal}
                onChange={(e) => setEvidenceVal(e.target.value)}
                placeholder="https://link-para-evidencia.com/..."
                className="mt-1"
              />
            </div>
            <div>
              <Label>Anexos de Evidência</Label>
              <div className="mt-1 space-y-2">
                {loadingAttachments && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Carregando
                    anexos...
                  </div>
                )}
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-md text-[13px]"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <a
                      href={resolveApiUrl(`/api/storage${a.objectPath}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-primary hover:underline truncate"
                    >
                      {a.fileName}
                    </a>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatFileSize(a.fileSize)}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteAttachment(a.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {!loadingAttachments && attachments.length === 0 && (
                  <p className="text-xs text-muted-foreground py-1">
                    Nenhum anexo adicionado.
                  </p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadFile(file);
                  }}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Paperclip className="w-4 h-4 mr-2" /> Anexar Arquivo
                    </>
                  )}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingCompliance(null)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={onSaveCompliance}
                isLoading={updateComplianceMut.isPending}
              >
                Salvar Avaliação
              </Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>
    </>
  );
}
