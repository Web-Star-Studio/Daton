import React, { useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useListLegislations, useCreateLegislation, useImportLegislations, getListLegislationsQueryKey, type CreateLegislationBody } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Upload, FileText, CheckCircle, AlertCircle, RefreshCw, SkipForward } from "lucide-react";
import { useForm } from "react-hook-form";
import * as XLSX from "xlsx";

const COLUMN_MAP: Record<string, string> = {
  "tipo de norma": "tipoNorma",
  "tipo": "tipoNorma",
  "número": "number",
  "numero": "number",
  "título/ementa": "title",
  "titulo/ementa": "title",
  "título": "title",
  "titulo": "title",
  "resumo": "description",
  "órgão emissor": "emissor",
  "orgao emissor": "emissor",
  "emissor": "emissor",
  "data publicação": "publicationDate",
  "data publicacao": "publicationDate",
  "data de publicação": "publicationDate",
  "jurisdição": "level",
  "jurisdicao": "level",
  "uf": "uf",
  "município": "municipality",
  "municipio": "municipality",
  "macrotema": "macrotema",
  "subtema": "subtema",
  "aplicabilidade": "applicability",
  "url texto integral": "sourceUrl",
  "frequência revisão (dias)": "reviewFrequencyDays",
  "frequencia revisao (dias)": "reviewFrequencyDays",
  "frequência de revisão (dias)": "reviewFrequencyDays",
  "observações como é atendido": "observations",
  "observações como é atendido ": "observations",
  "observações": "observations",
  "observaçãoes gerais, envios datas e responsáveis": "generalObservations",
  "observações gerais": "generalObservations",
  "observacoes gerais": "generalObservations",
};

function normalizeColumnName(col: string): string {
  return col.toLowerCase().trim().replace(/\s+/g, " ");
}

function isValidDate(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function formatValidDate(y: number, m: number, d: number): string | undefined {
  if (!isValidDate(y, m, d)) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDate(val: unknown): string | undefined {
  if (!val) return undefined;
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      return formatValidDate(d.y, d.m, d.d);
    }
  }
  const s = String(val).trim();
  const brMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (brMatch) {
    return formatValidDate(parseInt(brMatch[3]), parseInt(brMatch[2]), parseInt(brMatch[1]));
  }
  const isoMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    return formatValidDate(parseInt(isoMatch[1]), parseInt(isoMatch[2]), parseInt(isoMatch[3]));
  }
  const usMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (usMatch) {
    const year = usMatch[3].length === 2 ? 2000 + parseInt(usMatch[3]) : parseInt(usMatch[3]);
    return formatValidDate(year, parseInt(usMatch[1]), parseInt(usMatch[2]));
  }
  return undefined;
}

function parseXlsxRows(data: ArrayBuffer, selectedLevel: string): CreateLegislationBody[] {
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  const results: CreateLegislationBody[] = [];

  for (const row of rows) {
    const mapped: Record<string, unknown> = {};

    for (const [rawCol, rawVal] of Object.entries(row)) {
      const normalized = normalizeColumnName(rawCol);
      const fieldName = COLUMN_MAP[normalized];
      if (fieldName && rawVal != null && String(rawVal).trim() !== "") {
        mapped[fieldName] = rawVal;
      }
    }

    const title = String(mapped.title || mapped.description || "").trim();
    if (!title) continue;

    const pubDate = parseDate(mapped.publicationDate);
    const freqDays = mapped.reviewFrequencyDays ? parseInt(String(mapped.reviewFrequencyDays), 10) : undefined;

    results.push({
      title,
      number: mapped.number ? String(mapped.number).trim() : undefined,
      description: mapped.description ? String(mapped.description).trim() : undefined,
      tipoNorma: mapped.tipoNorma ? String(mapped.tipoNorma).trim() : undefined,
      emissor: mapped.emissor ? String(mapped.emissor).trim() : undefined,
      level: selectedLevel,
      uf: mapped.uf ? String(mapped.uf).trim() : undefined,
      municipality: mapped.municipality ? String(mapped.municipality).trim() : undefined,
      macrotema: mapped.macrotema ? String(mapped.macrotema).trim() : undefined,
      subtema: mapped.subtema ? String(mapped.subtema).trim() : undefined,
      applicability: mapped.applicability ? String(mapped.applicability).trim().toLowerCase() : undefined,
      publicationDate: pubDate,
      sourceUrl: mapped.sourceUrl ? String(mapped.sourceUrl).trim() : undefined,
      reviewFrequencyDays: freqDays && !isNaN(freqDays) ? freqDays : undefined,
      observations: mapped.observations ? String(mapped.observations).trim() : undefined,
      generalObservations: mapped.generalObservations ? String(mapped.generalObservations).trim() : undefined,
    });
  }

  return results;
}

