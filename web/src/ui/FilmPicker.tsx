/* Choosing a film, from a list that is too long to scroll.
 *
 * This was a <select>. That was fine while the library sat on the same page
 * and the dropdown was the shortcut rather than the way: with the library on a
 * page of its own this is now the only way to change film without leaving the
 * studio, and a native select offers nothing but scrolling and first-letter
 * jumping. Film files are named for releases, so the thing a person remembers
 * is usually in the middle of the name.
 *
 * It filters with core/paging's `matches`, the same function the library's own
 * search box uses. Two search boxes over the same films that disagree about
 * what "rebel 1080" matches would be a small thing that feels broken.
 *
 * Built by hand rather than reached for. A combobox is a listbox, a text
 * input, and the keyboard contract between them, which is about eighty lines;
 * a component library would bring a build step and a styling system for this
 * one control. See ADR 0010 for when that trade changes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { matches } from '../core/paging';

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
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const shown = useMemo(
    () => matches(films, query, (f) => f.name),
    [films, query]);

  /* Kept inside the list whenever the list changes under it. Filtering to two
   * results with the cursor on the ninth would otherwise leave Enter pointing
   * at nothing. */
  useEffect(() => { setAt(0); }, [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const choose = useCallback((name: string) => {
    onPick(name);
    close();
  }, [onPick, close]);

  /* Clicking away closes it. Pointerdown rather than click, so that a press
   * beginning outside dismisses before whatever was pressed acts on a studio
   * that is still showing a popover over it. */
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, close]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAt((i) => Math.min(shown.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAt((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const pick = shown[at];
      if (pick) choose(pick.name);
      return;
    }
    /* Tab is deliberately not trapped. A popover that will not let go of the
     * keyboard is worse than one that closes when you leave it. */
    if (e.key === 'Tab') close();
  };

  const label = value || fallback;

  return (
    <div className="picker" ref={box}>
      <button
        type="button"
        className="picker-current"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={'Film: ' + label + '. Choose or search'}
        title={label}
        onClick={() => setOpen((was) => !was)}
      >
        {label}
      </button>

      {open && (
        <div className="picker-pop">
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
                {/* A button, so it is reachable and pressable without a
                    pointer. The listbox handles the arrow keys; this is what
                    makes the same row work for anything that does not. */}
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
        </div>
      )}
    </div>
  );
}
