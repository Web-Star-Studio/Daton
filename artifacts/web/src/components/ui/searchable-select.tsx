import { useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronsUpDown, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchableOption = {
  value: string;
  label: string;
};

export type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  isLoading?: boolean;
  disabled?: boolean;
  /**
   * Quando definido, habilita a criação inline: se o texto buscado não casar
   * (case-insensitive) com nenhuma opção, surge um item "Adicionar …" que chama
   * este callback com o texto digitado (já trimado). Use para catálogos que o
   * usuário pode ampliar (ex.: perspectivas do SWOT).
   */
  onCreateOption?: (label: string) => void;
  /** Rótulo do item de criação (padrão: `Adicionar "<texto>"`). */
  createOptionLabel?: (input: string) => string;
};

/**
 * Single-select combobox with search. Uses stable `value` identifiers
 * separate from displayed `label` — safe to use with options whose labels
 * may not be unique (e.g. users with duplicate names).
 *
 * For a simpler string-based variant (when labels are always unique),
 * see SearchableStringSelect.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Selecione...",
  searchPlaceholder = "Buscar...",
  emptyMessage = "Nenhum resultado.",
  isLoading,
  disabled,
  onCreateOption,
  createOptionLabel = (input) => `Adicionar “${input}”`,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((o) => o.value === value);

  const trimmed = search.trim();
  const hasExactMatch = options.some(
    (o) => o.label.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  // Item de criação inline: só quando habilitado, há texto e nada casa exatamente.
  const showCreate = !!onCreateOption && trimmed.length > 0 && !hasExactMatch;

  function handleCreate() {
    if (!onCreateOption || !trimmed) return;
    onCreateOption(trimmed);
    setSearch("");
    setOpen(false);
  }

  return (
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
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate text-left">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0"
      >
        <CommandPrimitive loop className="overflow-hidden rounded-md bg-popover">
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
            {isLoading && options.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                Carregando...
              </div>
            ) : (
              // Quando há item de criação, ele substitui o estado vazio.
              !showCreate && (
                <CommandPrimitive.Empty className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {emptyMessage}
                </CommandPrimitive.Empty>
              )
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
            {value && (
              <CommandPrimitive.Item
                value="__clear__"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground data-[selected=true]:bg-muted"
              >
                <X className="h-3.5 w-3.5" /> Limpar seleção
              </CommandPrimitive.Item>
            )}
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <CommandPrimitive.Item
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-muted"
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                </CommandPrimitive.Item>
              );
            })}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}
