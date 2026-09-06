/* shadcn/ui's Popover, copied in and adapted.
 *
 * The reason it is here is a bug rather than a preference. A popover that is
 * positioned by CSS lives inside whatever stacking context its ancestors make,
 * and the bar at the top is `position: sticky` with a `z-index`, which is
 * exactly the recipe for one. So the film picker's list was pinned at the
 * bar's level of 5 no matter what z-index it asked for, and the stage, the
 * room and the timeline — at 20, 40, 50 and 60 in the root context — all
 * painted straight over it. It opened every time and was never visible.
 *
 * This portals its content to the end of the body, which is not a trick to get
 * a higher number: it takes the content out of the ancestor's stacking context
 * altogether, so no future sticky header or transformed parent can trap it
 * again. Positioning is then computed rather than inherited, which also means
 * a list near the right edge flips instead of going off screen.
 */

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '../../lib/utils';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'start', sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={8}
      className={cn(
        'z-50 rounded-md border border-border bg-popover p-1.5 shadow-lg',
        'font-sans text-popover-foreground',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
