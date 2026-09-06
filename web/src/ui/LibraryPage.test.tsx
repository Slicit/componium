// @vitest-environment jsdom

/* The library as its own page, and the seam that leaves behind.
 *
 * Splitting a panel out of a page is mostly moving JSX, and the part that is
 * not is the part worth testing: the two pages are siblings now, the studio is
 * hidden rather than unmounted while the library is open, and "open this film"
 * has to cross between them without a parent that renders both at once.
 *
 * The other half is what the split made dangerous. The studio's film selector
 * was filled once, at load. That was survivable while the library sat on the
 * same page, where a film in one list and not the other was at least visible.
 * With the library elsewhere it is a selector quietly showing a snapshot of
 * whenever the tab was opened.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { Shell } from './Shell';
import { App } from '../App';

function libraryOf(entries: unknown[]) {
  return {
    scores: '/scores',
    free: 1024 * 1024 * 100,
    canBuild: true,
    canUpload: true,
    canPrepare: true,
    current: '',
    entries,
  };
}

const asked: string[] = [];

/* One fetch mock for the whole shell: the studio asks for a score, a rig and
 * the media list, the library asks for its own view. Each answered by path so
 * that a test can count what was asked for rather than only what was shown. */
function serve(media: unknown[] = []) {
  return vi.fn(async (url: string) => {
    asked.push(String(url));
    const path = String(url).split('?')[0];
    if (path === '/api/library') {
      return {
        ok: true,
        json: async () =>
          libraryOf([{ film: 'ready.mp4', size: 1024, hasScore: true, preview: false }]),
      } as Response;
    }
    if (path === '/api/media') {
      return { ok: true, json: async () => media } as Response;
    }
    if (path === '/api/score') {
      return {
        ok: true,
        json: async () => ({ title: 'a score', fps: 24, duration: 10, tracks: [] }),
      } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
}

beforeEach(() => {
  asked.length = 0;
  localStorage.clear();
  window.location.hash = '';
  vi.stubGlobal('fetch', serve());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = '';
});

describe('the library has a page', () => {
  it('the nav offers it', () => {
    render(<Shell />);
    const link = screen.getByRole('link', { name: 'Library' });
    expect(link.getAttribute('href')).toBe('#/library');
  });

  it('opens on its own route, with the studio put away rather than unmounted', async () => {
    render(<Shell />);
    await act(async () => {
      window.location.hash = '#/library';
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Library/ })).toBeTruthy();
    });

    /* Hidden, not gone. The studio is holding a score, an undo history and a
     * WebGL context, and rebuilding those to look at a list of films would be
     * the expensive way to save nothing. */
    const away = document.querySelector('.shell-away');
    expect(away).toBeTruthy();
    expect(away!.getAttribute('aria-hidden')).toBe('true');
  });

  it('opening a film takes you to the studio with it', async () => {
    render(<Shell />);
    await act(async () => {
      window.location.hash = '#/library';
    });

    const open = await screen.findByRole('button', { name: 'Open' });
    await act(async () => {
      fireEvent.click(open);
    });

    /* Back on the studio, and the studio asked for that film's score. Both
     * halves matter: arriving without the film would be a navigation that
     * silently dropped what was asked for. */
    expect(window.location.hash).toBe('#/');
    await waitFor(() => {
      expect(asked.some((u) => u.startsWith('/api/score?film=ready.mp4'))).toBe(true);
    });
  });
});

describe('the studio film list', () => {
  it('is read again when the studio comes back into view', async () => {
    /* The discrepancy this fixes. Upload a film on the library page, come
     * back, and before this the selector was still showing whatever was there
     * when the tab was opened. */
    const { rerender } = render(<App active={false} />);
    await waitFor(() => expect(asked.length).toBeGreaterThan(0));
    const before = asked.filter((u) => u.startsWith('/api/media')).length;

    await act(async () => {
      rerender(<App active={true} />);
    });

    await waitFor(() => {
      const after = asked.filter((u) => u.startsWith('/api/media')).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it('keeps what it has when the list cannot be read', async () => {
    /* A selector that empties itself because one fetch failed is worse than a
     * slightly old one: the score stays open, the film it belongs to vanishes
     * from the list, and it looks like the film was deleted. */
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(String(url));
        if (String(url).startsWith('/api/media')) throw new Error('offline');
        if (String(url).split('?')[0] === '/api/score') {
          return {
            ok: true,
            json: async () => ({ title: 'a score', fps: 24, duration: 10, tracks: [] }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      }),
    );

    const { rerender } = render(<App active={false} />);
    await act(async () => {
      rerender(<App active={true} />);
    });
    /* The point is that nothing threw and the component is still there. */
    await waitFor(() => expect(asked.some((u) => u.startsWith('/api/media'))).toBe(true));
    expect(document.querySelector('.app, .loading, .fail')).toBeTruthy();
  });
});
