// @vitest-environment jsdom

/* What a control is for, said to a keyboard as well as a pointer.
 *
 * The browser's `title` answers a mouse and nothing else: it never appears on
 * focus, so tabbing through the studio's toolbar explained nothing at all.
 * That is the whole reason these exist, so it is the first thing asserted.
 *
 * The second is subtler and is why `title` was not simply left alongside. A
 * `title` on a control that also has an `aria-label` is a second name for the
 * same thing, and which one gets read out depends on the screen reader. A
 * tooltip is wired with aria-describedby, so it is a description of a control
 * that still has one name.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { Tip, TooltipProvider } from './Tip';

function show(say = 'The room preview') {
  render(
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <Tip say={say}>
        <button className="toggle">room</button>
      </Tip>
    </TooltipProvider>,
  );
  return screen.getByRole('button', { name: 'room' });
}

afterEach(cleanup);

describe('a tip', () => {
  it('says nothing until it is asked', () => {
    show();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('answers the keyboard, which is the whole point', async () => {
    const button = show();
    fireEvent.focus(button);
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('The room preview');
  });

  it('answers a pointer too', async () => {
    const button = show();
    fireEvent.pointerMove(button, { pointerType: 'mouse' });
    await waitFor(() =>
      expect(screen.queryAllByText('The room preview').length).toBeGreaterThan(0),
    );
  });

  it('describes the control rather than renaming it', async () => {
    /* The control keeps its own accessible name. If this became the name, an
     * icon button would be announced as its explanation instead of as what it
     * is, and two controls with the same explanation would sound identical. */
    const button = show();
    fireEvent.focus(button);
    await screen.findByRole('tooltip');
    expect(button.getAttribute('aria-describedby')).toBeTruthy();
    expect(button.getAttribute('aria-label')).toBeNull();
    expect(button.textContent).toBe('room');
  });

  it('leaves the control alone otherwise', () => {
    /* Rendered as-is rather than wrapped in a div, so a row of toolbar buttons
     * is still a row of toolbar buttons and nothing about the layout moves. */
    const button = show();
    expect(button.className).toBe('toggle');
    expect(button.parentElement?.tagName).not.toBe('SPAN');
  });
});
