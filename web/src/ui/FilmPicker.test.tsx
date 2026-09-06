// @vitest-environment jsdom

/* Choosing a film by typing.
 *
 * This replaced a <select>, and a select got three things right for free that
 * a hand built popover has to be told: it closes when you press Escape, it
 * closes when you click away, and the keyboard can reach every option without
 * a pointer. Each of those is asserted here because each is the kind of thing
 * that works on the day it is written and quietly stops working later.
 *
 * The filtering itself is core/paging's `matches`, which has its own tests.
 * What is checked here is that this control uses it, so that the toolbar and
 * the library's search box agree about what a query means.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { FilmPicker } from './FilmPicker';

const FILMS = [
  { name: 'Rebel.Moon.Part.Two.The.Scargiver.2024.1080p.mkv' },
  { name: 'Wanted.2008.BluRay.1080p.mkv' },
  { name: 'Dune.Part.Two.2024.2160p.mkv' },
];

function show(over: Partial<React.ComponentProps<typeof FilmPicker>> = {}) {
  const onPick = vi.fn();
  render(<FilmPicker films={FILMS} value="" fallback="(score)" onPick={onPick} {...over} />);
  return onPick;
}

const openIt = () => fireEvent.click(screen.getByRole('button', { name: /^Film:/ }));
const options = () => screen.queryAllByRole('option').map((o) => o.textContent?.trim());

afterEach(cleanup);

describe('what it shows', () => {
  it('names the film that is open, and says so to a screen reader', () => {
    show({ value: 'Wanted.2008.BluRay.1080p.mkv' });
    expect(screen.getByRole('button', { name: /Wanted/ })).toBeTruthy();
  });

  it('falls back to the score title rather than showing nothing', () => {
    show({ value: '' });
    expect(screen.getByRole('button', { name: /\(score\)/ })).toBeTruthy();
  });

  it('is closed until asked', () => {
    show();
    expect(screen.queryByRole('listbox')).toBeNull();
    openIt();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });
});

describe('searching', () => {
  it('matches anywhere in the name, not only the start', () => {
    show();
    openIt();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'scargiver' } });
    expect(options()).toEqual([FILMS[0].name]);
  });

  it('takes several terms in any order', () => {
    /* The same rule the library search follows. "two 2160" should find Dune
     * whether or not those words sit next to each other. */
    show();
    openIt();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2160 two' } });
    expect(options()).toEqual([FILMS[2].name]);
  });

  it('says so when nothing matches, instead of showing an empty box', () => {
    show();
    openIt();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } });
    expect(options()).toEqual([]);
    expect(screen.getByText(/nothing matches/)).toBeTruthy();
  });

  it('counts what is being shown', () => {
    show();
    openIt();
    expect(screen.getByText('3 films')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'two' } });
    expect(screen.getByText('2 of 3')).toBeTruthy();
  });
});

describe('the keyboard', () => {
  it('picks the highlighted film with Enter', () => {
    const onPick = show();
    openIt();
    const find = screen.getByRole('combobox');
    fireEvent.change(find, { target: { value: 'wanted' } });
    fireEvent.keyDown(find, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(FILMS[1].name);
  });

  it('moves down the list with the arrows', () => {
    const onPick = show();
    openIt();
    const find = screen.getByRole('combobox');
    fireEvent.keyDown(find, { key: 'ArrowDown' });
    fireEvent.keyDown(find, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(FILMS[1].name);
  });

  it('does not run off either end of the list', () => {
    const onPick = show();
    openIt();
    const find = screen.getByRole('combobox');
    for (let i = 0; i < 9; i++) fireEvent.keyDown(find, { key: 'ArrowDown' });
    fireEvent.keyDown(find, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(FILMS[2].name);

    onPick.mockClear();
    openIt();
    const again = screen.getByRole('combobox');
    for (let i = 0; i < 9; i++) fireEvent.keyDown(again, { key: 'ArrowUp' });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(FILMS[0].name);
  });

  it('keeps the cursor inside the list when filtering shortens it', () => {
    /* Arrow to the third film, then type something that leaves one. Enter has
     * to mean the film that is showing, not the third row of a list that no
     * longer has three. */
    const onPick = show();
    openIt();
    const find = screen.getByRole('combobox');
    fireEvent.keyDown(find, { key: 'ArrowDown' });
    fireEvent.keyDown(find, { key: 'ArrowDown' });
    fireEvent.change(find, { target: { value: 'scargiver' } });
    fireEvent.keyDown(find, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(FILMS[0].name);
  });

  it('closes on Escape without choosing anything', () => {
    const onPick = show();
    openIt();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('lets Tab leave rather than trapping focus', () => {
    show();
    openIt();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Tab' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('the pointer', () => {
  it('picks a film when its row is clicked', () => {
    const onPick = show();
    openIt();
    fireEvent.click(screen.getByRole('button', { name: FILMS[2].name }));
    expect(onPick).toHaveBeenCalledWith(FILMS[2].name);
  });

  it('closes when the press starts somewhere else', () => {
    show();
    openIt();
    act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('forgets the query, so it opens ready for a fresh search', () => {
    show();
    openIt();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'wanted' } });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    openIt();
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('');
    expect(options()).toHaveLength(FILMS.length);
  });
});
