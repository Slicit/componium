/* Choosing a film, from a list that is too long to scroll.
 *
 * It filters with core/paging's `matches`, the same function the library's own
 * search box uses. Two search boxes over the same films disagreeing about what
 * "rebel 1080" matches would be a small thing that feels broken. Film files are
 * named for releases, so the part a person remembers is usually in the middle
 * of the name: "scargiver", not "Rebel.Moon.Part.Two".
 *
 * The list is a Radix popover, and that is a bug fix rather than a preference.
 * It used to be an absolutely positioned div, which put it inside whatever
 * stacking context its ancestors made. That was fine until the picker moved
 * into the bar at the top, which is `position: sticky` with a `z-index` and so
 * makes one: the list was then pinned at the bar's level of 5 while the stage,
 * the room and the timeline sit at 20 through 60 in the root context. It opened
 * every time and was painted underneath the page every time.
 *
 * Portalled content cannot be trapped that way again, by this ancestor or by a
 * future one, and Radix computes the position rather than inheriting it, so a
 * list near the right edge flips instead of running off the screen.
 *
 * The keyboard handling below is this component's own rather than the library's
 * roving focus, because the arrow keys have to move a highlight in the list
 * while the text cursor stays in the search box. That is the combobox pattern,
 * and it is what aria-activedescendant is for.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { matches } from '../core/paging';
import { Popover, PopoverContent, PopoverTrigger } from './shad/popover';

export interface FilmOption {
  name: string;
}

export interface FilmPickerProps {
  films: readonly FilmOption[];
  /** The film now open, or '' when the score is not from one of these. */
  value: string;
  /** Shown when nothing is chosen, so the control is never blank. */
  fallback: string;
  onPick: (film: string) => void;
}

export function FilmPicker({ films, value, fallback, onPick }: FilmPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => matches(films, query, (f) => f.name), [films, query]);

  /* Kept inside the list whenever the list changes under it. Filtering to two
   * results with the cursor on the ninth would otherwise leave Enter pointing
   * at nothing. */
  useEffect(() => {
    setAt(0);
  }, [query]);

  const choose = useCallback(
    (name: string) => {
      onPick(name);
      setOpen(false);
      setQuery('');
    },
    [onPick],
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAt((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAt((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = shown[at];
      if (pick) choose(pick.name);
    }
    /* Escape and Tab are left to the popover, which closes on both. */
  };

  const label = value || fallback;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="picker-current"
          aria-label={'Film: ' + label + '. Choose or search'}
          title={label}
        >
          {label}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="picker-pop"
        /* The search box wants the cursor, not the popover. */
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          input.current?.focus();
        }}
      >
        <input
          ref={input}
          className="picker-find"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="picker-list"
          aria-autocomplete="list"
          aria-activedescendant={shown[at] ? 'picker-opt-' + at : undefined}
          aria-label="Search films"
          placeholder="search films"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />

        <ul className="picker-list" id="picker-list" role="listbox" aria-label="Films">
          {shown.map((f, i) => (
            <li
              key={f.name}
              id={'picker-opt-' + i}
              role="option"
              aria-selected={f.name === value}
              className={(i === at ? 'is-at' : '') + (f.name === value ? ' is-current' : '')}
            >
              {/* A button, so it is reachable and pressable without a pointer.
                  The search box drives the arrow keys; this is what makes the
                  same row work for anything that does not. */}
              <button type="button" onClick={() => choose(f.name)}>
                {f.name}
              </button>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="picker-none" role="presentation">
              nothing matches “{query}”
            </li>
          )}
        </ul>

        <p className="picker-count dim small">
          {shown.length === films.length
            ? films.length + (films.length === 1 ? ' film' : ' films')
            : shown.length + ' of ' + films.length}
        </p>
      </PopoverContent>
    </Popover>
  );
}
