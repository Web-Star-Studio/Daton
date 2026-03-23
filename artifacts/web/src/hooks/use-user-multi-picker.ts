import { useEffect, useMemo, useState } from "react";
import {
  getListUserOptionsQueryKey,
  useListUserOptions,
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

type UserOption = { id: number; name: string; email: string };

type UseUserMultiPickerParams = {
  orgId: number | undefined;
  selectedIds: number[];
  enabled?: boolean;
  initialUsers?: UserOption[];
};

export function useUserMultiPicker({
  orgId,
  selectedIds,
  enabled = true,
  initialUsers,
}: UseUserMultiPickerParams) {
  const [searchValue, setSearchValue] = useState("");
  const debouncedSearch = useDebouncedValue(searchValue, DEBOUNCE_MS);

  const [cache, setCache] = useState<Map<number, UserOption>>(() => {
    const map = new Map<number, UserOption>();
    if (initialUsers) {
      for (const u of initialUsers) {
        map.set(u.id, u);
      }
    }
    return map;
  });

  useEffect(() => {
    if (!initialUsers || initialUsers.length === 0) return;
    setCache((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const u of initialUsers) {
        if (!next.has(u.id)) {
          next.set(u.id, u);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [initialUsers]);

  const usersQuery = useListUserOptions(
    orgId!,
    {
      search: debouncedSearch || undefined,
      page: 1,
      pageSize: PAGE_SIZE,
    },
    {
      query: {
        queryKey: getListUserOptionsQueryKey(orgId!, {
          search: debouncedSearch || undefined,
          page: 1,
          pageSize: PAGE_SIZE,
        }),
        enabled: !!orgId && enabled,
        placeholderData: keepPreviousData,
      },
    },
  );

  const searchResults = usersQuery.data ?? [];

  useEffect(() => {
    if (searchResults.length === 0) return;
    setCache((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const u of searchResults) {
        if (!next.has(u.id)) {
          next.set(u.id, { id: u.id, name: u.name, email: u.email });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [searchResults]);

  const options = useMemo(() => {
    const byId = new Map<number, UserOption>();

    for (const id of selectedIds) {
      const cached = cache.get(id);
      if (cached) byId.set(id, cached);
    }

    for (const u of searchResults) {
      if (!byId.has(u.id)) {
        byId.set(u.id, { id: u.id, name: u.name, email: u.email });
      }
    }

    return [...byId.values()];
  }, [searchResults, selectedIds, cache]);

  return {
    options,
    searchValue,
    setSearchValue,
    isLoading: usersQuery.isLoading,
    isFetching: usersQuery.isFetching,
  };
}
