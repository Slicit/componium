/* Asking before doing something that cannot be undone.
 *
 * This replaces window.confirm, which had three problems worth the change.
 * It blocks the whole page, including the polling that keeps the library's
 * job list alive. It cannot say anything the browser does not let it say, so
 * a question about throwing away an hour of analysis looked exactly like a
 * question about closing a tab. And it is drawn by the browser in the
 * operating system's colours, which in a dark studio is a white box.
 *
 * The behaviour it has to keep is the important part: nothing happens until
 * the answer is yes, and Escape means no. Both are Radix's job now rather than
 * the browser's, and both are tested.
 */

import { useCallback, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './shad/alert-dialog';

export interface Asking {
  title: string;
  /** The consequence, in the words of whoever is about to cause it. */
  detail?: string;
  /** What the yes button says. A verb, not "OK". */
  verb: string;
  go: () => void | Promise<void>;
}

/* Held rather than passed, so a caller writes `ask({...})` at the point the
 * button is pressed and does not have to keep a piece of dialog state of its
 * own beside every destructive action. */
export function useConfirm() {
  const [asking, setAsking] = useState<Asking | null>(null);
  const ask = useCallback((what: Asking) => setAsking(what), []);
  const close = useCallback(() => setAsking(null), []);
  return { asking, ask, close };
}

export function Confirm({ asking, close }: { asking: Asking | null; close: () => void }) {
  return (
    <AlertDialog
      open={asking !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      {asking && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{asking.title}</AlertDialogTitle>
            {asking.detail && <AlertDialogDescription>{asking.detail}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void asking.go();
              }}
            >
              {asking.verb}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