type ImportPreview = {
  total: number;
  newCount: number;
  existingCount: number;
  noKeyCount: number;
  existingItems: { tipoNorma: string; number: string }[];
};

function analyzeImport(
  parsed: CreateLegislationBody[],
  existing: { tipoNorma?: string | null; number?: string | null }[]
): ImportPreview {
  const existingKeys = new Set<string>();
  for (const leg of existing) {
    if (leg.tipoNorma && leg.number) {
      existingKeys.add(`${leg.tipoNorma.trim().toLowerCase()}::${leg.number.trim().toLowerCase()}`);
    }
  }

  let newCount = 0;
  let existingCount = 0;
  let noKeyCount = 0;
  const existingItems: { tipoNorma: string; number: string }[] = [];

  for (const item of parsed) {
    const tipo = item.tipoNorma?.trim();
    const num = item.number?.trim();
    if (!tipo || !num) {
      noKeyCount++;
      continue;
    }
    const key = `${tipo.toLowerCase()}::${num.toLowerCase()}`;
    if (existingKeys.has(key)) {
      existingCount++;
      if (existingItems.length < 10) {
        existingItems.push({ tipoNorma: tipo, number: num });
      }
    } else {
      newCount++;
      existingKeys.add(key);
    }
  }

  return { total: parsed.length, newCount, existingCount, noKeyCount, existingItems };
}

type ImportResultType = {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  total: number;
  errorDetails?: { index: number; title: string; error: string }[];
};

