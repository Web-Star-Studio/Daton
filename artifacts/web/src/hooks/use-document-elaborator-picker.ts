import { useEffect, useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import {
  getGetEmployeeQueryKey,
  getListEmployeesQueryKey,
  useGetEmployee,
  useListEmployees,
} from "@workspace/api-client-react";
import type { Employee } from "@workspace/api-client-react";

const DOCUMENT_ELABORATOR_SEARCH_PAGE_SIZE = 25;
const DOCUMENT_ELABORATOR_SEARCH_DEBOUNCE_MS = 300;

function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delay, value]);

  return debouncedValue;
}

function mergeEmployees(
  employees: Employee[],
  selectedEmployee: Employee | null,
) {
  const byId = new Map<number, Employee>();

  if (selectedEmployee) {
    byId.set(selectedEmployee.id, selectedEmployee);
  }

  for (const employee of employees) {
    byId.set(employee.id, employee);
  }

  return [...byId.values()];
}

type UseDocumentElaboratorPickerParams = {
  orgId: number | undefined;
  selectedEmployeeId: number | null | undefined;
  userEmail?: string | null;
  enabled?: boolean;
  onAutoSelect?: (employeeId: number) => void;
};

export function useDocumentElaboratorPicker({
  orgId,
  selectedEmployeeId,
  userEmail,
  enabled = true,
  onAutoSelect,
}: UseDocumentElaboratorPickerParams) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const debouncedSearchValue = useDebouncedValue(
    searchValue,
    DOCUMENT_ELABORATOR_SEARCH_DEBOUNCE_MS,
  );

  const normalizedUserEmail = userEmail?.trim().toLowerCase() ?? "";
  const normalizedSelectedEmployeeId = selectedEmployeeId ?? 0;
  const shouldLoadInitialOptions =
    !!orgId && enabled && (open || normalizedSelectedEmployeeId <= 0);

  const employeesQuery = useListEmployees(
    orgId!,
    {
      page: 1,
      pageSize: DOCUMENT_ELABORATOR_SEARCH_PAGE_SIZE,
      search: debouncedSearchValue || undefined,
    },
    {
      query: {
        queryKey: getListEmployeesQueryKey(orgId!, {
          page: 1,
          pageSize: DOCUMENT_ELABORATOR_SEARCH_PAGE_SIZE,
          search: debouncedSearchValue || undefined,
        }),
        enabled: shouldLoadInitialOptions,
        placeholderData: keepPreviousData,
      },
    },
  );

  const selectedEmployeeQuery = useGetEmployee(orgId!, normalizedSelectedEmployeeId, {
    query: {
      queryKey: getGetEmployeeQueryKey(orgId!, normalizedSelectedEmployeeId),
      enabled: !!orgId && enabled && normalizedSelectedEmployeeId > 0,
    },
  });

  const preferredEmployeeQuery = useListEmployees(
    orgId!,
    {
      page: 1,
      pageSize: DOCUMENT_ELABORATOR_SEARCH_PAGE_SIZE,
      search: normalizedUserEmail || undefined,
    },
    {
      query: {
        queryKey: getListEmployeesQueryKey(orgId!, {
          page: 1,
          pageSize: DOCUMENT_ELABORATOR_SEARCH_PAGE_SIZE,
          search: normalizedUserEmail || undefined,
        }),
        enabled:
          shouldLoadInitialOptions &&
          normalizedSelectedEmployeeId <= 0 &&
          normalizedUserEmail.length > 0,
      },
    },
  );

  const preferredEmployee = useMemo(
    () =>
      preferredEmployeeQuery.data?.data.find(
        (employee) =>
          (employee.email?.trim().toLowerCase() ?? "") === normalizedUserEmail,
      ) ?? null,
    [normalizedUserEmail, preferredEmployeeQuery.data?.data],
  );

  const selectedEmployee = selectedEmployeeQuery.data ?? null;

  const options = useMemo(
    () => mergeEmployees(employeesQuery.data?.data ?? [], selectedEmployee),
    [employeesQuery.data?.data, selectedEmployee],
  );

  useEffect(() => {
    if (open) return;

    setSearchValue("");
  }, [open]);

  useEffect(() => {
    if (!shouldLoadInitialOptions || normalizedSelectedEmployeeId > 0) return;

    const preferredEmployeeId = preferredEmployee?.id ?? options[0]?.id;
    if (!preferredEmployeeId) return;

    onAutoSelect?.(preferredEmployeeId);
  }, [
    normalizedSelectedEmployeeId,
    onAutoSelect,
    options,
    preferredEmployee?.id,
    shouldLoadInitialOptions,
  ]);

  return {
    open,
    setOpen,
    searchValue,
    setSearchValue,
    options,
    selectedEmployee,
    isLoading:
      employeesQuery.isLoading ||
      selectedEmployeeQuery.isLoading ||
      preferredEmployeeQuery.isLoading,
    isFetching: employeesQuery.isFetching,
  };
}
