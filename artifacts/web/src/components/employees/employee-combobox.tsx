import { useMemo, useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import type { Employee } from "@workspace/api-client-react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type EmployeeComboboxProps = {
  employees: Employee[];
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getEmployeeMeta(employee: Employee) {
  const parts = [employee.department, employee.position, employee.email]
    .map((item) => item?.trim())
    .filter(Boolean);

  return parts.join(" • ");
}

export function EmployeeCombobox({
  employees,
  value,
  onChange,
  placeholder = "Selecione um colaborador",
  searchPlaceholder = "Buscar colaborador...",
  emptyMessage = "Nenhum colaborador encontrado.",
  disabled = false,
  className,
}: EmployeeComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === value) ?? null,
    [employees, value],
  );

  const selectedMeta = selectedEmployee ? getEmployeeMeta(selectedEmployee) : "";

  return (
    <div className={cn("mt-2 flex items-start gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label="Selecionar colaborador"
            disabled={disabled}
            className={cn(
              "min-h-10 flex-1 justify-between border-border bg-popover px-3 py-2 text-left font-normal hover:bg-popover",
              !selectedEmployee && "text-muted-foreground",
            )}
          >
            <div className="min-w-0 flex-1">
              {selectedEmployee ? (
                <>
                  <div className="truncate text-sm text-foreground">
                    {selectedEmployee.name}
                  </div>
                  {selectedMeta ? (
                    <div className="truncate text-[11px] text-muted-foreground">
                      {selectedMeta}
                    </div>
                  ) : null}
                </>
              ) : (
                <span className="truncate text-sm">{placeholder}</span>
              )}
            </div>
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
              {employees.map((employee) => {
                const meta = getEmployeeMeta(employee);
                const isSelected = employee.id === selectedEmployee?.id;

                return (
                  <CommandPrimitive.Item
                    key={employee.id}
                    value={`${employee.name} ${employee.email ?? ""} ${employee.id}`}
                    keywords={[
                      employee.email ?? "",
                      employee.department ?? "",
                      employee.position ?? "",
                      employee.unitName ?? "",
                    ]}
                    onSelect={() => {
                      onChange(employee.id);
                      setOpen(false);
                    }}
                    className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2 text-left outline-none data-[selected=true]:bg-muted"
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0 text-primary",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {employee.name}
                      </div>
                      {meta ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {meta}
                        </div>
                      ) : null}
                    </div>
                  </CommandPrimitive.Item>
                );
              })}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverContent>
      </Popover>

      {selectedEmployee ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Limpar colaborador selecionado"
          onClick={() => onChange(null)}
          className="h-10 w-10 shrink-0 border-border bg-popover hover:bg-popover"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
