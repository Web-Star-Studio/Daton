import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ItemAgrupado<C extends string> = {
  id: string;
  category: C;
  text: string;
};

export function ListaAgrupada<C extends string>({
  categorias,
  rotulos,
  itens,
  onChange,
  selectedId,
  onSelect,
  readOnly = false,
  novoItem,
}: {
  categorias: ReadonlyArray<C>;
  rotulos: Record<C, string>;
  itens: Array<ItemAgrupado<C>>;
  onChange: (next: Array<ItemAgrupado<C>>) => void;
  /** Quando presente, cada item ganha um rádio "causa mais provável". */
  selectedId?: string;
  onSelect?: (id: string | undefined) => void;
  readOnly?: boolean;
  novoItem: (category: C) => ItemAgrupado<C>;
}) {
  // Colunas por CONTAINER, não por viewport: esta lista vive numa coluna da ficha, e um
  // `sm:grid-cols-3` daria 3 colunas de ~110px mesmo numa tela de 1920px — o texto da causa
  // ficava ilegível. Com `@container`, só divide em colunas quando há largura de verdade.
  return (
    <div className="@container">
      <div className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
        {categorias.map((categoria) => {
          const doGrupo = itens.filter((i) => i.category === categoria);
          return (
            <div key={categoria} className="rounded-lg border bg-muted/20 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {rotulos[categoria]}
              </p>
              <div className="space-y-1.5">
                {doGrupo.map((item) => (
                  <div key={item.id} className="flex items-center gap-1.5">
                    {onSelect && (
                      <input
                        type="radio"
                        name="ishikawa-causa-provavel"
                        className="shrink-0 cursor-pointer"
                        checked={selectedId === item.id}
                        disabled={readOnly}
                        onChange={() => onSelect(item.id)}
                        aria-label={`Marcar "${item.text || "causa"}" como causa mais provável`}
                      />
                    )}
                    <Input
                      className={cn(
                        "h-8 text-[13px]",
                        selectedId === item.id && "border-primary",
                      )}
                      value={item.text}
                      readOnly={readOnly}
                      placeholder="Causa"
                      onChange={(e) =>
                        onChange(
                          itens.map((i) =>
                            i.id === item.id
                              ? { ...i, text: e.target.value }
                              : i,
                          ),
                        )
                      }
                    />
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground"
                        aria-label="Remover causa"
                        onClick={() => {
                          // A causa selecionada some junto — quem escolher outra reativa o vínculo.
                          if (selectedId === item.id) onSelect?.(undefined);
                          onChange(itens.filter((i) => i.id !== item.id));
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onChange([...itens, novoItem(categoria)])}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Causa
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
