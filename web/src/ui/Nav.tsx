/* The bar across the top, and the only thing above the studio.
 *
 * One entry per place you can be, and no more. This exists to move between
 * sections, not to become a second toolbar: the studio's own bar is the
 * working surface and everything that acts on a score belongs there, next to
 * the score.
 */

import { isCurrent, routeHash, type Route } from '../core/route';

const SECTIONS = [
  { id: '', label: 'Studio', hint: 'The timeline and the room' },
  { id: 'library', label: 'Library', hint: 'Films, their scores, and the analysis queue' },
  { id: 'admin', label: 'Admin', hint: 'Devices, firmware and preview settings' },
] as const;

export function Nav({ route }: { route: Route }) {
  return (
    <nav className="nav" aria-label="Sections">
      <span className="nav-mark">Componium</span>
      <ul>
        {SECTIONS.map((s) => (
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
    </nav>
  );
}
