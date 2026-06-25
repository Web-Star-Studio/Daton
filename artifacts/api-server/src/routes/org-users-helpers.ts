export interface SerializableOrgUser {
  id: number;
  name: string;
  email: string;
  role: string;
  unitId: number | null;
  createdAt: Date;
  /** Null when the user was created without a password and has not set one yet. */
  passwordHash: string | null;
}

export interface SerializedOrgUser {
  id: number;
  name: string;
  email: string;
  role: string;
  unitId: number | null;
  createdAt: string;
  modules: string[];
  /** False while the user still needs to define their password via e-mail link. */
  passwordSet: boolean;
}

export function serializeOrgUser(
  user: SerializableOrgUser,
  modules: string[],
): SerializedOrgUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    unitId: user.unitId ?? null,
    createdAt: user.createdAt.toISOString(),
    modules,
    passwordSet: user.passwordHash != null,
  };
}

/**
 * When an admin creates a user without typing a password, the system instead
 * sends an e-mail with a link for the user to define their own password.
 */
export function shouldSendSetPasswordEmail(password?: string | null): boolean {
  return !password || password.trim() === "";
}
