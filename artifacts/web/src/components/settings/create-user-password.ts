const MIN_PASSWORD_LENGTH = 6;

/**
 * In "Criar Usuário" the password is optional. A blank (or whitespace-only)
 * value means "send the user an e-mail to set their own password"; we use
 * trimming ONLY to detect that signal. A non-blank password is kept exactly as
 * typed (we never silently rewrite the user's password). Validation and submit
 * share these helpers so they can never disagree.
 */
export function normalizeOptionalPassword(raw?: string): string | undefined {
  if (!raw || raw.trim() === "") return undefined; // blank → e-mail flow
  return raw; // non-blank → as typed
}

/** react-hook-form `validate`: true when valid, otherwise the error message. */
export function validateOptionalPassword(raw?: string): true | string {
  if (!raw || raw.trim() === "") return true; // blank → e-mail flow
  return (
    raw.length >= MIN_PASSWORD_LENGTH ||
    "A senha deve ter no mínimo 6 caracteres"
  );
}
