export interface ResendCandidate {
  id: number;
  /** Undefined when the API response predates the passwordSet field. */
  passwordSet?: boolean;
}

/**
 * The "Reenviar e-mail de acesso" action only makes sense for a user who was
 * created without a password (passwordSet === false) and is not the current
 * user. When passwordSet is unknown (older response), we hide the action.
 */
export function canResendAccessEmail(
  user: ResendCandidate,
  currentUserId: number,
): boolean {
  return user.passwordSet === false && user.id !== currentUserId;
}
