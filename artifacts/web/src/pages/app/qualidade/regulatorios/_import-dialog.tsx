import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  useImportRegulatoryDocuments,
  getListRegulatoryDocumentsQueryKey,
  type ImportRegulatoryDocumentRow,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// --- Template (mantém em sync com o backend e o service de import) ---
//
// Header em PT-BR exatamente como pedido. Uma linha de exemplo ajuda quem
// nunca importou — ela é DETECTADA E IGNORADA pelo parser do dialog (linhas
// com `unitName` igual ao exemplo "(exemplo)" são marcadas pra remover antes
// do POST). Bem mais útil que um header solto.

const TEMPLATE_HEADERS = [
  "filial",
  "tipo",
  "numero",
  "orgao",
  "processo",
  "responsavel_email",
  "emissao",
  "validade",
  "alerta_dias",
  "requer_renovacao",
  "observacoes",
] as const;

type TemplateHeader = (typeof TEMPLATE_HEADERS)[number];

// Linha de exemplo. O `(exemplo)` no campo "filial" é o sinal pra ignorar.
const TEMPLATE_EXAMPLE: Record<TemplateHeader, string> = {
  filial: "Matriz (exemplo)",
  tipo: "avcb",
  numero: "AVCB-12345/2026",
  orgao: "CB-PMSP",
  processo: "",
  responsavel_email: "responsavel@empresa.com",
  emissao: "01/01/2025",
  validade: "31/12/2026",
  alerta_dias: "30",
  requer_renovacao: "sim",
  observacoes: "Linha de exemplo — substitua pelos seus dados ou apague",
};

const IDENTIFIER_TYPES = new Set([
  "licenca_ambiental",
  "avcb",
  "alvara",
  "outorga",
  "certidao",
  "outro",
]);

// --- Helpers ---

function parseYesNo(raw: string | null | undefined): boolean | null {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase();
  if (!v) return null;
  if (v === "sim" || v === "true" || v === "s" || v === "1") return true;
  if (v === "nao" || v === "não" || v === "false" || v === "n" || v === "0") return false;
  return null;
}

function isDateValid(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const v = String(raw).trim();
  if (!v) return false;
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(v) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v);
}

function isExampleRow(filial: string): boolean {
  return filial.toLowerCase().includes("(exemplo)");
}

interface ParsedRow {
  index: number;          // 0-based among data rows
  spreadsheetRow: number; // 1-based row in the spreadsheet (header = 1)
  raw: Record<TemplateHeader, string>;
  payload: ImportRegulatoryDocumentRow | null;
  validationError: string | null;
  isExample: boolean;
}

function validateRow(raw: Record<TemplateHeader, string>): {
  payload: ImportRegulatoryDocumentRow | null;
  error: string | null;
} {
  const trimmed = (s: string | undefined): string => String(s ?? "").trim();

  const filial = trimmed(raw.filial);
  const tipo = trimmed(raw.tipo).toLowerCase();
  const orgao = trimmed(raw.orgao);
  const validade = trimmed(raw.validade);

  if (!filial) return { payload: null, error: "Coluna obrigatória: filial" };
  if (!tipo) return { payload: null, error: "Coluna obrigatória: tipo" };
  if (!IDENTIFIER_TYPES.has(tipo)) {
    return { payload: null, error: `Tipo inválido: "${tipo}" (use um de: ${[...IDENTIFIER_TYPES].join(", ")})` };
  }
  if (!orgao) return { payload: null, error: "Coluna obrigatória: orgao" };
  if (!validade) return { payload: null, error: "Coluna obrigatória: validade" };
  if (!isDateValid(validade)) {
    return { payload: null, error: "validade em formato inválido (use DD/MM/AAAA ou AAAA-MM-DD)" };
  }
  if (raw.emissao && trimmed(raw.emissao) && !isDateValid(raw.emissao)) {
    return { payload: null, error: "emissao em formato inválido (use DD/MM/AAAA ou AAAA-MM-DD)" };
  }
  let alertDays: number | undefined;
  if (trimmed(raw.alerta_dias)) {
    const n = Number(trimmed(raw.alerta_dias));
    if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
      return { payload: null, error: "alerta_dias deve ser um inteiro positivo" };
    }
    alertDays = n;
  }
  let renewalRequired: boolean | undefined;
  if (trimmed(raw.requer_renovacao)) {
    const v = parseYesNo(raw.requer_renovacao);
    if (v == null) {
      return { payload: null, error: "requer_renovacao deve ser sim/nao (ou true/false)" };
    }
    renewalRequired = v;
  }

  const payload: ImportRegulatoryDocumentRow = {
    unitName: filial,
    identifierType: tipo as ImportRegulatoryDocumentRow["identifierType"],
    issuingBody: orgao,
    expirationDate: validade,
    documentNumber: trimmed(raw.numero) || undefined,
    processNumber: trimmed(raw.processo) || undefined,
    responsibleUserEmail: trimmed(raw.responsavel_email) || undefined,
    issueDate: trimmed(raw.emissao) || undefined,
    alertDaysOverride: alertDays,
    renewalRequired,
    notes: trimmed(raw.observacoes) || undefined,
  };
  return { payload, error: null };
}

