/* Who may open this studio.
 *
 * The server decides; this asks it and shows the answer. Every refusal it can
 * produce is one the server produced, printed as it arrived, because a page
 * that invents its own reasons for a refusal eventually disagrees with the
 * thing doing the refusing.
 */

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { Confirm, useConfirm } from '../Confirm';
import type { Role } from '../../core/session';

interface Person {
  name: string;
  role: Role;
  created: string;
}

interface Answer {
  users: Person[];
  you: string;
  roles: Role[];
}

const WHAT: Record<Role, string> = {
  viewer: 'Watches. Changes nothing.',
  operator: 'Authors scores and runs shows.',
  admin: 'Also the hardware, the boards, and this page.',
};

export function Users() {
  const [data, setData] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('operator');
  const [password, setPassword] = useState('');
  const [changing, setChanging] = useState<string | null>(null);
  const confirm = useConfirm();

  const load = useCallback(() => {
    fetch('/api/users')
      .then((r) => r.json())
      .then((body) => {
        if (body.error) setError(body.error);
        else setData(body as Answer);
      })
      .catch(() => setError('could not read the user list'));
  }, []);

  useEffect(load, [load]);

  const send = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const answer = await r.json();
      if (!r.ok) {
        setError(answer.error || 'refused');
        return false;
      }
      setData(answer as Answer);
      return true;
    } catch {
      setError('could not reach the studio');
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="page">
        <h2>Users</h2>
        <p className="dim">{error ?? 'reading the user list'}</p>
      </div>
    );
  }

  const admins = data.users.filter((u) => u.role === 'admin').length;

  return (
    <div className="page page-wide">
      <div className="adm-row">
        <h2>Users</h2>
        <span className="spacer" />
        {!adding && <button onClick={() => setAdding(true)}>Add someone</button>}
      </div>

      <p className="dim small">
        Everyone here can open this studio. Passwords are not kept: each person has a verifier their
        password reproduces, which cannot be turned back into one. Somebody who forgets theirs needs
        a new one set here rather than recovered.
      </p>

      {error && <p className="adm-warn">{error}</p>}

      <section className="adm-card">
        <div className="adm-scroll">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Can</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => {
                const isYou = u.name.toLowerCase() === data.you.toLowerCase();
                const lastAdmin = u.role === 'admin' && admins === 1;
                return (
                  <tr key={u.name}>
                    <td>
                      {u.name}
                      {isYou && <span className="dim small"> you</span>}
                    </td>
                    <td>
                      <label className="dim small">
                        <select
                          value={u.role}
                          aria-label={'Role for ' + u.name}
                          disabled={busy || lastAdmin}
                          title={
                            lastAdmin
                              ? 'The only administrator. Make somebody else one first.'
                              : WHAT[u.role]
                          }
                          onChange={(e) =>
                            void send({ action: 'role', name: u.name, role: e.target.value })
                          }
                        >
                          {data.roles.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </label>
                    </td>
                    <td className="adm-actions">
                      <button
                        disabled={busy}
                        onClick={() => setChanging(changing === u.name ? null : u.name)}
                        title={'Set a new password for ' + u.name}
                        aria-label={'Set a new password for ' + u.name}
                        className="icon-btn"
                      >
                        <Icon name="edit" />
                      </button>
                      <button
                        className="danger icon-btn"
                        disabled={busy || isYou || lastAdmin}
                        title={
                          isYou
                            ? 'You cannot remove yourself'
                            : lastAdmin
                              ? 'The only administrator'
                              : 'Remove ' + u.name
                        }
                        aria-label={'Remove ' + u.name}
                        onClick={() =>
                          confirm.ask({
                            title: 'Remove ' + u.name + '?',
                            detail:
                              'They are signed out of wherever they are, immediately, and ' +
                              'cannot sign in again.',
                            verb: 'Remove',
                            go: async () => {
                              await send({ action: 'remove', name: u.name });
                            },
                          })
                        }
                      >
                        <Icon name="trash" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {changing && (
        <section className="adm-card adm-inset">
          <h3>A new password for {changing}</h3>
          <div className="adm-row">
            <input
              type="password"
              value={password}
              aria-label={'New password for ' + changing}
              placeholder="at least 12 characters"
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              className="adm-go"
              disabled={busy || password.length < 12}
              onClick={async () => {
                const ok = await send({ action: 'password', name: changing, password });
                if (ok) {
                  setPassword('');
                  setChanging(null);
                }
              }}
            >
              Set it
            </button>
            <button
              onClick={() => {
                setPassword('');
                setChanging(null);
              }}
            >
              Cancel
            </button>
          </div>
          <p className="dim small">
            Setting somebody else's password signs them out of wherever they are.
          </p>
        </section>
      )}

      {adding && (
        <section className="adm-card adm-inset">
          <h3>Add someone</h3>
          <div className="adm-row">
            <input
              type="text"
              value={name}
              aria-label="Their name"
              placeholder="name"
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            <label className="dim small">
              can{' '}
              <select
                value={role}
                aria-label="What they can do"
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {data.roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <input
              type="password"
              value={password}
              aria-label="Their password"
              placeholder="at least 12 characters"
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              className="adm-go"
              disabled={busy || !name.trim() || password.length < 12}
              onClick={async () => {
                const ok = await send({ action: 'add', name: name.trim(), role, password });
                if (ok) {
                  setName('');
                  setPassword('');
                  setAdding(false);
                }
              }}
            >
              Add
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setName('');
                setPassword('');
              }}
            >
              Cancel
            </button>
          </div>
          <p className="dim small">{WHAT[role]}</p>
        </section>
      )}

      <Confirm asking={confirm.asking} close={confirm.close} />
    </div>
  );
}
