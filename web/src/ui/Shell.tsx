/* What is mounted: the navbar, and whichever section the hash names.
 *
 * The studio stays mounted while another section is open, hidden rather than
 * unmounted. It holds a score, an undo history, a WebGL context and a playing
 * video, and throwing those away to look at a settings page would mean losing
 * the history and rebuilding the room every time somebody checked which port a
 * node is on. Hidden with `display: none`, so the room stops being asked for
 * frames while nobody is looking at it.
 *
 * Which is also why opening a film from the library is a piece of state here
 * rather than a callback passed downward: the two pages are siblings, and the
 * one that is hidden is still the one holding the score.
 */

import { useState } from 'react';
import { App } from '../App';
import { Nav } from './Nav';
import { Admin } from './admin/Admin';
import { LibraryPage } from './LibraryPage';
import { useRoute } from './useRoute';

export function Shell() {
  const route = useRoute();
  const [wanted, setWanted] = useState<string | null>(null);
  const studio = route.section === '';

  return (
    <div className="shell">
      <Nav route={route} />
      <div className="shell-body">
        <div className={studio ? 'shell-here' : 'shell-away'}
             aria-hidden={studio ? undefined : true}>
          <App active={studio} open={wanted} onOpened={() => setWanted(null)} />
        </div>
        {route.section === 'library' && <LibraryPage onOpen={setWanted} />}
        {route.section === 'admin' && <Admin route={route} />}
      </div>
    </div>
  );
}
