// @vitest-environment jsdom

/* Asking before doing something that cannot be undone.
 *
 * These exist because of what happened when window.confirm was replaced: the
 * whole suite still passed. The library's tests stub confirm and click delete,
 * and not one of them checked that the film was actually deleted, so the guard
 * on the most destructive action in the studio could be swapped out with
 * nothing objecting. That gap is the reason this file is here, and the tests
 * below are about the guard rather than about the dialog.
 *
 * The property being kept: nothing happens until the answer is yes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { Library } from './Library';

function film(name: string, over: Record<string, unknown> = {}) {
  return { film: name, size: 1024 * 1024, hasScore: false, preview: false, ...over };
}

let body: unknown;
let calls: string[];

beforeEach(() => {
  localStorage.clear();
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push((init?.method ?? 'GET') + ' ' + String(url));
    return { ok: true, json: async () => body } as Response;
  }));
  /* Deliberately made to say yes. If anything still reached it, the film
   * would be deleted and the test asserting otherwise would fail loudly
   * rather than pass for the wrong reason. */
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

async function show(entries: unknown[]) {
  body = {
    scores: '/scores', free: 1024 * 1024 * 100,
    canBuild: true, canUpload: true, canPrepare: true, current: '', entries,
  };
  render(<Library onOpen={() => {}} fps={25} />);
  await waitFor(() => {
    if (!document.querySelector('.lib-row')) throw new Error('no rows yet');
  });
}

const deletes = () => calls.filter((c) => c.startsWith('DELETE'));

describe('deleting a film', () => {
  it('asks first, and deletes nothing while it is asking', async () => {
    await show([film('a.mp4')]);
    fireEvent.click(screen.getByLabelText('Delete a.mp4'));

    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Delete a.mp4?')).toBeTruthy();
    expect(deletes()).toEqual([]);
  });

  it('says what goes with it when there is a score', async () => {
    /* The sentence is the reason for replacing window.confirm: the browser's
     * box could not say this, so a question about losing a score looked the
     * same as any other. */
    await show([film('a.mp4', { hasScore: true })]);
    fireEvent.click(screen.getByLabelText('Delete a.mp4'));
    expect(await screen.findByText(/The film and its score both go/)).toBeTruthy();
  });

  it('deletes when the answer is yes', async () => {
    await show([film('a.mp4', { hasScore: true })]);
    fireEvent.click(screen.getByLabelText('Delete a.mp4'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(deletes().some((c) => c.includes('/api/delete?file=a.mp4'))).toBe(true);
    });
    /* And it took the score with it, which is a separate flag on the request
     * and the difference between deleting a film and orphaning a score. */
    expect(deletes().some((c) => c.includes('score=1'))).toBe(true);
  });

  it('deletes nothing when the answer is no', async () => {
    await show([film('a.mp4')]);
    fireEvent.click(screen.getByLabelText('Delete a.mp4'));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep it' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deletes()).toEqual([]);
  });

  it('deletes nothing when the question is dismissed with Escape', async () => {
    /* window.confirm gave this for free. It is the answer people give most
     * often and the one most likely to be lost in a hand rolled dialog. */
    await show([film('a.mp4')]);
    fireEvent.click(screen.getByLabelText('Delete a.mp4'));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deletes()).toEqual([]);
  });
});

describe('starting an analysis again', () => {
  it('counts what would be thrown away before asking', async () => {
    /* A feature is tens of minutes of work per piece, so the number is the
     * whole question. */
    await show([film('a.mp4', {
      job: {
        kind: 'feature', state: 'interrupted', progress: 0.5, label: 'stopped',
        chunks: [
          { index: 0, from: 0, to: 10, state: 'done' },
          { index: 1, from: 10, to: 20, state: 'done' },
          { index: 2, from: 20, to: 30, state: 'queued' },
        ],
      },
    })]);

    const again = screen.getByRole('button', { name: /Reset|Restart|Again/i });
    fireEvent.click(again);
    expect(await screen.findByText(/throws away 2 finished pieces/)).toBeTruthy();
  });
});
