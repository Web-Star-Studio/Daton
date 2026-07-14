/**
 * User-facing text for a failed request.
 *
 * `ApiError.message` is built for logs — it prefixes the server's reason with
 * `HTTP 502 Bad Gateway: `. Toasts should show only the reason, so read the
 * `{ error }` body the API always sends and fall back to the raw message.
 * Duck-typed on purpose: `ApiError` is not exported from the generated client.
 */
export function apiErrorMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const data = (error as { data?: unknown }).data;
  if (typeof data === "object" && data !== null) {
    const reason = (data as { error?: unknown }).error;
    if (typeof reason === "string" && reason.trim()) return reason.trim();
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message.trim() : undefined;
}
