const MIN_PASSWORD_LENGTH = 6;

/**
 * In "Criar Usuário" the password is optional. A blank (or whitespace-only)
 * value means "send the user an e-mail to set their own password". Otherwise we
 * use the trimmed value as the initial password. Validation and submit share
 * this normalization so they can never disagree (e.g. on whitespace-only input).
 */
export function normalizeOptionalPassword(raw?: string): string | undefined {
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/** react-hook-form `validate`: true when valid, otherwise the error message. */
export function validateOptionalPassword(raw?: string): true | string {
  const password = normalizeOptionalPassword(raw);
  if (password === undefined) return true; // blank → e-mail flow
  return (
    password.length >= MIN_PASSWORD_LENGTH ||
    "A senha deve ter no mínimo 6 caracteres"
  );
}
