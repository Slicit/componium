/* shadcn/ui's Tooltip, copied in and adapted.
 *
 * The thing it replaces is the browser's own `title`, which fails in three
 * ways that matter here. It never appears on keyboard focus, so anybody
 * tabbing through the toolbar gets nothing at all. It waits about a second,
 * which is long enough that people stop expecting it. And it is drawn by the
 * operating system, so in a dark studio it is a white box in a font nothing
 * else on the page uses.
 *
 * Adapted only in the styling, which uses the studio's own tokens.
 */

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../../lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 max-w-xs rounded-md border border-border bg-popover px-2.5 py-1.5',
        'font-sans text-xs leading-snug text-popover-foreground shadow-lg',
        'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
