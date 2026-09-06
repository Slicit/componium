import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/* Join class names, letting a later one win over an earlier one.
 *
 * The reason this is not just clsx: Tailwind classes conflict by category
 * rather than by name. `px-2 px-4` is two different classes and both end up in
 * the stylesheet, so which one applies comes down to their order in the built
 * CSS rather than the order they were written in the markup. twMerge knows the
 * categories and drops the loser, which is what makes a component's default
 * padding overridable by a caller.
 *
 * Every shadcn component expects this to exist at this path.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
