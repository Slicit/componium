// @vitest-environment jsdom

/* Choosing the rig from the working surface.
 *
 * The one thing this must not do is stop a show without saying so. The server
 * puts the room away when the rig changes, which is right, and a dropdown that
 * does that silently is a dropdown nobody touches twice.
 */

import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RigPicker } from './RigPicker';

let shelf: { shelf: boolean; current: string; rigs: string[] };
let sent: string[] = [];

beforeEach(() => {
  shelf = { shelf: true, current: 'esp32-rig.toml', rigs: ['esp32-rig.toml', 'virtual-rig.toml'] };
  sent = [];
  vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
    if (!init || init.method !== 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(shelf) } as Response);
    }
    sent.push(String(init.body));
    return Promise.resolve({ ok: true, json: () => Promise.resolve(shelf) } as Response);
  }));
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('alert', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pick = () => screen.getByLabelText('Rig in use') as HTMLSelectElement;

async function show(armed = false, onChanged = () => {}) {
  render(<RigPicker armed={armed} onChanged={onChanged} />);
  await waitFor(() => expect(pick()).toBeTruthy());
}

describe('the rig picker', () => {
  it('shows what is in use, by the name the shelf uses', async () => {
    await show();
    expect(pick().value).toBe('esp32-rig.toml');
    expect(screen.getByText('virtual-rig')).toBeTruthy();
  });

  it('switches, and tells the studio to reread what it draws', async () => {
    /* Without the callback the room keeps drawing the rig that was loaded with
       the page, which is the wrong room with a straight face. */
    const changed = vi.fn();
    await show(false, changed);
    fireEvent.change(pick(), { target: { value: 'virtual-rig.toml' } });
    await waitFor(() => expect(sent.length).toBe(1));
    expect(JSON.parse(sent[0])).toEqual({ rig: 'virtual-rig.toml' });
    await waitFor(() => expect(changed).toHaveBeenCalled());
  });

  it('asks before stopping a live room', async () => {
    await show(true);
    fireEvent.change(pick(), { target: { value: 'virtual-rig.toml' } });
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(sent.length).toBe(1));
  });

  it('does not switch when the question is answered no', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    await show(true);
    fireEvent.change(pick(), { target: { value: 'virtual-rig.toml' } });
    expect(sent.length).toBe(0);
  });

  it('does not ask when nothing is live', async () => {
    // Nothing is being driven, so there is nothing to interrupt and nothing to
    // warn about. A confirmation for a harmless act is one people learn to
    // click through.
    await show(false);
    fireEvent.change(pick(), { target: { value: 'virtual-rig.toml' } });
    expect(window.confirm).not.toHaveBeenCalled();
    // Let the switch it did start finish, so its state lands inside the
    // test rather than after it.
    await waitFor(() => expect(sent.length).toBe(1));
  });

  it('stays where it was when the server refuses', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      if (!init || init.method !== 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(shelf) } as Response);
      }
      return Promise.resolve({
        ok: false, text: () => Promise.resolve('chose it, but it will not load'),
      } as Response);
    }));
    await show();
    fireEvent.change(pick(), { target: { value: 'virtual-rig.toml' } });
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    // Showing a rig the server refused would be the page and the room
    // disagreeing about which one is in use.
    await waitFor(() => expect(pick().value).toBe('esp32-rig.toml'));
  });

  it('takes up no room when there is nothing to choose between', async () => {
    shelf = { shelf: true, current: 'only.toml', rigs: ['only.toml'] };
    await act(async () => { render(<RigPicker armed={false} onChanged={() => {}} />); });
    expect(screen.queryByLabelText('Rig in use')).toBeNull();
  });
});
