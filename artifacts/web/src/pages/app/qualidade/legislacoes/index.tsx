import React, { useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useListLegislations, useCreateLegislation, useImportLegislations, getListLegislationsQueryKey, type ListLegislationsLevel, type ListLegislationsStatus, type CreateLegislationBody, type CreateLegislationBodyLevel, type CreateLegislationBodyStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Upload, FileText, Filter } from "lucide-react";
import { useForm } from "react-hook-form";
import Papa from "papaparse";

export default function LegislacoesPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState("");
  
  const { data: legislations, isLoading } = useListLegislations(
    orgId!, 
    { search, level: (level || undefined) as ListLegislationsLevel | undefined, status: (status || undefined) as ListLegislationsStatus | undefined }, 
    { query: { queryKey: getListLegislationsQueryKey(orgId!), enabled: !!orgId } }
  );

  const createMut = useCreateLegislation();
  const importMut = useImportLegislations();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  
  const form = useForm({
    defaultValues: {
      title: "", number: "", description: "", level: "federal", status: "vigente", publicationDate: "", sourceUrl: "", applicableArticles: ""
    }
  });

  const onCreateSubmit = async (data: { title: string; number: string; description: string; level: string; status: string; publicationDate: string; sourceUrl: string; applicableArticles: string }) => {
    if (!orgId) return;
    const body: CreateLegislationBody = {
      title: data.title,
      number: data.number || undefined,
      description: data.description || undefined,
      level: data.level as CreateLegislationBodyLevel,
      status: data.status as CreateLegislationBodyStatus,
      publicationDate: data.publicationDate || undefined,
      sourceUrl: data.sourceUrl || undefined,
      applicableArticles: data.applicableArticles || undefined,
    };
    await createMut.mutateAsync({ orgId, data: body });
    queryClient.invalidateQueries({ queryKey: getListLegislationsQueryKey(orgId) });
    setIsCreateOpen(false);
    form.reset();
  };

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;
    
    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        const mapped: CreateLegislationBody[] = results.data.filter((r) => (r as Record<string, string>).title).map((row) => {
          const r = row as Record<string, string>;
          return {
            title: r.title,
            number: r.number || undefined,
            level: (r.level?.toLowerCase() || 'federal') as CreateLegislationBodyLevel,
            status: (r.status?.toLowerCase() || 'vigente') as CreateLegislationBodyStatus,
          };
        });
        
        if (mapped.length > 0) {
          await importMut.mutateAsync({ orgId, data: { legislations: mapped } });
          queryClient.invalidateQueries({ queryKey: getListLegislationsQueryKey(orgId) });
          setIsImportOpen(false);
          alert(`Foram importadas ${mapped.length} legislações com sucesso!`);
        }
      }
    });
  };

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banco de Legislações</h1>
          <p className="text-muted-foreground mt-1">Requisitos legais aplicáveis à organização (ISO 14001).</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setIsImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Importar CSV
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Nova Legislação
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 mb-6 flex flex-wrap gap-4 items-end shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <Label className="mb-2">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Título ou número..." 
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="w-48">
          <Label className="mb-2">Esfera / Nível</Label>
          <Select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Todos os níveis</option>
            <option value="federal">Federal</option>
            <option value="estadual">Estadual</option>
            <option value="municipal">Municipal</option>
            <option value="internacional">Internacional</option>
          </Select>
        </div>
        <div className="w-48">
          <Label className="mb-2">Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Qualquer status</option>
            <option value="vigente">Vigente</option>
            <option value="revogada">Revogada</option>
            <option value="alterada">Alterada</option>
          </Select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-4">Título / Número</th>
                <th className="px-6 py-4">Esfera</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Publicação</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : legislations?.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">Nenhuma legislação encontrada.</td></tr>
              ) : (
                legislations?.map((leg) => (
                  <tr key={leg.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{leg.title}</div>
                      {leg.number && <div className="text-muted-foreground mt-0.5">{leg.number}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <span className="capitalize text-muted-foreground">{leg.level}</span>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={leg.status === 'vigente' ? 'success' : leg.status === 'revogada' ? 'destructive' : 'warning'} className="capitalize">
                        {leg.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {formatDate(leg.publicationDate)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/app/qualidade/legislacoes/${leg.id}`} className="text-primary hover:underline font-medium inline-flex items-center">
                        Detalhes
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen} title="Cadastrar Legislação">
        <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-4 mt-4">
          <div>
            <Label>Título (ex: Lei da Política Nacional do Meio Ambiente)</Label>
            <Input {...form.register("title", { required: true })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Número (ex: Lei 6.938/1981)</Label>
              <Input {...form.register("number")} />
            </div>
            <div>
              <Label>Data de Publicação</Label>
              <Input type="date" {...form.register("publicationDate")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nível</Label>
              <Select {...form.register("level")}>
                <option value="federal">Federal</option>
                <option value="estadual">Estadual</option>
                <option value="municipal">Municipal</option>
                <option value="internacional">Internacional</option>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select {...form.register("status")}>
                <option value="vigente">Vigente</option>
                <option value="alterada">Alterada</option>
                <option value="revogada">Revogada</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Descrição / Ementa</Label>
            <Textarea {...form.register("description")} placeholder="Resumo do conteúdo da legislação..." rows={3} />
          </div>
          <div>
            <Label>URL da Fonte (Diário Oficial)</Label>
            <Input {...form.register("sourceUrl")} placeholder="https://..." />
          </div>
          <div>
            <Label>Artigos Aplicáveis</Label>
            <Input {...form.register("applicableArticles")} placeholder="ex: Art. 2°, Art. 4°, Art. 9°" />
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button type="submit" isLoading={createMut.isPending}>Salvar</Button>
          </div>
        </form>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen} title="Importar Legislações">
        <div className="mt-4 space-y-4 text-sm">
          <p className="text-muted-foreground">
            Faça upload de um arquivo CSV contendo as colunas: <strong>title, number, level, status</strong>.
          </p>
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center bg-secondary/30">
            <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <Input 
              type="file" 
              accept=".csv" 
              className="max-w-[250px] mx-auto block"
              onChange={onImportFile}
              disabled={importMut.isPending}
            />
          </div>
          {importMut.isPending && <p className="text-center text-primary animate-pulse">Importando dados...</p>}
        </div>
      </Dialog>
    </AppLayout>
  );
}
