import { useStore } from "@nanostores/react";

import { $gatewayState } from "@/store/session";

import { useAuth } from "./AuthProvider";

/** Dev-only placeholder — production path is DesktopController after auth. */
export function ConnectedShell() {
  const { spaceSlug, switchSpace, logout } = useAuth();
  const gatewayReady = useStore($gatewayState) === "open";

  return (
    <div className="void-screen">
      <header className="void-connected-bar">
        <div>
          <p className="void-eyebrow">Connected</p>
          <p className="void-title-xs">{spaceSlug ?? "Space"}</p>
        </div>
        <div className="void-connected-actions">
          <span className={gatewayReady ? "void-badge void-badge-ok" : "void-badge"}>
            {gatewayReady ? "Gateway ready" : "Gateway…"}
          </span>
          <button type="button" className="void-button void-button-ghost" onClick={switchSpace}>
            Switch Space
          </button>
          <button type="button" className="void-button void-button-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <p className="void-muted void-page">
        Auth + WS ticket flow complete. Mount Hermes chat UI here (D0/D2).
      </p>
    </div>
  );
}
