import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";

import { createSpace, listSpaces, type Space } from "../../lib/DAO-api";
import { spaceRoute } from "../DAO/routes";
import { useAuth } from "./AuthProvider";

function SpaceListSkeleton() {
  return (
    <ul className="void-space-list" aria-busy="true" aria-label="Loading spaces">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i}>
          <div className="void-space-card void-space-card-skeleton" />
        </li>
      ))}
    </ul>
  );
}

export function SpacePickerScreen() {
  const { selectSpace, logout, error } = useAuth();
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listSpaces()
      .then((rows) => {
        if (!cancelled) setSpaces(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLocalError(err instanceof Error ? err.message : "Failed to load spaces");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onPick(space: Space) {
    setPickingId(space.id);
    setLocalError(null);
    try {
      await selectSpace(space.id, space.slug);
      navigate(spaceRoute(space.slug));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Could not connect");
    } finally {
      setPickingId(null);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    setLocalError(null);
    try {
      const space = await createSpace(trimmed);
      setSpaces((prev) => [...prev, space]);
      setNewName("");
      await selectSpace(space.id, space.slug);
      navigate(spaceRoute(space.slug));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to create space");
    } finally {
      setCreating(false);
    }
  }

  const message = localError ?? error;
  const busy = creating || pickingId !== null;

  return (
    <main className="void-screen void-glow">
      <div className="void-page">
        <header className="void-page-header">
          <div>
            <p className="void-eyebrow">Spaces</p>
            <h1 className="void-title-sm">Choose your company</h1>
            <p className="void-subtitle void-subtitle-tight">
              Each Space is an isolated company instance — Drive, agents, and sessions stay inside it.
            </p>
          </div>
          <button type="button" className="void-button void-button-ghost void-button-compact" onClick={logout}>
            Sign out
          </button>
        </header>

        {loading ? (
          <SpaceListSkeleton />
        ) : spaces.length === 0 ? (
          <div className="void-empty-card">
            <p className="void-title-xs">No Spaces yet</p>
            <p className="void-muted">
              Create your first company below. You can add more Spaces later and switch between them
              from Settings.
            </p>
          </div>
        ) : (
          <ul className="void-space-list">
            {spaces.map((s) => {
              const picking = pickingId === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`void-space-card${picking ? " void-space-card-active" : ""}`}
                    disabled={busy && !picking}
                    aria-busy={picking}
                    onClick={() => void onPick(s)}
                  >
                    <span className="void-space-name">{s.name}</span>
                    <span className="void-space-slug">/{s.slug}</span>
                    {picking ? (
                      <span className="void-space-status">
                        <span className="void-spinner void-spinner-inline" aria-hidden />
                        Connecting…
                      </span>
                    ) : (
                      <span className="void-space-status void-muted">Open Space →</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <section className="void-panel void-panel-inline" aria-labelledby="create-space-heading">
          <h2 id="create-space-heading" className="void-title-xs void-title-with-icon">
            <Plus size={18} aria-hidden />
            Create Space
          </h2>
          <form className="void-form void-form-inline" onSubmit={onCreate}>
            <input
              className="void-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Acme Corp"
              required
              disabled={busy}
              aria-label="New Space name"
            />
            <button className="void-button" type="submit" disabled={busy || !newName.trim()}>
              {creating ? "Creating…" : "Create"}
            </button>
          </form>
        </section>

        {message ? (
          <p className="void-error void-error-block" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
