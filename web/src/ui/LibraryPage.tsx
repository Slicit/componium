/* The library, as a page of its own.
 *
 * It used to sit at the bottom of the studio, which made sense when the only
 * way to change film was to scroll down and pick one. The studio's toolbar has
 * a film selector now, so the library is no longer part of working on a score:
 * it is where films arrive, get analysed and get read, which is a different
 * job done at a different time.
 *
 * Splitting it is not only tidiness. The library polls every 700ms while
 * anything is running, and on the studio page that poll re-rendered the whole
 * studio, the timeline included, for news about a job nobody was looking at.
 */

import { useCallback } from 'react';
import { Library } from './Library';
import { routeHash } from '../core/route';
import type { Fps } from '../core/time';

/* The rate timecodes are formatted at when reading a film's observations.
 *
 * The studio used to pass its own score's fps, which was wrong whenever the
 * film being read was not the film that score belonged to: reading a 25fps
 * film while a 24fps score was open shifted every timecode. Nothing looks up a
 * film's real rate yet, so this is the same assumption made once, in the open,
 * instead of borrowed from something unrelated. */
const ASSUMED_FPS: Fps = 24;

export function LibraryPage({ onOpen }: { onOpen: (film: string) => void }) {
  /* Opening a film is a studio action: hand the name up and go there. The
   * studio stays mounted behind this page, so it is still holding its score
   * and its undo history when it comes back into view. */
  const open = useCallback(
    (film: string) => {
      onOpen(film);
      window.location.hash = routeHash('');
    },
    [onOpen],
  );

  return (
    <div className="sidebar">
      {/* Empty, and holding the geometry on purpose.

          The library had no column down its left and admin did, so the two
          places reached from the same bar began 200px apart and the library
          read as the one that had been forgotten. There is nothing to put in
          here yet; when there is, it is a `<nav>` with the same list admin
          has. Until then it is a div rather than an empty landmark, because
          a navigation region containing no navigation is worse than none. */}
      <div className="sidebar-menu" aria-hidden="true" />
      <div className="sidebar-body">
        <section className="page page-wide">
          <h2>Library</h2>
          {/* Beside the title rather than inside it: a heading is what a screen
          reader jumps between, and a sentence of description folded into one
          gets read out on every jump. Every admin page already does it this
          way. */}
          <p className="dim small">
            One film, one score; analysis runs in the background, one at a time.
          </p>
          <Library onOpen={open} fps={ASSUMED_FPS} />
        </section>
      </div>
    </div>
  );
}
