import { useEffect, useMemo, useState } from "react";
import {
  getListDocumentsQueryKey,
  useListDocuments,
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

type DocumentOption = { id: number; title: string };

type UseDocumentMultiPickerParams = {
  orgId: number | undefined;
  selectedIds: number[];
  enabled?: boolean;
  initialDocuments?: DocumentOption[];
  /** Exclude these document IDs from the options (e.g. the current doc). */
  excludeIds?: number[];
};

export function useDocumentMultiPicker({
  orgId,
  selectedIds,
  enabled = true,
  initialDocuments,
  excludeIds,
}: UseDocumentMultiPickerParams) {
  const [searchValue, setSearchValue] = useState("");
  const debouncedSearch = useDebouncedValue(searchValue, DEBOUNCE_MS);

  const [cache, setCache] = useState<Map<number, DocumentOption>>(() => {
    const map = new Map<number, DocumentOption>();
    if (initialDocuments) {
      for (const d of initialDocuments) {
        map.set(d.id, d);
      }
    }
    return map;
  });

  useEffect(() => {
    if (!initialDocuments || initialDocuments.length === 0) return;
    setCache((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const d of initialDocuments) {
        if (!next.has(d.id)) {
          next.set(d.id, d);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [initialDocuments]);

  const docsQuery = useListDocuments(
    orgId!,
    {
      search: debouncedSearch || undefined,
      page: 1,
      pageSize: PAGE_SIZE,
    },
    {
      query: {
        queryKey: getListDocumentsQueryKey(orgId!, {
          search: debouncedSearch || undefined,
          page: 1,
          pageSize: PAGE_SIZE,
        }),
        enabled: !!orgId && enabled,
        placeholderData: keepPreviousData,
      },
    },
  );

  const searchResults = docsQuery.data ?? [];

  useEffect(() => {
    if (searchResults.length === 0) return;
    setCache((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const d of searchResults) {
        if (!next.has(d.id)) {
          next.set(d.id, { id: d.id, title: d.title });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [searchResults]);

  const excludeSet = useMemo(
    () => new Set(excludeIds ?? []),
    [excludeIds],
  );

  const options = useMemo(() => {
    const byId = new Map<number, DocumentOption>();

    for (const id of selectedIds) {
      const cached = cache.get(id);
      if (cached && !excludeSet.has(id)) byId.set(id, cached);
    }

    for (const d of searchResults) {
      if (!byId.has(d.id) && !excludeSet.has(d.id)) {
        byId.set(d.id, { id: d.id, title: d.title });
      }
    }

    return [...byId.values()];
  }, [searchResults, selectedIds, cache, excludeSet]);

  return {
    options,
    searchValue,
    setSearchValue,
    isLoading: docsQuery.isLoading,
    isFetching: docsQuery.isFetching,
  };
}
