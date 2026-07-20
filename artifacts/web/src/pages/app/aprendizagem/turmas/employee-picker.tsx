import React, { useMemo, useState } from "react";
import {
  useListEmployees,
  getListEmployeesQueryKey,
} from "@workspace/api-client-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Input } from "@/components/ui/input";

const PAGE_SIZE = 50;

/**
 * Lista de colaboradores com busca (server-side) e seleção por checkbox.
 * Compartilhada entre o passo 3 do "Nova turma" e o diálogo de inscrição de uma
 * turma já criada — para que os dois fluxos se comportem igual.
 *
 * `enrolledIds` marca quem já está inscrito: aparece travado, com selo, em vez
 * de sumir da lista. Some-los faria o operador achar que o colaborador não
 * existe; o backend também dedup (unique class_id+employee_id), então
 * reinscrever seria um no-op silencioso.
 */
export function EmployeePicker({
  orgId,
  enabled = true,
  selected,
  onChange,
  enrolledIds,
}: {
  orgId: number;
  enabled?: boolean;
  selected: number[];
  onChange: (ids: number[]) => void;
  enrolledIds?: Set<number>;
}) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const params = {
    search: debouncedSearch || undefined,
    pageSize: PAGE_SIZE,
  };
  const { data: result, isLoading } = useListEmployees(orgId, params, {
    query: {
      enabled: !!orgId && enabled,
      queryKey: getListEmployeesQueryKey(orgId, params),
    },
  });
  const employees = useMemo(() => result?.data ?? [], [result]);
  const total = result?.pagination.total ?? employees.length;
  const hidden = Math.max(0, total - employees.length);

  const toggle = (id: number, checked: boolean) => {
    onChange(
      checked ? [...selected, id] : selected.filter((eid) => eid !== id),
    );
  };

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar colaborador..."
      />
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
        {employees.map((emp) => {
          const already = enrolledIds?.has(emp.id) ?? false;
          const checked = already || selected.includes(emp.id);
          return (
            <label
              key={emp.id}
              className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
                already
                  ? "cursor-default text-muted-foreground"
                  : "cursor-pointer hover:bg-muted/50"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={already}
                onChange={(e) => toggle(emp.id, e.target.checked)}
              />
              <span className="flex-1 truncate">{emp.name}</span>
              {already ? (
                <span className="shrink-0 text-[10px] uppercase tracking-wide">
                  Já inscrito
                </span>
              ) : null}
            </label>
          );
        })}
        {isLoading ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Carregando...
          </p>
        ) : employees.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Nenhum colaborador encontrado.
          </p>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.length} selecionado(s)
        {hidden > 0 ? (
          <>
            {" · "}
            mostrando {employees.length} de {total} — refine a busca para ver os
            demais
          </>
        ) : null}
      </p>
    </div>
  );
}
