export type PickableEmployee = { email: string | null };

/**
 * Decide which email to use when an existing colaborador is explicitly picked
 * while creating a user.
 *
 * Explicit selection must win over whatever is already in the field — including
 * values the browser's password manager pre-fills with the admin's own login
 * when the dialog opens. We only keep the existing value when the chosen
 * employee has no email of their own.
 */
export function resolveUserEmailFromEmployeePick(
  employee: PickableEmployee,
  currentEmail: string,
): string {
  const employeeEmail = employee.email?.trim();
  return employeeEmail ? employeeEmail : currentEmail;
}
