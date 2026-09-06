/* The bar across the top. One of them.
 *
 * There used to be two, stacked: this one with the sections, and the studio's
 * own with the film and the transport. Two bars that look alike and mean
 * different things is a thing to work out rather than read, and it cost 40
 * pixels of a timeline to say Componium twice.
 *
 * So this is the only bar, and it carries three kinds of thing in three
 * places. The mark on the left, then where you can go. Then a slot, filled by
 * whichever page is open with the one or two controls that belong beside its
 * own name — the studio puts the film and its version there, because which
 * film is open is closer to where you are than to what you are doing to it.
 * Then Admin, hard right, away from the rest: it is the door out of the
 * working surface and should not sit next to the doors within it.
 *
 * What is deliberately not here is anything that acts on a score. Those went
 * to a strip directly above the timeline, where the thing they act on is.
 */

import { isCurrent, routeHash, type Route } from '../core/route';

/* Left, in the order you would go looking. Admin is not among them: it is
 * placed separately below, and putting it in this list would quietly move it
 * back into the group. */
const PLACES = [
  { id: '', label: 'Studio', hint: 'The timeline and the room' },
  { id: 'library', label: 'Library', hint: 'Films, their scores, and the analysis queue' },
] as const;

/** Where a page puts the controls that belong beside its name. */
export const NAV_SLOT = 'nav-slot';

export function Nav({ route }: { route: Route }) {
  return (
    <nav className="nav" aria-label="Sections">
      <span className="nav-mark">
        Componium <span className="dim">Studio</span> <span className="tag">v2</span>
      </span>

      <ul>
        {PLACES.map((s) => (
          <li key={s.id || 'studio'}>
            <a
              href={routeHash(s.id)}
              className={isCurrent(route, s.id) ? 'is-current' : ''}
              aria-current={isCurrent(route, s.id) ? 'page' : undefined}
              title={s.hint}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>

      <div className="nav-slot" id={NAV_SLOT} />

      <a
        href={routeHash('admin')}
        className={'nav-admin' + (isCurrent(route, 'admin') ? ' is-current' : '')}
        aria-current={isCurrent(route, 'admin') ? 'page' : undefined}
        title="Devices, firmware and preview settings"
      >
        Admin
      </a>
    </nav>
  );
}