// --- Template download (.xlsx, Excel/Sheets-friendly) ---
//
// Modelo em XLSX (não CSV) — quando o cliente abre, salva e edita em Excel ou
// Google Sheets, não há prompt de "manter formato CSV?" e nem risco de perda
// de encoding. O backend aceita os dois formatos no upload, mas o template
// canônico vira o nativo do Excel.

function downloadTemplateXlsx() {
  // Linha 1 = header, linha 2 = exemplo (ignorado pelo backend porque a filial
  // "Filial exemplo" não existe — vira erro e o usuário aprende o formato sem
  // sujar a base).
  const rows: Array<Record<TemplateHeader, string>> = [
    TEMPLATE_EXAMPLE,
  ];
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...TEMPLATE_HEADERS] });
  // Largura confortável por coluna pra não ficar truncado.
  ws["!cols"] = TEMPLATE_HEADERS.map((h) => ({
    wch: Math.max(h.length, (TEMPLATE_EXAMPLE[h] ?? "").length, 14),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Documentos");
  // writeFile dispara download direto no navegador.
  XLSX.writeFile(wb, "modelo-documentos-regulatorios.xlsx");
}

// --- File parsers ---

function normalizeHeaderKey(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_");
}

function mapRowToTemplate(
  rawRow: Record<string, unknown>,
  headerMap: Map<string, TemplateHeader>,
): Record<TemplateHeader, string> {
  const out: Record<TemplateHeader, string> = {
    filial: "", tipo: "", numero: "", orgao: "", processo: "",
    responsavel_email: "", emissao: "", validade: "", alerta_dias: "",
    requer_renovacao: "", observacoes: "",
  };
  for (const [k, v] of Object.entries(rawRow)) {
    const normalized = normalizeHeaderKey(k);
    const mapped = headerMap.get(normalized);
    if (mapped) out[mapped] = String(v ?? "").trim();
  }
  return out;
}

function buildHeaderMap(headers: string[]): Map<string, TemplateHeader> {
  const map = new Map<string, TemplateHeader>();
  for (const h of headers) {
    const normalized = normalizeHeaderKey(h);
    if ((TEMPLATE_HEADERS as readonly string[]).includes(normalized)) {
      map.set(normalized, normalized as TemplateHeader);
    }
  }
  return map;
}

async function parseCsv(file: File): Promise<Record<TemplateHeader, string>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => normalizeHeaderKey(h),
      complete: (results) => {
        try {
          const headerMap = buildHeaderMap(results.meta.fields ?? []);
          const rows = (results.data as Record<string, unknown>[]).map((r) =>
            mapRowToTemplate(r, headerMap),
          );
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      },
      error: (err) => reject(err),
    });
  });
}

async function parseXlsx(file: File): Promise<Record<TemplateHeader, string>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  // Use default header detection (row 1), defval='' for empty cells.
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
  if (json.length === 0) return [];
  const headerMap = buildHeaderMap(Object.keys(json[0]));
  return json.map((r) => mapRowToTemplate(r, headerMap));
}

