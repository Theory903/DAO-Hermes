const DEFAULT_DAO_API_PORT = "9119";

/** Sidecar REST base — override via Vite env in D0 build. */
export function DAOApiBase(): string {
  const fromEnv = import.meta.env.VITE_DAO_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  // Vite dev proxies /api/v1 → sidecar; same-origin avoids CORS + credentials issues.
  if (import.meta.env.DEV) return "";
  return `http://127.0.0.1:${DEFAULT_DAO_API_PORT}`;
}

/** WebSocket origin for `/api/ws` (no path). */
export function DAOWsBase(): string {
  const fromEnv = import.meta.env.VITE_DAO_WS_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const apiBase = DAOApiBase();
  if (apiBase) return apiBase.replace(/^http/, "ws");
  // REST is proxied in dev; WS still connects to the sidecar directly.
  return `ws://127.0.0.1:${DEFAULT_DAO_API_PORT}`;
}

export const DAO_API_PREFIX = "/api/v1";

/** Warn when production build ships without an explicit API URL. */
export function assertDAOApiConfigured(): void {
  if (import.meta.env.DEV) return;
  if (!import.meta.env.VITE_DAO_API_URL?.trim()) {
    console.warn(
      "[DAO] VITE_DAO_API_URL is unset — defaulting to loopback; set it for production builds.",
    );
  }
}
