/* What the composer is told before it reads a film.
 *
 * The one setting here is server-side, which is the difference between this
 * page and Room preview. Those two numbers describe a preview on one screen
 * and live in the browser that is looking at it. This one changes what gets
 * written into a score, so it belongs to the installation and travels with the
 * scores directory.
 *
 * Nothing here changes a score that already exists. A setting that silently
 * did would be worse than one that does nothing: an hour of analysis is a
 * thing a person planned around.
 */

import { useCallback, useEffect, useState } from 'react';

interface Settings {
  windGate: number;
  windGateDefault: number;
}

/* Where the gate is worth putting, in the words of what it does rather than of
 * what the number is. Measured across two fifteen minute cuts; the percentages
 * are how much of the film the fan stays off for. */
const GUIDE: { at: number; says: string }[] = [
  { at: 0, says: 'off: every camera move blows, which is how it was before' },
  { at: 0.15, says: 'gentle: the quietest drifts go quiet' },
  { at: 0.25, says: 'the measured trade: about two thirds of the murmur goes' },
  { at: 0.4, says: 'strict: only a real push-in speaks' },
  { at: 1, says: 'off entirely: the camera never blows, only the film does' },
];

function nearest(v: number): string {
  let best = GUIDE[0];
  for (const g of GUIDE) {
    if (Math.abs(g.at - v) < Math.abs(best.at - v)) best = g;
  }
  return best.says;
}

export function Analysis() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    fetch('/api/analysis')
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => setError('could not read the settings'));
  }, []);

  useEffect(load, [load]);

  const save = async (value: number) => {
    setError(null);
    setSaved(false);
    try {
      const r = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windGate: value }),
      });
      const body = await r.json();
      if (!r.ok) {
        setError(body.error || 'refused');
        return;
      }
      setSettings(body);
      setSaved(true);
    } catch {
      setError('could not save');
    }
  };

  if (!settings) {
    return (
      <div className="page">
        <h2>Analysis</h2>
        <p className="dim">{error ?? 'reading the settings'}</p>
      </div>
    );
  }

  const value = settings.windGate;
  const isDefault = Math.abs(value - settings.windGateDefault) < 1e-9;

  return (
    <div className="page">
      <h2>Analysis</h2>
      <p className="dim">
        What the composer is told before it reads a film. These belong to this installation and
        travel with the scores, unlike the room preview, which is a judgement about one screen.
      </p>

      <section className="adm-card">
        <div className="adm-set">
          <div className="adm-set-head">
            <label htmlFor="set-windgate">Wind gate</label>
            <span className="adm-set-value">{value.toFixed(2)}</span>
          </div>
          <input
            id="set-windgate"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={value}
            /* On change rather than when the drag ends. A drag writes a
             * thirty byte file a few times, which is nothing, and the two
             * events that would avoid it (pointerup, keyup) are not the
             * ones a keyboard or a test produces. RoomDefaults writes on
             * change for the same reason. */
            onChange={(e) => {
              const next = Number(e.target.value);
              setSettings({ ...settings, windGate: next });
              void save(next);
            }}
          />
          <p className="dim small">{nearest(value)}</p>
          <p className="dim small">
            A camera moving is the weakest evidence of wind there is: a pan across a still room
            looks the same as travelling through air. Below this level, with nothing in the film
            agreeing, the fan stays off. Nothing a cause asks for is ever gated, so raising this
            cannot cost a gust the film actually gave: it only ever removes wind the camera
            invented.
          </p>
          <button
            className="small-btn"
            disabled={isDefault}
            onClick={() => void save(settings.windGateDefault)}
            title={
              isDefault ? 'Already the default' : 'Back to ' + settings.windGateDefault.toFixed(2)
            }
          >
            {isDefault ? 'default' : 'reset to ' + settings.windGateDefault.toFixed(2)}
          </button>
        </div>
      </section>

      {error && <p className="adm-warn">{error}</p>}
      {saved && !error && (
        <p className="dim small">
          Saved. It applies to the next analysis: a score already built is untouched until it is
          rebuilt from the library.
        </p>
      )}
    </div>
  );
}