// --- The dialog ---

export interface RegulatoryImportDialogProps {
  orgId: number;
  open: boolean;
  onClose: () => void;
}

export function RegulatoryImportDialog({ orgId, open, onClose }: RegulatoryImportDialogProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const importMut = useImportRegulatoryDocuments();

  const summary = useMemo(() => {
    const valid = rows.filter((r) => !r.isExample && !r.validationError).length;
    const invalid = rows.filter((r) => !r.isExample && r.validationError).length;
    const examples = rows.filter((r) => r.isExample).length;
    return { valid, invalid, examples };
  }, [rows]);

  function resetState() {
    setFileName(null);
    setRows([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function processFile(file: File) {
    setParsing(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      let raw: Record<TemplateHeader, string>[];
      if (ext === "csv" || ext === "txt") {
        raw = await parseCsv(file);
      } else if (ext === "xlsx" || ext === "xls") {
        raw = await parseXlsx(file);
      } else {
        toast({ title: "Formato não suportado", description: "Use .csv ou .xlsx", variant: "destructive" });
        return;
      }

      const parsed: ParsedRow[] = raw.map((rawRow, index) => {
        const isExample = isExampleRow(rawRow.filial);
        if (isExample) {
          return {
            index,
            spreadsheetRow: index + 2,
            raw: rawRow,
            payload: null,
            validationError: null,
            isExample: true,
          };
        }
        // Linhas completamente vazias são ignoradas silenciosamente.
        const allEmpty = Object.values(rawRow).every((v) => !String(v ?? "").trim());
        if (allEmpty) {
          return {
            index,
            spreadsheetRow: index + 2,
            raw: rawRow,
            payload: null,
            validationError: null,
            isExample: true, // marca como "ignorar"
          };
        }
        const { payload, error } = validateRow(rawRow);
        return {
          index,
          spreadsheetRow: index + 2,
          raw: rawRow,
          payload,
          validationError: error,
          isExample: false,
        };
      });

      setRows(parsed);
      setFileName(file.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Erro ao ler arquivo", description: message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }

  async function handleConfirm() {
    const validRows = rows.filter((r) => !r.isExample && !r.validationError && r.payload);
    if (validRows.length === 0) {
      toast({ title: "Nenhuma linha válida para importar", variant: "destructive" });
      return;
    }
    try {
      const result = await importMut.mutateAsync({
        orgId,
        data: { rows: validRows.map((r) => r.payload!) },
      });
      queryClient.invalidateQueries({ queryKey: getListRegulatoryDocumentsQueryKey(orgId) });

      const errorCount = result.errors?.length ?? 0;
      const inserted = result.inserted ?? 0;
      const title = errorCount === 0
        ? `${inserted} documento${inserted === 1 ? "" : "s"} importado${inserted === 1 ? "" : "s"}`
        : `${inserted} importado${inserted === 1 ? "" : "s"} · ${errorCount} erro${errorCount === 1 ? "" : "s"}`;

      // Show server errors merged back into the table (mapped by spreadsheet row).
      if (errorCount > 0) {
        const errorByRow = new Map<number, string>();
        for (const e of result.errors) errorByRow.set(e.row, e.message);
        setRows((prev) =>
          prev.map((r) => {
            const serverError = errorByRow.get(r.spreadsheetRow);
            if (serverError) {
              return { ...r, validationError: serverError, payload: null };
            }
            // Se a linha foi enviada e o servidor não reportou erro, ela foi inserida.
            if (!r.isExample && !r.validationError) {
              return { ...r, validationError: null };
            }
            return r;
          }),
        );
        toast({
          title,
          description: "Veja os erros marcados na tabela. Corrija o arquivo e reenvie só as linhas que falharam.",
          variant: "destructive",
        });
      } else {
        toast({ title });
        resetState();
        onClose();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Erro ao importar", description: message, variant: "destructive" });
    }
  }

  function handleClose() {
    if (importMut.isPending) return;
    resetState();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) handleClose(); }}
      title="Importar documentos regulatórios"
      description="Baixe o modelo, preencha em Excel/Google Sheets, e suba o arquivo (.csv ou .xlsx)."
      size="xl"
    >
      <div className="flex flex-col gap-4">
        {/* Step 1: download template */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">1. Baixe o modelo</p>
            <p className="text-xs text-muted-foreground">
              CSV com cabeçalho em PT-BR e uma linha de exemplo (que será ignorada na importação).
            </p>
          </div>
          <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={downloadTemplateXlsx} type="button">
            <Download className="h-3.5 w-3.5 mr-1.5" /> Baixar modelo (.xlsx)
          </Button>
        </div>

        {/* Step 2: file picker / drop zone */}
        {!fileName ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 cursor-pointer transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
            }`}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {parsing ? "Lendo arquivo..." : "Arraste o arquivo aqui ou clique para selecionar"}
            </p>
            <p className="text-xs text-muted-foreground">.csv ou .xlsx</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border bg-card px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <p className="text-sm font-medium truncate">{fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {summary.valid} válida{summary.valid === 1 ? "" : "s"} ·{" "}
                  {summary.invalid} com erro{summary.invalid === 1 ? "" : "s"}
                  {summary.examples > 0 && ` · ${summary.examples} ignorada${summary.examples === 1 ? "" : "s"} (exemplo/vazia)`}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full sm:w-auto"
              onClick={resetState}
              disabled={importMut.isPending}
              type="button"
            >
              <X className="h-3.5 w-3.5 mr-1" /> Trocar arquivo
            </Button>
          </div>
        )}

        {/* Step 3: preview table */}
        {rows.length > 0 && (
          <div className="rounded-lg border max-h-[40vh] overflow-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-medium w-8">#</th>
                  <th className="text-left px-3 py-2 font-medium">Filial</th>
                  <th className="text-left px-3 py-2 font-medium">Tipo</th>
                  <th className="text-left px-3 py-2 font-medium">Nº</th>
                  <th className="text-left px-3 py-2 font-medium">Órgão</th>
                  <th className="text-left px-3 py-2 font-medium">Validade</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rowClass = r.isExample
                    ? "bg-zinc-50 text-muted-foreground italic dark:bg-zinc-900/30"
                    : r.validationError
                      ? "bg-red-50 dark:bg-red-500/10"
                      : "bg-green-50/40 dark:bg-green-500/5";
                  return (
                    <tr key={r.index} className={`border-t ${rowClass}`}>
                      <td className="px-3 py-1.5 align-top text-muted-foreground">{r.spreadsheetRow}</td>
                      <td className="px-3 py-1.5 align-top truncate max-w-[140px]" title={r.raw.filial}>{r.raw.filial}</td>
                      <td className="px-3 py-1.5 align-top">{r.raw.tipo}</td>
                      <td className="px-3 py-1.5 align-top truncate max-w-[140px]" title={r.raw.numero}>{r.raw.numero}</td>
                      <td className="px-3 py-1.5 align-top truncate max-w-[120px]" title={r.raw.orgao}>{r.raw.orgao}</td>
                      <td className="px-3 py-1.5 align-top">{r.raw.validade}</td>
                      <td className="px-3 py-1.5 align-top">
                        {r.isExample ? (
                          <span className="text-[10px]">ignorada</span>
                        ) : r.validationError ? (
                          <span className="flex items-start gap-1 text-red-700 dark:text-red-300">
                            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                            <span className="text-[10px]">{r.validationError}</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-green-700 dark:text-green-300">
                            <CheckCircle2 className="h-3 w-3" />
                            <span className="text-[10px]">pronta</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" size="sm" className="w-full sm:w-auto" onClick={handleClose} disabled={importMut.isPending}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          className="w-full sm:w-auto"
          onClick={handleConfirm}
          disabled={importMut.isPending || summary.valid === 0}
        >
          {importMut.isPending
            ? "Importando..."
            : summary.valid > 0
              ? `Confirmar importação (${summary.valid})`
              : "Confirmar importação"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
