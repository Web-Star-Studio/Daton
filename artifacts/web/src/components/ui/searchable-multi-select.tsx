import { useMemo, useState, type ReactNode } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchableMultiSelectOption = {
  value: number;
  label: string;
  keywords?: string[];
};

type SearchableMultiSelectProps = {
  options: SearchableMultiSelectOption[];
  selected: number[];
  onToggle: (id: number) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  onToggleAll?: () => void;
  selectAllLabel?: string;
  disabled?: boolean;
  className?: string;
  renderSummary?: (selectedOptions: SearchableMultiSelectOption[]) => ReactNode;
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function formatSelectionSummary(selectedOptions: SearchableMultiSelectOption[]) {
  if (selectedOptions.length === 0) return "";

  const joinedLabels = selectedOptions.map((option) => option.label).join(", ");
  if (joinedLabels.length <= 48) return joinedLabels;

  return `${selectedOptions.length} selecionado${
    selectedOptions.length > 1 ? "s" : ""
  }`;
}

export function SearchableMultiSelect({
  options,
  selected,
  onToggle,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  onToggleAll,
  selectAllLabel,
  disabled = false,
  className,
  renderSummary,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const selectedOptions = useMemo(
    () => options.filter((option) => selected.includes(option.value)),
    [options, selected],
  );

  const summary = renderSummary
    ? renderSummary(selectedOptions)
    : formatSelectionSummary(selectedOptions);

  const allSelected = options.length > 0 && selectedOptions.length === options.length;

  return (
    <div className={cn("mt-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "min-h-10 w-full justify-between border-border bg-popover px-3 py-2 text-left font-normal hover:bg-popover",
              selectedOptions.length === 0 && "text-muted-foreground",
            )}
          >
            <span className="truncate text-sm">
              {selectedOptions.length > 0 ? summary : placeholder}
            </span>
            <ChevronsUpDown className="ml-3 h-4 w-4 shrink-0 text-muted-foreground/70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          collisionPadding={16}
          className="w-[var(--radix-popover-trigger-width)] min-w-[320px] max-w-[min(40rem,calc(100vw-2rem))] overflow-hidden rounded-xl border-border bg-popover p-0 shadow-xl"
        >
          <CommandPrimitive
            loop
            className="overflow-hidden rounded-xl bg-popover"
            filter={(itemValue, search, keywords) => {
              const haystack = normalizeSearch(
                [itemValue, ...(keywords ?? [])].join(" "),
              );
              const term = normalizeSearch(search);
              return term.length === 0 || haystack.includes(term) ? 1 : 0;
            }}
          >
            <div className="flex items-center gap-2 border-b border-border bg-popover px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              <CommandPrimitive.Input
                placeholder={searchPlaceholder}
                className="h-11 w-full border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
              />
            </div>
            <CommandPrimitive.List className="max-h-72 overflow-y-auto p-1">
              <CommandPrimitive.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </CommandPrimitive.Empty>
              {onToggleAll ? (
                <CommandPrimitive.Item
                  value={selectAllLabel || "Selecionar todas"}
                  onSelect={() => onToggleAll()}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left outline-none data-[selected=true]:bg-muted"
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0 text-primary",
                      allSelected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate text-sm font-medium">
                    {selectAllLabel || "Selecionar todas"}
                  </span>
                </CommandPrimitive.Item>
              ) : null}
              {options.map((option) => {
                const isSelected = selected.includes(option.value);

                return (
                  <CommandPrimitive.Item
                    key={option.value}
                    value={`${option.label} ${option.value}`}
                    keywords={option.keywords ?? []}
                    onSelect={() => onToggle(option.value)}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left outline-none data-[selected=true]:bg-muted"
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0 text-primary",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate text-sm">{option.label}</span>
                  </CommandPrimitive.Item>
                );
              })}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverContent>
      </Popover>
    </div>
  );
}
