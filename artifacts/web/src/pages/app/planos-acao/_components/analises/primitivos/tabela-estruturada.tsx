import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";

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

/** Tabela de linhas com colunas tipadas. Nada de campo aberto onde há vocabulário fechado:
 *  a coluna `select` só aceita os valores que ela oferece, e a `computed` o usuário não digita. */
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

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b bg-muted/40">
              {colunas.map((c) => (
                <th
                  key={c.header}
                  className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
              {!readOnly && !fixedRows && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={rowClassName?.(row)}>
                {colunas.map((coluna) => (
                  <td
                    key={coluna.header}
                    className="border-t px-1.5 py-1 align-top"
                  >
                    {coluna.kind === "computed" ? (
                      <div className="px-1 py-1.5">{coluna.render(row)}</div>
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
                        className="h-8 border-0 bg-transparent px-1 text-[13px] shadow-none focus-visible:ring-1"
                        value={(row[coluna.key] as string | undefined) ?? ""}
                        placeholder={coluna.placeholder}
                        readOnly={readOnly}
                        onChange={(e) =>
                          setCell(row.id, coluna.key, e.target.value)
                        }
                      />
                    )}
                  </td>
                ))}
                {!readOnly && !fixedRows && (
                  <td className="border-t px-1 py-1 align-top">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      aria-label="Remover linha"
                      onClick={() =>
                        onChange(rows.filter((r) => r.id !== row.id))
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={colunas.length + 1}
                  className="border-t px-3 py-4 text-center text-[13px] text-muted-foreground"
                >
                  Nenhuma linha ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
