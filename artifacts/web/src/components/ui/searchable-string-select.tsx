import { useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchableStringSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
};

export function SearchableStringSelect({
  value,
  onChange,
  options,
  placeholder = "Selecione...",
  searchPlaceholder = "Buscar...",
  emptyMessage = "Nenhum resultado.",
  searchValue,
  onSearchChange,
  isLoading,
  disabled,
}: SearchableStringSelectProps) {
  const [open, setOpen] = useState(false);
  const [internalSearch, setInternalSearch] = useState("");
  const serverFiltered = onSearchChange !== undefined;
  const currentSearch = serverFiltered ? (searchValue ?? "") : internalSearch;
  const handleSearchChange = serverFiltered ? onSearchChange : setInternalSearch;
  const showLegacy = value !== "" && !options.includes(value);

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
          <span className="truncate text-left">{value || placeholder}</span>
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
          filter={serverFiltered ? () => 1 : undefined}
          className="overflow-hidden rounded-md bg-popover"
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            <CommandPrimitive.Input
              value={currentSearch}
              onValueChange={handleSearchChange}
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
              <CommandPrimitive.Empty className="px-3 py-4 text-center text-xs text-muted-foreground">
                {emptyMessage}
              </CommandPrimitive.Empty>
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
            {showLegacy && (
              <CommandPrimitive.Item
                key={`__legacy_${value}`}
                value={value}
                onSelect={() => {
                  onChange(value);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-muted"
              >
                <span className="truncate">{value}</span>
                <Check className="h-3.5 w-3.5 text-primary" />
              </CommandPrimitive.Item>
            )}
            {options.map((opt) => {
              const isSelected = opt === value;
              return (
                <CommandPrimitive.Item
                  key={opt}
                  value={opt}
                  onSelect={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-muted"
                >
                  <span className="truncate">{opt}</span>
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
