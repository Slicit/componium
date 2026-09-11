/* Who is signed in, asked once and shared.
 *
 * The server is what actually decides: every route checks a cookie and refuses
 * what the role does not reach. This is the copy the interface uses to avoid
 * offering a button that would only ever answer 403, which is a different job
 * from enforcing anything, and it is worth being clear about which is which. A
 * viewer who edited this value in a debugger would get a studio full of
 * controls that all refuse.
 */

export type Role = 'viewer' | 'operator' | 'admin';

export interface Session {
  signedIn: boolean;
  name?: string;
  role?: Role;
}

const ORDER: Role[] = ['viewer', 'operator', 'admin'];

/** Whether a role includes another's powers. Mirrors users.Role.AtLeast. */
export function atLeast(have: Role | undefined, need: Role): boolean {
  if (!have) return false;
  const mine = ORDER.indexOf(have);
  const theirs = ORDER.indexOf(need);
  return mine >= 0 && theirs >= 0 && mine >= theirs;
}

export async function readSession(): Promise<Session> {
  try {
    const r = await fetch('/api/session');
    if (!r.ok) return { signedIn: false };
    return (await r.json()) as Session;
  } catch {
    return { signedIn: false };
  }
}

/** End the session and go back to the sign-in page. */
export async function signOut(): Promise<void> {
  try {
    await fetch('/api/session', { method: 'DELETE' });
  } finally {
    /* A full load rather than a route change: everything held in memory
     * belongs to the person who has just left. */
    window.location.href = '/signin';
  }
}
