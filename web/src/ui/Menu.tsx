/* The right-click menu.
 *
 * Context-sensitive, because a menu that offers every action everywhere is a
 * list rather than a menu: what you can do to a span is not what you can do to
 * a curve point, and showing both halves greyed out teaches nobody anything.
 *
 * Items that cannot apply right now are omitted rather than disabled, with one
 * exception — Split, which is disabled with a reason when the playhead is not
 * inside the span, because "why is Split missing" is a worse question than
 * "why is Split grey".
 *
 * The props are unchanged from the hand-built version: a point, a list, and a
 * way to close. What is underneath is Radix now, and the reason is the part
 * that was missing rather than the part that worked. The old menu closed on a
 * click away, on Escape, on a scroll and on the window losing focus, and it
 * kept itself on screen — all of that was written out by hand and all of it
 * was right. What it had none of was a keyboard: no arrow keys, no Home or
 * End, no typeahead, and focus never entered the menu at all. A right-click
 * menu that can only be answered with a mouse is one a keyboard user can open
 * and then not use.
 *
 * It is anchored to a point rather than to a control, which is what the
 * invisible trigger below is for: the menu is opened by a right-click on a
 * canvas, so there is no button to hang it from.
 */

import { useEffect, useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './shad/dropdown-menu';

export interface MenuItem {
  label: string;
  /** Shown right-aligned: the keystroke that does the same thing. */
  key?: string;
  run?: () => void;
  /** A reason it cannot run, shown as a tooltip. Implies disabled. */
  why?: string;
  danger?: boolean;
  separator?: false;
}

export type MenuEntry = MenuItem | { separator: true };

export function Menu(props: { x: number; y: number; items: MenuEntry[]; onClose: () => void }) {
  const { x, y, items, onClose } = props;
  const anchor = useRef<HTMLSpanElement>(null);

  /* A scroll closes it. Radix handles the click away, Escape and the window
   * losing focus, but leaves a menu open through a scroll on purpose, since a
   * menu hanging off a button should travel with it. This one hangs off a
   * point in a timeline, and that point means something different once the
   * timeline has moved under it. */
  useEffect(() => {
    window.addEventListener('wheel', onClose, { passive: true });
    return () => window.removeEventListener('wheel', onClose);
  }, [onClose]);

  return (
    <DropdownMenu open onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        {/* Nothing to see: it exists so the menu has something to be
            positioned against, and so that focus has somewhere to return to
            when the menu closes. */}
        <span
          ref={anchor}
          aria-hidden="true"
          style={{ position: 'fixed', left: x, top: y, width: 0, height: 0 }}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="bottom" collisionPadding={8}>
        {items.map((item, i) =>
          'separator' in item && item.separator ? (
            <DropdownMenuSeparator key={'s' + i} />
          ) : (
            <DropdownMenuItem
              key={item.label + i}
              danger={item.danger}
              disabled={!!item.why || !item.run}
              title={item.why}
              onSelect={() => item.run?.()}
            >
              <span>{item.label}</span>
              {item.key && <kbd>{item.key}</kbd>}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
