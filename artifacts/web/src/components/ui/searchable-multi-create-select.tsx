import { useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronsUpDown, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { SearchableOption } from "@/components/ui/searchable-select";

export type SearchableMultiCreateSelectProps = {
  /** Nomes selecionados (grafia exata escolhida/criada). */
  values: string[];
  onChange: (values: string[]) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  /**
   * Habilita criação inline: se o texto buscado não casar (case-insensitive) com
   * nenhuma opção nem com um valor já selecionado, surge um item "Criar …" que
   * adiciona o texto digitado (trimado) à seleção. A persistência do novo item
   * (ex.: cadastrar no catálogo) fica a cargo de quem consome, ao confirmar.
   */
  allowCreate?: boolean;
  createOptionLabel?: (input: string) => string;
};

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Combobox de múltipla seleção com busca e criação inline, chaveado por NOME
 * (string). Ao contrário do {@link SearchableSelect} (single), o popover
 * permanece aberto ao marcar/desmarcar, para o usuário selecionar vários itens
 * em sequência. Os selecionados aparecem como chips removíveis abaixo do gatilho.
 *
 * Para múltipla seleção chaveada por id numérico e sem criação inline, ver
 * {@link SearchableMultiSelect}.
 */
export function SearchableMultiCreateSelect({
  values,
  onChange,
  options,
  placeholder = "Selecione...",
  searchPlaceholder = "Buscar...",
  emptyMessage = "Nenhum resultado.",
  disabled,
  allowCreate,
  createOptionLabel = (input) => `Criar “${input}”`,
}: SearchableMultiCreateSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const isSelected = (value: string) => values.some((v) => sameName(v, value));

  const toggle = (value: string) => {
    if (isSelected(value)) {
      onChange(values.filter((v) => !sameName(v, value)));
    } else {
      onChange([...values, value]);
    }
  };

  const remove = (value: string) => onChange(values.filter((v) => v !== value));

  const trimmed = search.trim();
  const matchesOption = options.some((o) => sameName(o.label, trimmed));
  const matchesSelected = values.some((v) => sameName(v, trimmed));
  // Item de criação: habilitado, com texto, sem casar opção nem seleção atual.
  const showCreate =
    !!allowCreate && trimmed.length > 0 && !matchesOption && !matchesSelected;

  const handleCreate = () => {
    if (!trimmed) return;
    onChange([...values, trimmed]);
    setSearch("");
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "h-9 w-full justify-between font-normal",
              values.length === 0 && "text-muted-foreground",
            )}
          >
            <span className="truncate text-left">
              {values.length === 0
                ? placeholder
                : `${values.length} ${
                    values.length === 1 ? "selecionada" : "selecionadas"
                  }`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0"
        >
          <CommandPrimitive
            loop
            className="overflow-hidden rounded-md bg-popover"
          >
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              <CommandPrimitive.Input
                value={search}
                onValueChange={setSearch}
                placeholder={searchPlaceholder}
                className="h-10 w-full border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
              />
            </div>
            <CommandPrimitive.List className="max-h-64 overflow-y-auto p-1">
              {/* Quando há item de criação, ele substitui o estado vazio. */}
              {!showCreate && (
                <CommandPrimitive.Empty className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {emptyMessage}
                </CommandPrimitive.Empty>
              )}
              {showCreate && (
                <CommandPrimitive.Item
                  forceMount
                  value={`__create__${trimmed}`}
                  onSelect={handleCreate}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-primary data-[selected=true]:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{createOptionLabel(trimmed)}</span>
                </CommandPrimitive.Item>
              )}
              {options.map((opt, i) => {
                const checked = isSelected(opt.value);
                // Chave do cmdk = value único e não-vazio (mesma proteção do
                // SearchableSelect); `keywords` mantém a busca por nome.
                const cmdkValue = opt.value || `__opt_${i}`;
                return (
                  <CommandPrimitive.Item
                    key={cmdkValue}
                    value={cmdkValue}
                    keywords={[opt.label]}
                    // Não fechamos o popover: seleção contínua de vários itens.
                    onSelect={() => toggle(opt.value)}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-muted"
                  >
                    <span className="truncate">{opt.label}</span>
                    {checked && <Check className="h-3.5 w-3.5 text-primary" />}
                  </CommandPrimitive.Item>
                );
              })}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverContent>
      </Popover>

      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[12px] text-secondary-foreground"
            >
              <span className="max-w-[220px] truncate">{v}</span>
              <button
                type="button"
                aria-label={`Remover ${v}`}
                onClick={() => remove(v)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
