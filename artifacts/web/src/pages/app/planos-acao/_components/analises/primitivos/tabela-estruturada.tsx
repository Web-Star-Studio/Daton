import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";

export type ColunaTexto<R> = {
  kind: "text";
  key: keyof R & string;
  header: string;
  placeholder?: string;
  width?: string;
};
export type ColunaSelect<R> = {
  kind: "select";
  key: keyof R & string;
  header: string;
  options: Array<{ value: string; label: string }>;
  width?: string;
};
export type ColunaCalculada<R> = {
  kind: "computed";
  header: string;
  width?: string;
  render: (row: R) => React.ReactNode;
};
export type Coluna<R> = ColunaTexto<R> | ColunaSelect<R> | ColunaCalculada<R>;

/**
 * Linhas com campos tipados — nada de campo aberto onde há vocabulário fechado: a coluna
 * `select` só aceita os valores que ela oferece, e a `computed` o usuário não digita.
 *
 * Renderiza EMPILHADO (um bloco por linha, cada campo rotulado), não como tabela larga: a
 * coluna da ficha nunca passa de ~438px, e um FMEA de 9 colunas ali virava rolagem
 * horizontal que escondia justamente o RPN. Empilhado, tudo fica visível e legível — e os
 * rótulos longos dos selects (ex.: "8 — Perda total de função") cabem inteiros.
 *
 * Quando a primeira coluna é `computed`, ela vira o TÍTULO do bloco em vez de mais um campo
 * — é o caso das 4 dimensões fixas do Kepner-Tregoe.
 */
export function TabelaEstruturada<R extends { id: string }>({
  colunas,
  rows,
  onChange,
  onAdd,
  addLabel = "Adicionar linha",
  readOnly = false,
  /** Linhas estruturais (ex.: as 4 dimensões do Kepner-Tregoe) não se adicionam nem se removem. */
  fixedRows = false,
  rowClassName,
}: {
  colunas: ReadonlyArray<Coluna<R>>;
  rows: R[];
  onChange: (next: R[]) => void;
  onAdd?: () => void;
  addLabel?: string;
  readOnly?: boolean;
  fixedRows?: boolean;
  rowClassName?: (row: R) => string | undefined;
}) {
  const setCell = (id: string, key: string, value: unknown) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)));

  const [primeira, ...demais] = colunas;
  const tituloCol = primeira?.kind === "computed" ? primeira : null;
  const campos = tituloCol ? demais : colunas;

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-[13px] text-muted-foreground">
          Nenhuma linha ainda.
        </p>
      ) : (
        rows.map((row) => (
          <div
            key={row.id}
            className={cn(
              "rounded-lg border bg-background p-2.5",
              rowClassName?.(row),
            )}
          >
            {(tituloCol || (!readOnly && !fixedRows)) && (
              <div className="mb-1.5 flex items-start justify-between gap-2">
                {tituloCol ? (
                  <p className="text-[12px] font-semibold text-foreground">
                    {tituloCol.render(row)}
                  </p>
                ) : (
                  <span />
                )}
                {!readOnly && !fixedRows && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="-mr-1 -mt-1 h-6 w-6 shrink-0 text-muted-foreground"
                    aria-label="Remover linha"
                    onClick={() =>
                      onChange(rows.filter((r) => r.id !== row.id))
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}

            <div className="@container">
              <div className="grid gap-x-3 gap-y-1.5 @xl:grid-cols-2">
                {campos.map((coluna) => (
                  <div key={coluna.header}>
                    <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {coluna.header}
                    </label>
                    {coluna.kind === "computed" ? (
                      <div className="text-[13px]">{coluna.render(row)}</div>
                    ) : coluna.kind === "select" ? (
                      <SearchableSelect
                        value={
                          (row[coluna.key] as string | undefined)?.toString() ??
                          ""
                        }
                        onChange={(v) =>
                          setCell(row.id, coluna.key, v || undefined)
                        }
                        options={coluna.options}
                        placeholder="—"
                        searchPlaceholder="Buscar..."
                        emptyMessage="Sem opções"
                        disabled={readOnly}
                      />
                    ) : (
                      <Input
                        className="h-8 text-[13px]"
                        value={(row[coluna.key] as string | undefined) ?? ""}
                        placeholder={coluna.placeholder}
                        readOnly={readOnly}
                        onChange={(e) =>
                          setCell(row.id, coluna.key, e.target.value)
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))
      )}

      {!readOnly && !fixedRows && onAdd && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={onAdd}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {addLabel}
        </Button>
      )}
    </div>
  );
}
