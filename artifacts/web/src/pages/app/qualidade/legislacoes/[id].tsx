import React, { useState } from "react";
import { useRoute, Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { 
  useGetLegislation, 
  useListUnits, 
  useAssignLegislationToUnit, 
  useUpdateUnitLegislation,
  useRemoveUnitLegislation,
  getGetLegislationQueryKey,
  getListUnitsQueryKey,
  type UpdateUnitLegislationBodyComplianceStatus,
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
import { ArrowLeft, ExternalLink, Link2, Building, AlertCircle } from "lucide-react";

export default function LegislationDetailPage() {
  const [, params] = useRoute("/app/qualidade/legislacoes/:id");
  const legId = parseInt(params?.id || "0");
  
  const { organization } = useAuth();
  const orgId = organization?.id;
  const queryClient = useQueryClient();

  const { data: leg, isLoading } = useGetLegislation(orgId!, legId, { query: { queryKey: getGetLegislationQueryKey(orgId!, legId), enabled: !!orgId && !!legId } });
  const { data: allUnits } = useListUnits(orgId!, { query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId } });
  
  const assignMut = useAssignLegislationToUnit();
  const updateComplianceMut = useUpdateUnitLegislation();
  const removeMut = useRemoveUnitLegislation();

  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  
  const [editingCompliance, setEditingCompliance] = useState<{ unitId: number; complianceStatus: string; notes?: string | null; evidenceUrl?: string | null; unit: { name: string } } | null>(null);
  const [statusVal, setStatusVal] = useState("");
  const [notesVal, setNotesVal] = useState("");
  const [evidenceVal, setEvidenceVal] = useState("");

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
    <Button variant="secondary" size="sm" onClick={() => setIsAssignOpen(true)}>
      <Link2 className="w-4 h-4 mr-2" />
      Vincular Unidade
    </Button>
  );

  return (
    <AppLayout pageTitle={leg.title} headerActions={headerActions}>
      <div className="mb-6">
        <Link href="/app/qualidade/legislacoes" className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm font-medium transition-colors cursor-pointer">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Voltar para lista
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border p-8 rounded-3xl shadow-sm">
            <div className="flex gap-2 mb-4">
              <Badge variant="outline" className="uppercase text-[10px] tracking-wider">{leg.level}</Badge>
              <Badge variant={leg.status === 'vigente' ? 'success' : 'secondary'} className="uppercase text-[10px] tracking-wider">{leg.status}</Badge>
            </div>
            <h2 className="text-2xl font-bold tracking-tight mb-2 text-foreground">{leg.title}</h2>
            {leg.number && <p className="text-xl text-muted-foreground font-medium mb-6">{leg.number}</p>}
            
            {leg.description && (
              <div className="prose prose-sm max-w-none text-muted-foreground mb-6">
                <p>{leg.description}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-x-8 gap-y-4 pt-6 border-t border-border mt-auto">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Publicação</p>
                <p className="font-medium">{formatDate(leg.publicationDate)}</p>
              </div>
              {leg.applicableArticles && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Artigos Aplicáveis</p>
                  <p className="font-medium">{leg.applicableArticles}</p>
                </div>
              )}
              {leg.sourceUrl && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Fonte</p>
                  <a href={leg.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium inline-flex items-center cursor-pointer">
                    Acessar Diário Oficial <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </div>
              )}
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
                        <span className="capitalize text-muted-foreground">{st.replace('_', ' ')}</span>
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
