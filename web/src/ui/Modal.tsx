/* A panel over the studio, with a title, a body that scrolls, and a footer.
 *
 * The project's own shape in front of shadcn's Dialog, so pages say Modal and
 * pass a title rather than assembling six primitives each time, and so that
 * swapping what is underneath is one file.
 *
 * What the hand-built version did not do, and this does: focus moves into the
 * panel when it opens and back to whatever opened it when it closes, Tab
 * cannot walk out into the page behind, and the rest of the document is hidden
 * from screen readers while it is up. The first two are the ones that were
 * actually wrong before — a full screen panel you can Tab out of leaves the
 * keyboard somewhere the eye is not.
 */

import type { ReactNode } from 'react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './shad/dialog';
import { Icon } from './Icon';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** A second line under the title, usually what the panel is about. */
  subtitle?: string;
  /** Read out to a screen reader instead of the title, when the title alone is
   *  not enough to say which panel this is. */
  label?: string;
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({ open, onClose, title, subtitle, label, footer, children }: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent aria-label={label ?? title}>
        <DialogHeader>
          <div>
            <DialogTitle>{title}</DialogTitle>
            {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
          </div>
          <button className="insp-close" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </DialogHeader>

        <DialogBody>{children}</DialogBody>

        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
