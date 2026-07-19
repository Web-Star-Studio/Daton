import type { SearchableOption } from "@/components/ui/searchable-select";
import type { SearchableMultiSelectOption } from "@/components/ui/searchable-multi-select";

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

/**
 * Opções do seletor de "Co-responsáveis".
 *
 * Exclui o ponto focal: ninguém é responsável duas vezes (o servidor rejeita, e o
 * seletor não deve nem oferecer). E semeia os co-responsáveis atuais quando
 * `orgUsers` volta vazia — só admin e gerente podem listar os usuários da org, então
 * o operador que abre o plano dele veria um seletor vazio sem isso.
 */
export function buildCoResponsibleOptions(
  orgUsers: Array<{ id: number; name: string }>,
  coResponsibles: Array<{ userId: number; name: string }>,
  pontoFocalUserId: number | null,
): SearchableMultiSelectOption[] {
  const options = orgUsers
    .filter((user) => user.id !== pontoFocalUserId)
    .map((user) => ({ value: user.id, label: user.name }));

  const known = new Set(options.map((option) => option.value));
  const missing = coResponsibles
    .filter((r) => !known.has(r.userId) && r.userId !== pontoFocalUserId)
    .map((r) => ({ value: r.userId, label: r.name || "Co-responsável" }));

  return [...missing, ...options];
}
