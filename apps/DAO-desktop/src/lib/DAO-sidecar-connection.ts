import type { HermesConnection } from "@/global";

import { DAOApiBase } from "./DAO-config";

const DEFAULT_SIDEcar_PORT = "9119";

/** True when the Electron preload exposed `window.hermesDesktop`. */
export function isDesktopBridgeAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.hermesDesktop);
}

/** Poll briefly — preload can lag the first renderer paint on dev reload. */
export async function waitForDesktopBridge(maxMs = 2500): Promise<boolean> {
  if (isDesktopBridgeAvailable()) return true;

  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (isDesktopBridgeAvailable()) return true;
  }

  return false;
}

/** Sidecar Hermes REST/WS base (dev-desktop.sh :9119 or VITE_DAO_API_URL). */
export function DAOSidecarBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_DAO_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.DEV) return `http://127.0.0.1:${DEFAULT_SIDEcar_PORT}`;
  const apiBase = DAOApiBase();
  return apiBase || `http://127.0.0.1:${DEFAULT_SIDEcar_PORT}`;
}

/** Renderer-facing connection when booting via DAO sidecar (no local Hermes child). */
export function buildDAOSidecarConnection(): HermesConnection {
  const baseUrl = DAOSidecarBaseUrl();
  return {
    authMode: "token",
    baseUrl,
    isFullscreen: false,
    logs: [],
    mode: "remote",
    nativeOverlayWidth: 0,
    profile: "default",
    source: "env",
    token: "",
    windowButtonPosition: null,
    wsUrl: "",
  };
}

/** GET /api/v1/health on the sidecar — used by boot recovery UI. */
export async function probeDAOSidecarHealth(): Promise<boolean> {
  try {
    const base = DAOSidecarBaseUrl();
    const res = await fetch(`${base}/api/v1/health`, { credentials: "include" });
    return res.ok;
  } catch {
    return false;
  }
}
