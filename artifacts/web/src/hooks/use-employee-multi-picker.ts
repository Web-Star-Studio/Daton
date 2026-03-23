import { useEffect, useMemo, useState } from "react";
import {
  getListEmployeesQueryKey,
  useListEmployees,
} from "@workspace/api-client-react";
import { keepPreviousData } from "@tanstack/react-query";

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 300;

function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(id);
  }, [delay, value]);

  return debouncedValue;
}

type EmployeeOption = { id: number; name: string; email?: string | null };

type UseEmployeeMultiPickerParams = {
  orgId: number | undefined;
  selectedIds: number[];
  enabled?: boolean;
  /** Pre-seed the cache with known employees (e.g. from doc.elaborators in edit mode). */
  initialEmployees?: EmployeeOption[];
};

export function useEmployeeMultiPicker({
  orgId,
  selectedIds,
  enabled = true,
  initialEmployees,
}: UseEmployeeMultiPickerParams) {
  const [searchValue, setSearchValue] = useState("");
  const debouncedSearch = useDebouncedValue(searchValue, DEBOUNCE_MS);

  // Cache of employee display data so selected employees remain visible
  // even when they fall outside the current search results.
  const [cache, setCache] = useState<Map<number, EmployeeOption>>(() => {
    const map = new Map<number, EmployeeOption>();
    if (initialEmployees) {
      for (const emp of initialEmployees) {
        map.set(emp.id, emp);
      }
    }
    return map;
  });

  // Seed cache when initialEmployees changes (e.g. edit dialog opens with doc data).
  useEffect(() => {
    if (!initialEmployees || initialEmployees.length === 0) return;
    setCache((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const emp of initialEmployees) {
        if (!next.has(emp.id)) {
          next.set(emp.id, emp);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [initialEmployees]);

  const employeesQuery = useListEmployees(
    orgId!,
    {
      page: 1,
      pageSize: PAGE_SIZE,
      search: debouncedSearch || undefined,
    },
    {
      query: {
        queryKey: getListEmployeesQueryKey(orgId!, {
          page: 1,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
        }),
        enabled: !!orgId && enabled,
        placeholderData: keepPreviousData,
      },
    },
  );

  const searchResults = employeesQuery.data?.data ?? [];

  // Grow the cache with every batch of search results.
  useEffect(() => {
    if (searchResults.length === 0) return;
    setCache((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const emp of searchResults) {
        if (!next.has(emp.id)) {
          next.set(emp.id, { id: emp.id, name: emp.name, email: emp.email });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [searchResults]);

  // Merge: always show selected employees (from cache) + current search results.
  const options = useMemo(() => {
    const byId = new Map<number, EmployeeOption>();

    // Selected employees first so they stay visible.
    for (const id of selectedIds) {
      const cached = cache.get(id);
      if (cached) byId.set(id, cached);
    }

    // Then search results.
    for (const emp of searchResults) {
      if (!byId.has(emp.id)) {
        byId.set(emp.id, { id: emp.id, name: emp.name, email: emp.email });
      }
    }

    return [...byId.values()];
  }, [searchResults, selectedIds, cache]);

  return {
    options,
    searchValue,
    setSearchValue,
    isLoading: employeesQuery.isLoading,
    isFetching: employeesQuery.isFetching,
  };
}
