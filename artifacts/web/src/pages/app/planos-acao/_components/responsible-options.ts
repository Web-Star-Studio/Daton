import type { SearchableOption } from "@/components/ui/searchable-select";

/**
 * Options for the "Responsável" picker on a plan.
 *
 * Only org admins and managers may read the org user list, so `orgUsers` comes
 * back empty for an operator opening the plan assigned to them (via "Suas
 * Pendências" or the origin screen's "Ações vinculadas"). The plan payload
 * already carries `responsibleUserName`, so we seed the picker with it —
 * otherwise the field would fall back to its "Selecione" placeholder and the
 * operator could not see who owns the action.
 */
export function buildResponsibleOptions(
  orgUsers: Array<{ id: number; name: string }>,
  responsibleUserId: number | string | null | undefined,
  responsibleUserName: string | null | undefined,
): SearchableOption[] {
  const options = orgUsers.map((user) => ({
    value: String(user.id),
    label: user.name,
  }));

  if (responsibleUserId === null || responsibleUserId === undefined || responsibleUserId === "") {
    return options;
  }

  const responsibleValue = String(responsibleUserId);
  if (options.some((option) => option.value === responsibleValue)) {
    return options;
  }

  return [
    { value: responsibleValue, label: responsibleUserName || "Responsável atual" },
    ...options,
  ];
}
