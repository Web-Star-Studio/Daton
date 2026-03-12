import React, { useState, useEffect, useCallback } from "react";
import { useRoute, Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { 
  useGetLegislation, 
  useUpdateLegislation,
  useListUnits, 
  useAssignLegislationToUnit, 
  useUpdateUnitLegislation,
  useRemoveUnitLegislation,
  getGetLegislationQueryKey,
  getListUnitsQueryKey,
  type UpdateUnitLegislationBodyComplianceStatus,
  type LegislationDetail,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDate } from "@/lib/utils";
import { ArrowLeft, ExternalLink, Link2, Building, AlertCircle, Pencil, Check, X } from "lucide-react";

function InlineField({ label, value, fieldKey, type = "text", onSave }: {
  label: string;
  value: string | number | null | undefined;
  fieldKey: string;
  type?: "text" | "date" | "number" | "textarea" | "select";
  options?: { value: string; label: string }[];
  onSave: (key: string, val: string | number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  useEffect(() => { setDraft(String(value ?? "")); }, [value]);

  const save = () => {
    const trimmed = draft.trim();
    if (type === "number") {
      onSave(fieldKey, trimmed ? parseInt(trimmed, 10) : null);
    } else {
      onSave(fieldKey, trimmed || null);
    }
    setEditing(false);
  };

  const cancel = () => { setDraft(String(value ?? "")); setEditing(false); };

  return (
    <div className="group">
      <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">{label}</p>
      {editing ? (
        <div className="flex items-start gap-2">
          {type === "textarea" ? (
            <Textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} className="flex-1 text-[13px]" autoFocus />
          ) : (
            <Input type={type === "number" ? "number" : type === "date" ? "date" : "text"} value={draft} onChange={e => setDraft(e.target.value)} className="flex-1 text-[13px]" autoFocus />
          )}
          <Button variant="ghost" size="sm" onClick={save} className="shrink-0 h-8 w-8 p-0"><Check className="w-4 h-4 text-emerald-600" /></Button>
          <Button variant="ghost" size="sm" onClick={cancel} className="shrink-0 h-8 w-8 p-0"><X className="w-4 h-4 text-muted-foreground" /></Button>
        </div>
      ) : (
        <div className="flex items-center gap-1 cursor-pointer" onClick={() => setEditing(true)}>
          <p className="text-[13px] font-medium text-foreground min-h-[20px]">{value != null && value !== "" ? String(value) : "—"}</p>
          <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>
      )}
    </div>
  );
}

export default function LegislationDetailPage() {
  const [, params] = useRoute("/app/qualidade/legislacoes/:id");
  const legId = parseInt(params?.id || "0");
  
  const { organization } = useAuth();
  const orgId = organization?.id;
  const queryClient = useQueryClient();

  const { data: leg, isLoading } = useGetLegislation(orgId!, legId, { query: { queryKey: getGetLegislationQueryKey(orgId!, legId), enabled: !!orgId && !!legId } });
  const { data: allUnits } = useListUnits(orgId!, { query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId } });
  
  const updateMut = useUpdateLegislation();
  const assignMut = useAssignLegislationToUnit();
  const updateComplianceMut = useUpdateUnitLegislation();
  const removeMut = useRemoveUnitLegislation();

  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  
  const [editingCompliance, setEditingCompliance] = useState<{ unitId: number; complianceStatus: string; notes?: string | null; evidenceUrl?: string | null; unit: { name: string } } | null>(null);
  const [statusVal, setStatusVal] = useState("");
  const [notesVal, setNotesVal] = useState("");
  const [evidenceVal, setEvidenceVal] = useState("");

  const onFieldSave = useCallback(async (key: string, val: string | number | null) => {
    if (!orgId) return;
    await updateMut.mutateAsync({ orgId, legId, data: { [key]: val ?? undefined } as any });
    queryClient.invalidateQueries({ queryKey: getGetLegislationQueryKey(orgId, legId) });
  }, [orgId, legId, updateMut, queryClient]);

  const onAssign = async () => {
    if (!orgId || !selectedUnitId) return;
    await assignMut.mutateAsync({ 
      orgId, legId, 
      data: { unitId: parseInt(selectedUnitId), complianceStatus: 'nao_avaliado' } 
    });
    queryClient.invalidateQueries({ queryKey: getGetLegislationQueryKey(orgId, legId) });
    setIsAssignOpen(false);
    setSelectedUnitId("");
  };

  const onSaveCompliance = async () => {
    if (!orgId || !editingCompliance) return;
    await updateComplianceMut.mutateAsync({
      orgId, legId, unitId: editingCompliance.unitId,
      data: { complianceStatus: statusVal as UpdateUnitLegislationBodyComplianceStatus, notes: notesVal, evidenceUrl: evidenceVal || undefined }
    });
    queryClient.invalidateQueries({ queryKey: getGetLegislationQueryKey(orgId, legId) });
    setEditingCompliance(null);
  };

  const onUnassign = async (unitId: number) => {
    if (!orgId || !confirm("Deseja desvincular esta unidade da legislação?")) return;
    await removeMut.mutateAsync({ orgId, legId, unitId });
    queryClient.invalidateQueries({ queryKey: getGetLegislationQueryKey(orgId, legId) });
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'conforme': return <Badge variant="success">Conforme</Badge>;
      case 'nao_conforme': return <Badge variant="destructive">Não Conforme</Badge>;
      case 'parcialmente_conforme': return <Badge variant="warning">Parcialmente Conforme</Badge>;
      default: return <Badge variant="secondary">Não Avaliado</Badge>;
    }
  };

  if (isLoading || !leg) return <AppLayout><div className="p-8 text-center">Carregando...</div></AppLayout>;

  const availableUnits = allUnits?.filter(u => !leg.unitLegislations.find(ul => ul.unitId === u.id)) || [];

  const headerActions = (
    <div className="flex items-center gap-2">
      <Link href="/app/qualidade/legislacoes">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
      </Link>
      <Button variant="secondary" size="sm" onClick={() => setIsAssignOpen(true)}>
        <Link2 className="w-4 h-4 mr-2" />
        Vincular Unidade
      </Button>
    </div>
  );

  return (
    <AppLayout pageTitle={leg.title} headerActions={headerActions}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border p-8 rounded-3xl shadow-sm">
            <div className="flex gap-2 mb-4">
              <Badge variant="outline" className="uppercase text-[10px] tracking-wider">{leg.level}</Badge>
              <Badge variant={leg.status === 'vigente' || leg.status === 'conforme' ? 'success' : 'secondary'} className="uppercase text-[10px] tracking-wider">{leg.status}</Badge>
            </div>
            <h2 className="text-2xl font-bold tracking-tight mb-2 text-foreground">{leg.title}</h2>
            {leg.number && <p className="text-xl text-muted-foreground font-medium mb-6">{leg.number}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 pt-6 border-t border-border">
              <InlineField label="Tipo de Norma" value={leg.tipoNorma} fieldKey="tipoNorma" onSave={onFieldSave} />
              <InlineField label="Número" value={leg.number} fieldKey="number" onSave={onFieldSave} />
              <InlineField label="Órgão Emissor" value={leg.emissor} fieldKey="emissor" onSave={onFieldSave} />
              <InlineField label="Data de Publicação" value={leg.publicationDate ? leg.publicationDate.split("T")[0] : null} fieldKey="publicationDate" type="date" onSave={onFieldSave} />
              <InlineField label="Esfera / Nível" value={leg.level} fieldKey="level" onSave={onFieldSave} />
              <InlineField label="Status" value={leg.status} fieldKey="status" onSave={onFieldSave} />
              <InlineField label="UF" value={leg.uf} fieldKey="uf" onSave={onFieldSave} />
              <InlineField label="Município" value={leg.municipality} fieldKey="municipality" onSave={onFieldSave} />
              <InlineField label="Macrotema" value={leg.macrotema} fieldKey="macrotema" onSave={onFieldSave} />
              <InlineField label="Subtema" value={leg.subtema} fieldKey="subtema" onSave={onFieldSave} />
              <InlineField label="Aplicabilidade" value={leg.applicability} fieldKey="applicability" onSave={onFieldSave} />
              <InlineField label="Frequência de Revisão (dias)" value={leg.reviewFrequencyDays} fieldKey="reviewFrequencyDays" type="number" onSave={onFieldSave} />
              <InlineField label="Artigos Aplicáveis" value={leg.applicableArticles} fieldKey="applicableArticles" onSave={onFieldSave} />
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Fonte</p>
                {leg.sourceUrl ? (
                  <a href={leg.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline text-[13px] font-medium inline-flex items-center cursor-pointer">
                    Acessar <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                ) : (
                  <InlineField label="" value={leg.sourceUrl} fieldKey="sourceUrl" onSave={onFieldSave} />
                )}
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-border space-y-5">
              <InlineField label="Descrição / Ementa" value={leg.description} fieldKey="description" type="textarea" onSave={onFieldSave} />
              <InlineField label="Observações (como é atendido)" value={leg.observations} fieldKey="observations" type="textarea" onSave={onFieldSave} />
              <InlineField label="Observações Gerais" value={leg.generalObservations} fieldKey="generalObservations" type="textarea" onSave={onFieldSave} />
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold tracking-tight mb-4">Aplicabilidade nas Unidades</h2>

            <div className="space-y-4">
              {leg.unitLegislations.length === 0 ? (
                <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
                  <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Esta legislação ainda não foi vinculada a nenhuma unidade.</p>
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
                          <p className="text-sm text-muted-foreground capitalize">{ul.unit.type} • {ul.unit.city || 'Sem cidade'}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 w-full sm:w-auto">
                        <div className="flex-1 sm:flex-initial text-right">
                          {getStatusBadge(ul.complianceStatus)}
                          {ul.evaluatedAt && <p className="text-[10px] text-muted-foreground mt-1">Atualizado em {formatDate(ul.evaluatedAt)}</p>}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setEditingCompliance(ul);
                            setStatusVal(ul.complianceStatus);
                            setNotesVal(ul.notes || "");
                            setEvidenceVal(ul.evidenceUrl || "");
                          }}
                        >
                          Avaliar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => onUnassign(ul.unitId)}
                        >
                          Desvincular
                        </Button>
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
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Resumo de Conformidade</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {['conforme', 'parcialmente_conforme', 'nao_conforme', 'nao_avaliado'].map(st => {
                  const count = leg.unitLegislations.filter(ul => ul.complianceStatus === st).length;
                  const total = leg.unitLegislations.length || 1;
                  const pct = Math.round((count / total) * 100);
                  
                  return (
                    <div key={st}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize text-muted-foreground">{st.replace(/_/g, ' ')}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full", 
                            st === 'conforme' ? "bg-emerald-500" : 
                            st === 'nao_conforme' ? "bg-red-500" : 
                            st === 'parcialmente_conforme' ? "bg-amber-500" : "bg-gray-300"
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

      <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen} title="Vincular Unidade">
        <div className="space-y-4 mt-4">
          <Label>Selecione a Unidade aplicável</Label>
          <Select value={selectedUnitId} onChange={e => setSelectedUnitId(e.target.value)}>
            <option value="">Selecione...</option>
            {availableUnits.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.type})</option>
            ))}
          </Select>
          {availableUnits.length === 0 && <p className="text-sm text-amber-600">Todas as unidades já estão vinculadas.</p>}
          <div className="pt-4 flex justify-end">
            <Button onClick={onAssign} disabled={!selectedUnitId || assignMut.isPending} isLoading={assignMut.isPending}>
              Confirmar Vínculo
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!editingCompliance} onOpenChange={(v) => !v && setEditingCompliance(null)} title="Avaliar Conformidade">
        {editingCompliance && (
          <div className="space-y-4 mt-4">
            <p className="text-sm font-medium">Unidade: {editingCompliance.unit.name}</p>
            <div>
              <Label>Status de Conformidade</Label>
              <Select value={statusVal} onChange={e => setStatusVal(e.target.value)} className="mt-1">
                <option value="conforme">Conforme</option>
                <option value="parcialmente_conforme">Parcialmente Conforme</option>
                <option value="nao_conforme">Não Conforme</option>
                <option value="nao_avaliado">Não Avaliado</option>
              </Select>
            </div>
            <div>
              <Label>Anotações / Evidências</Label>
              <Textarea 
                value={notesVal} 
                onChange={e => setNotesVal(e.target.value)} 
                placeholder="Descreva as evidências de conformidade ou planos de ação..."
                className="mt-1"
              />
            </div>
            <div>
              <Label>URL da Evidência</Label>
              <Input 
                value={evidenceVal}
                onChange={e => setEvidenceVal(e.target.value)}
                placeholder="https://link-para-evidencia.com/..."
                className="mt-1"
              />
            </div>
            <div className="pt-4 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setEditingCompliance(null)}>Cancelar</Button>
              <Button onClick={onSaveCompliance} isLoading={updateComplianceMut.isPending}>Salvar Avaliação</Button>
            </div>
          </div>
        )}
      </Dialog>
    </AppLayout>
  );
}
