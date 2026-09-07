// @vitest-environment jsdom

/* The right-click menu, which had no tests at all.
 *
 * That is worth stating plainly, because it is how this file came to exist:
 * the whole component was swapped from hand-written to Radix and the suite
 * stayed green, exactly as it did when window.confirm was replaced. The menu
 * is how tracks are added, cues split and points deleted — the studio's main
 * editing affordance — and nothing was checking any of it.
 *
 * So these are not tests of the migration. They are the tests the component
 * should have had, written against the behaviour it is supposed to have, and
 * they would have failed against a bad swap in either direction.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { Menu, type MenuEntry } from './Menu';

function show(items: MenuEntry[]) {
  const onClose = vi.fn();
  render(<Menu x={40} y={60} items={items} onClose={onClose} />);
  return onClose;
}

const item = (label: string, over: Partial<Extract<MenuEntry, { label: string }>> = {}) => ({
  label,
  run: vi.fn(),
  ...over,
});

afterEach(cleanup);

describe('what it offers', () => {
  it('lists what can be done here', async () => {
    show([item('Split'), item('Delete')]);
    expect(await screen.findByRole('menuitem', { name: /Split/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toBeTruthy();
  });

  it('shows the keystroke that does the same thing', async () => {
    show([item('Delete', { key: 'Del' })]);
    const entry = await screen.findByRole('menuitem', { name: /Delete/ });
    expect(entry.textContent).toContain('Del');
  });

  it('separates groups without offering the separator as a choice', async () => {
    show([item('Copy'), { separator: true }, item('Delete')]);
    await screen.findByRole('menuitem', { name: /Copy/ });
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });
});

describe('choosing', () => {
  it('runs the item and closes', async () => {
    const split = item('Split');
    const onClose = show([split]);
    fireEvent.click(await screen.findByRole('menuitem', { name: /Split/ }));
    expect(split.run).toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  /* Not covered here, deliberately: the keyboard navigation itself.
   *
   * Arrow keys, Home, End and typeahead are Radix's, and they work by
   * moving real DOM focus inside a focus scope. None of that lands in
   * jsdom, where focus does not enter the menu at all, so a test of it here
   * would be measuring the test environment. Three attempts at writing
   * around that produced three tests that passed for the wrong reason.
   *
   * It is covered in a real browser instead, which also turned up that the
   * list stops at its last item rather than wrapping: web/e2e/menu.spec.ts.
   * Everything either side of it is asserted below and above, that the
   * right items are offered, that choosing one runs it and closes, that a
   * disabled one does not run, and that Escape and a scroll both get out
   * without running anything.
   */

  it('does not run an item that says why it cannot', async () => {
    /* Split is disabled with a reason rather than hidden, because "why is
     * Split missing" is a worse question than "why is Split grey". Disabled
     * has to actually mean it. */
    const blocked = item('Split', { why: 'the playhead is not inside this span' });
    show([blocked]);
    const entry = await screen.findByRole('menuitem', { name: /Split/ });
    fireEvent.click(entry);
    expect(blocked.run).not.toHaveBeenCalled();
  });
});

describe('getting out of it', () => {
  it('closes on Escape without running anything', async () => {
    const only = item('Delete');
    const onClose = show([only]);
    const menu = await screen.findByRole('menu');
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(only.run).not.toHaveBeenCalled();
  });

  it('closes when the timeline is scrolled under it', async () => {
    /* Kept by hand, because the library deliberately does not do it: a menu
     * hanging off a button should travel with the button. This one hangs off a
     * point in a timeline, and that point means something else once the
     * timeline has moved. */
    const onClose = show([item('Delete')]);
    await screen.findByRole('menu');
    fireEvent.wheel(window);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
