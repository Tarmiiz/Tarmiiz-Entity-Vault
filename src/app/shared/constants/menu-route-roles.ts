import { Routes, Route } from '@angular/router';

/**
 * Which USER ROLES can reach each menu module, derived from the ROUTE TABLE itself.
 *
 * 🔴 WHY THIS IS DERIVED AND NOT A TABLE. The Menu Access tab on User Details listed
 * EVERY menu item for every target role, so an admin's tab offered ~20 toggles for
 * modules an admin cannot open — Assets, DEX, Entities, Identities, Services and the
 * rest are `allowedRoles: [2, 3]`. Same defect as the system-function `roles` arrays
 * one layer over, and with the same cause: a second place claiming what the route
 * table already decides. A hand-maintained `Record<menuKey, roles[]>` would drift from
 * `app.routes.ts` the first time a guard changed, silently, exactly as those 65 keys
 * drifted. So this reads the routes at runtime; there is nothing to keep in step.
 *
 * ⚠️ I tried to derive this by PARSING `app.routes.ts` first and it was wrong twice —
 * a flat `path:` scan misses nested modules (`asset-creator` lives at
 * `assets/creator`), and a brace-depth version over-unioned, reporting `entities` as
 * `[1,2,3,4]` when it is `[2,3]` and `logs` as `[2,3,4]` when it is `[4]`. Those numbers
 * decide who sees what, so a heuristic is not good enough. The Router config is the
 * structure, already parsed by the compiler.
 *
 * THE MENU KEY is normally the route's own `path` (`entities`, `services`, `dex`). Where
 * it is not — the route sits under a parent, or the module's key differs — put
 * `menuKey` in that route's `data` and it is used instead. That is the one small thing
 * this asks of the route table, and it is explicit rather than inferred.
 */

/** Roles a route admits: its own declaration, else the union of its children's, else inherited. */
function effectiveRoles(route: Route, inherited: number[]): number[] {
  const own = (route.data as { allowedRoles?: number[] } | undefined)?.allowedRoles;
  if (own?.length) return own;
  if (route.children?.length) {
    const acc = new Set<number>();
    for (const child of route.children) for (const r of effectiveRoles(child, inherited)) acc.add(r);
    if (acc.size) return [...acc];
  }
  return inherited;
}

/**
 * `menuKey -> roles that can reach it`, walking the whole route tree.
 *
 * A key seen more than once (a module split across routes) accumulates the UNION: if any
 * route carrying that key admits the role, the module is reachable and the row belongs in
 * the tab.
 */
export function menuRolesFromRoutes(routes: Routes): Record<string, number[]> {
  const out: Record<string, Set<number>> = {};

  const walk = (rs: Routes, inherited: number[]) => {
    for (const route of rs) {
      const roles = effectiveRoles(route, inherited);
      const key = (route.data as { menuKey?: string } | undefined)?.menuKey ?? route.path;
      if (key) {
        (out[key] ??= new Set<number>());
        for (const r of roles) out[key].add(r);
      }
      if (route.children?.length) walk(route.children, roles);
    }
  };
  walk(routes, []);

  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort((a, b) => a - b)]));
}

/**
 * Can `role` reach the module behind `menuKey`?
 *
 * ⚠️ FAILS OPEN — an unknown key returns true. Hiding a row we cannot place is worse than
 * showing a spare one: the same reasoning as the licence surfacing's `undetermined`, where
 * "we could not establish it" must never render as "you are refused". A menu key with no
 * matching route is a registry/route mismatch to fix, not a restriction to assert.
 */
export function roleCanReachMenu(map: Record<string, number[]>, menuKey: string, role: number): boolean {
  const roles = map[menuKey];
  if (!roles?.length) return true;
  return roles.includes(Number(role));
}
