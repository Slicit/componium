/* Which rig the studio is pointed at, from the toolbar.
 *
 * On the working surface rather than only in admin, because choosing between
 * the room and the fully virtual one is something done while working rather
 * than while setting up: the boards are busy, or somebody else is using them,
 * or you want to see what a score does without anything moving.
 *
 * Changing it puts a running room away. The server does that and says so, and
 * this asks first, because a dropdown that silently stops a show is a dropdown
 * nobody trusts.
 */

import { useCallback, useEffect, useState } from 'react';

interface Shelf {
  shelf: boolean;
  current: string;
  rigs: string[];
}

const plain = (file: string) => file.replace(/\.toml$/, '');

export function RigPicker({ armed, onChanged }: {
  armed: boolean;
  /** Told after a switch, so the room and the devices reread what they draw. */
  onChanged: () => void;
}) {
  const [shelf, setShelf] = useState<Shelf>({ shelf: false, current: '', rigs: [] });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/rigs');
      if (res.ok) setShelf(await res.json());
    } catch {
      /* The toolbar keeps what it has; an unreachable studio is not news
         about the shelf. */
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const choose = async (file: string) => {
    if (file === shelf.current) return;
    if (armed && !window.confirm(
      `Switch to ${plain(file)}?\n\nThe room is live. Changing the rig stops it `
      + `and puts every output back to safe. You can go live again on the new `
      + `rig straight after.`
    )) return;

    setBusy(true);
    try {
      const res = await fetch('/api/rigs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rig: file }),
      });
      if (res.ok) {
        setShelf(await res.json());
        onChanged();
      } else {
        // Left where it was, rather than showing a rig the server refused.
        window.alert((await res.text()).trim() || 'that rig would not load');
        void load();
      }
    } catch {
      void load();
    } finally {
      setBusy(false);
    }
  };

  // One rig, or none: nothing to choose between, and a dropdown of one is a
  // control that only takes up room.
  if (!shelf.shelf || shelf.rigs.length < 2) return null;

  return (
    <label className="rig-pick" title={
      'Which rig this studio drives. Changing it stops a live room and puts '
      + 'every output back to safe.'}>
      <span className="rig-pick-name">rig</span>
      <select
        value={shelf.current}
        disabled={busy}
        aria-label="Rig in use"
        onChange={(e) => void choose(e.target.value)}
      >
        {shelf.rigs.map((r) => (
          <option key={r} value={r}>{plain(r)}</option>
        ))}
      </select>
    </label>
  );
}