export default function LegislacoesPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  
  const { data: legislations, isLoading } = useListLegislations(
    orgId!, 
    { search, level: levelFilter || undefined }, 
    { query: { queryKey: getListLegislationsQueryKey(orgId!), enabled: !!orgId } }
  );

  const createMut = useCreateLegislation();
  const importMut = useImportLegislations();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2>(1);
  const [importLevel, setImportLevel] = useState("federal");
  const [importResult, setImportResult] = useState<ImportResultType | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [conflictStrategy, setConflictStrategy] = useState<"skip" | "update">("skip");
  
  const form = useForm({
    defaultValues: {
      title: "", number: "", description: "", level: "federal", publicationDate: "", sourceUrl: "", applicableArticles: ""
    }
  });

  const onCreateSubmit = async (data: { title: string; number: string; description: string; level: string; publicationDate: string; sourceUrl: string; applicableArticles: string }) => {
    if (!orgId) return;
    const body: CreateLegislationBody = {
      title: data.title,
      number: data.number || undefined,
      description: data.description || undefined,
      level: data.level,
      publicationDate: data.publicationDate || undefined,
      sourceUrl: data.sourceUrl || undefined,
      applicableArticles: data.applicableArticles || undefined,
    };
    await createMut.mutateAsync({ orgId, data: body });
    queryClient.invalidateQueries({ queryKey: getListLegislationsQueryKey(orgId) });
    setIsCreateOpen(false);
    form.reset();
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result as ArrayBuffer;
      const rows = parseXlsxRows(data, importLevel);
      const preview = analyzeImport(rows, legislations || []);
      setImportPreview(preview);
      setPendingFile(file);
    };
    reader.readAsArrayBuffer(file);
  };

  const onConfirmImport = async () => {
    if (!orgId || !pendingFile) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = ev.target?.result as ArrayBuffer;
      const mapped = parseXlsxRows(data, importLevel);
      
      if (mapped.length > 0) {
        const result = await importMut.mutateAsync({ orgId, data: { legislations: mapped, conflictStrategy } });
        setImportResult(result as ImportResultType);
        queryClient.invalidateQueries({ queryKey: getListLegislationsQueryKey(orgId) });
      }
    };
    reader.readAsArrayBuffer(pendingFile);
  };

  const resetImport = () => {
    setImportResult(null);
    setImportPreview(null);
    setPendingFile(null);
    setConflictStrategy("skip");
    setImportStep(1);
    setIsImportOpen(false);
  };

  const headerActions = (
    <>
      <Button variant="secondary" onClick={() => setIsImportOpen(true)}>
        <Upload className="w-4 h-4 mr-2" /> Importar
      </Button>
      <Button onClick={() => setIsCreateOpen(true)}>
        <Plus className="w-4 h-4 mr-2" /> Nova Legislação
      </Button>
    </>
  );

  return (
    <AppLayout headerActions={headerActions}>
      <p className="text-[13px] text-muted-foreground mb-8">Requisitos legais aplicáveis à organização (ISO 14001).</p>

      <div className="flex flex-wrap gap-6 items-end mb-8">
        <div className="flex-1 min-w-[200px]">
          <Label>Buscar</Label>
          <Input 
            placeholder="Título ou número..." 
            className="mt-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-44">
          <Label>Esfera / Nível</Label>
          <Select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="mt-2">
            <option value="">Todos</option>
            <option value="federal">Federal</option>
            <option value="estadual">Estadual</option>
            <option value="municipal">Municipal</option>
            <option value="internacional">Internacional</option>
          </Select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-4">Título / Número</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Esfera</th>
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
                      <span className="text-muted-foreground text-xs">{leg.tipoNorma || '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="capitalize text-muted-foreground">{leg.level}</span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {formatDate(leg.publicationDate)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/app/qualidade/legislacoes/${leg.id}`} className="text-primary hover:underline font-medium inline-flex items-center cursor-pointer">
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
          <div>
            <Label>Nível / Esfera</Label>
            <Select {...form.register("level")}>
              <option value="federal">Federal</option>
              <option value="estadual">Estadual</option>
              <option value="municipal">Municipal</option>
              <option value="internacional">Internacional</option>
            </Select>
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

      <Dialog open={isImportOpen} onOpenChange={(open) => { if (!open) resetImport(); else setIsImportOpen(true); }} title="Importar Legislações">
        <div className="mt-4 space-y-5 text-sm">
          {importResult ? (
            <div className="py-4 space-y-4">
              <div className="text-center">
                <CheckCircle className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
                <p className="text-base font-semibold">Importação concluída</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                {importResult.created > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-700">{importResult.created}</p>
                    <p className="text-emerald-600">novas</p>
                  </div>
                )}
                {importResult.updated > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-700">{importResult.updated}</p>
                    <p className="text-blue-600">atualizadas</p>
                  </div>
                )}
                {importResult.skipped > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-gray-700">{importResult.skipped}</p>
                    <p className="text-gray-600">ignoradas</p>
                  </div>
                )}
                {importResult.errors > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{importResult.errors}</p>
                    <p className="text-red-600">erros</p>
                  </div>
                )}
              </div>
              {importResult.errorDetails && importResult.errorDetails.length > 0 && (
                <div className="text-left bg-red-50 border border-red-200 rounded-lg p-3 text-[12px] max-h-40 overflow-y-auto space-y-1">
                  <p className="font-semibold text-red-700 mb-1">Detalhes dos erros:</p>
                  {importResult.errorDetails.map((ed, i) => (
                    <p key={i} className="text-red-600">
                      <strong>Linha {ed.index + 1}:</strong> {ed.title} — {ed.error}
                    </p>
                  ))}
                </div>
              )}
              <div className="text-center">
                <Button onClick={resetImport} className="mt-1">Fechar</Button>
              </div>
            </div>
          ) : importStep === 1 ? (
            <>
              <div>
                <Label>Nível / Esfera das legislações</Label>
                <Select value={importLevel} onChange={(e) => { setImportLevel(e.target.value); setImportPreview(null); setPendingFile(null); }} className="mt-1">
                  <option value="federal">Federal</option>
                  <option value="estadual">Estadual</option>
                  <option value="municipal">Municipal</option>
                  <option value="internacional">Internacional</option>
                </Select>
              </div>

              <div className="border-2 border-dashed border-border rounded-xl p-6 text-center bg-secondary/30">
                <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-3">
                  Anexe um arquivo <strong>.xlsx</strong> ou <strong>.csv</strong>
                </p>
                <Input 
                  type="file" 
                  accept=".xlsx,.xls,.csv" 
                  className="max-w-[280px] mx-auto block"
                  onChange={onFileSelected}
                  disabled={importMut.isPending}
                />
              </div>

              {pendingFile && (
                <p className="text-[13px] text-muted-foreground text-center">
                  Arquivo selecionado: <strong>{pendingFile.name}</strong>
                </p>
              )}

              <div className="pt-2 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={resetImport}>Cancelar</Button>
                <Button 
                  onClick={() => setImportStep(2)} 
                  disabled={!pendingFile || !importPreview}
                >
                  Continuar
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <div className="bg-secondary/50 border border-border rounded-xl p-4">
                  <p className="font-medium text-foreground mb-3">Análise da planilha</p>
                  <div className="grid grid-cols-3 gap-3 text-center text-[13px]">
                    <div>
                      <p className="text-xl font-bold text-emerald-600">{importPreview?.newCount ?? 0}</p>
                      <p className="text-muted-foreground">novas</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-amber-600">{importPreview?.existingCount ?? 0}</p>
                      <p className="text-muted-foreground">já cadastradas</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-gray-500">{importPreview?.noKeyCount ?? 0}</p>
                      <p className="text-muted-foreground">sem tipo/número</p>
                    </div>
                  </div>
                </div>

                {importPreview && importPreview.existingCount > 0 && (
                  <div className="space-y-2">
                    <p className="text-[13px] font-medium text-foreground">
                      {importPreview.existingCount} legislações já existem (identificadas por Tipo + Número). O que fazer com elas?
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setConflictStrategy("skip")}
                        className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                          conflictStrategy === "skip"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/30"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <SkipForward className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-[13px]">Ignorar</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Manter os dados atuais sem alteração</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConflictStrategy("update")}
                        className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                          conflictStrategy === "update"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/30"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <RefreshCw className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-[13px]">Atualizar</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Sobrescrever com os dados da planilha</p>
                      </button>
                    </div>

                    {importPreview.existingItems.length > 0 && (
                      <details className="text-[12px] text-muted-foreground">
                        <summary className="cursor-pointer hover:text-foreground">
                          Ver exemplos de legislações já cadastradas ({importPreview.existingCount > 10 ? `mostrando 10 de ${importPreview.existingCount}` : importPreview.existingCount})
                        </summary>
                        <ul className="mt-1 space-y-0.5 pl-4 list-disc">
                          {importPreview.existingItems.map((item, i) => (
                            <li key={i}>{item.tipoNorma} {item.number}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setImportStep(1)}>Voltar</Button>
                <Button 
                  onClick={onConfirmImport} 
                  disabled={!pendingFile || !importPreview || importPreview.total === 0 || importMut.isPending}
                  isLoading={importMut.isPending}
                >
                  Importar ({importPreview?.total || 0})
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </AppLayout>
  );
}
