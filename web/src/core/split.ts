/* Where the split between the picture and the room can be.
 *
 * Twelve columns, because that is a grid a person can aim at: dragging lands
 * on a twelfth rather than on 47.3%, so two sessions on two machines end up
 * with the same layout and a half-and-half split is exactly half. Free
 * dragging feels more capable and is worse: nobody wants 5.7 columns, and
 * without snapping nobody can get back to six.
 *
 * The arithmetic lives here rather than beside the hook that uses it because
 * the model needs it too. A stored viewport has to clamp the numbers it reads
 * off disk, and core/viewport.ts was importing them from a file that imports
 * React to get them. Nothing about a column boundary needs a component.
 */

export const COLUMNS = 12;

/**
 * Neither pane may be squeezed to nothing.
 *
 * Two columns is already narrow enough that the room is a stamp and the video
 * is a strip; below that the pane stops being a preview and becomes a handle
 * you cannot find again. The limit is what makes the drag safe to let go of.
 */
export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = COLUMNS - MIN_COLUMNS;

export const MIN_HEIGHT = 160;
export const MAX_HEIGHT = 900;

/** Half and half. */
export const DEFAULT_COLUMNS = COLUMNS / 2;
export const DEFAULT_HEIGHT = 300;

/** Which column boundary a drag at this fraction of the width lands on. */
export function columnsAt(fraction: number): number {
  if (!isFinite(fraction)) return DEFAULT_COLUMNS;
  const snapped = Math.round(fraction * COLUMNS);
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, snapped));
}

export function clampHeight(px: number): number {
  if (!isFinite(px)) return DEFAULT_HEIGHT;
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(px)));
}
