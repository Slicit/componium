/* What a control is for, said on hover and on focus.
 *
 * Wraps one control:
 *
 *   <Tip say="The room preview">
 *     <button className="toggle">room</button>
 *   </Tip>
 *
 * The child is rendered as-is rather than wrapped in anything, so layout is
 * unaffected and a row of toolbar buttons stays a row of toolbar buttons.
 *
 * Two things this does that `title` did not. It appears on keyboard focus, so
 * tabbing through the toolbar explains itself; the browser's tooltip only ever
 * answers a mouse. And it is wired to the control with aria-describedby, so it
 * is read out as a description rather than replacing the control's name, which
 * is what happens when a `title` and an `aria-label` disagree.
 *
 * The name is short because it appears a lot, and `Tooltip` is already the
 * primitive's name one directory down.
 */

import type { ReactElement } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './shad/tooltip';

/* Re-exported so that nothing outside this file reaches into shad/ for it.
 * A provider is part of using tooltips, so it belongs to the wrapper that
 * owns them: if the primitive underneath is ever swapped, this is still the
 * only file that knows. */
export { TooltipProvider } from './shad/tooltip';

export interface TipProps {
  /** The sentence. Not the control's name, which its own text or aria-label
   *  already gives: this says what pressing it does. */
  say: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactElement;
}

export function Tip({ say, side = 'bottom', children }: TipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{say}</TooltipContent>
    </Tooltip>
  );
}
