/**
 * Path matching for the sidebar's module guard.
 *
 * `exact` guards a hub index without swallowing its detail pages — `/planos-acao`
 * is module-gated while `/planos-acao/:id` stays reachable for the user assigned
 * to that plan. Trailing slashes are normalized away first: wouter serves the hub
 * for `/planos-acao/` as well, so a bare equality check would let anyone walk past
 * the guard just by typing the slash.
 *
 * Prefix matching stops at a segment boundary, so `/kpi` never matches a
 * hypothetical `/kpi-legado`.
 */
export function matchesGuardedPath(
  location: string,
  prefix: string,
  exact = false,
): boolean {
  const path = location.replace(/\/+$/, "") || "/";

  if (exact) {
    return path === prefix;
  }

  return path === prefix || path.startsWith(`${prefix}/`);
}
