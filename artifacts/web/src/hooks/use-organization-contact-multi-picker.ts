import { useEffect, useMemo, useState } from "react";
import {
  getListOrganizationContactsQueryKey,
  useListOrganizationContacts,
  type OrganizationContact,
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

type UseOrganizationContactMultiPickerParams = {
  orgId: number | undefined;
  selectedIds: number[];
  enabled?: boolean;
  includeArchived?: boolean;
  initialContacts?: OrganizationContact[];
};

export function useOrganizationContactMultiPicker({
  orgId,
  selectedIds,
  enabled = true,
  includeArchived = false,
  initialContacts,
}: UseOrganizationContactMultiPickerParams) {
  const [searchValue, setSearchValue] = useState("");
  const debouncedSearch = useDebouncedValue(searchValue, DEBOUNCE_MS);

  const [cache, setCache] = useState<Map<number, OrganizationContact>>(() => {
    const map = new Map<number, OrganizationContact>();
    if (initialContacts) {
      for (const contact of initialContacts) {
        map.set(contact.id, contact);
      }
    }
    return map;
  });

  const shouldReplaceCachedContact = (
    current: OrganizationContact | undefined,
    incoming: OrganizationContact,
  ) =>
    !current ||
    current.updatedAt !== incoming.updatedAt ||
    current.name !== incoming.name ||
    current.email !== incoming.email;

  useEffect(() => {
    if (!initialContacts?.length) return;
    setCache((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const contact of initialContacts) {
        if (shouldReplaceCachedContact(next.get(contact.id), contact)) {
          next.set(contact.id, contact);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [initialContacts]);

  const contactsQuery = useListOrganizationContacts(
    orgId!,
    {
      search: debouncedSearch || undefined,
      includeArchived,
    },
    {
      query: {
        queryKey: getListOrganizationContactsQueryKey(orgId!, {
          search: debouncedSearch || undefined,
          includeArchived,
        }),
        enabled: !!orgId && enabled,
        placeholderData: keepPreviousData,
      },
    },
  );

  const searchResults = contactsQuery.data ?? [];

  useEffect(() => {
    if (!searchResults.length) return;
    setCache((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const contact of searchResults) {
        if (shouldReplaceCachedContact(next.get(contact.id), contact)) {
          next.set(contact.id, contact);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [searchResults]);

  const options = useMemo(() => {
    const byId = new Map<number, OrganizationContact>();

    for (const id of selectedIds) {
      const cached = cache.get(id);
      if (cached) byId.set(id, cached);
    }

    for (const contact of searchResults) {
      if (!byId.has(contact.id)) {
        byId.set(contact.id, contact);
      }
    }

    return [...byId.values()];
  }, [cache, searchResults, selectedIds]);

  return {
    options,
    searchValue,
    setSearchValue,
    isLoading: contactsQuery.isLoading,
    isFetching: contactsQuery.isFetching,
  };
}
