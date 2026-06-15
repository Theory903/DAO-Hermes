/**
 * Dev browser shim: Vite at :5174 has no Electron preload, but Hermes REST still
 * goes through `window.hermesDesktop.api`. Proxies to the DAO sidecar
 * `/api/v1/spaces/{id}/hermes-api/*` (same-origin in dev via Vite proxy).
 */
import type { DesktopConnectionConfig, HermesApiRequest } from "@/global";

import { DAOFetch } from "./DAO-api";
import { DAO_API_PREFIX } from "./DAO-config";
import { buildDAOSidecarConnection } from "./DAO-sidecar-connection";
import { getStoredSpaceId } from "./DAO-storage";

/** Map `/api/sessions?…` → `/api/v1/spaces/{id}/hermes-api/sessions?…` */
export function resolveHermesProxyUrl(spaceId: string, apiPath: string): string {
  const qIndex = apiPath.indexOf("?");
  const pathname = qIndex === -1 ? apiPath : apiPath.slice(0, qIndex);
  const query = qIndex === -1 ? "" : apiPath.slice(qIndex + 1);

  let rest = pathname;
  if (rest.startsWith("/api/")) rest = rest.slice("/api/".length);
  else if (rest.startsWith("/api")) rest = rest.slice("/api".length);
  if (rest.startsWith("/")) rest = rest.slice(1);

  const base = `${DAO_API_PREFIX}/spaces/${encodeURIComponent(spaceId)}/hermes-api/${rest}`;
  return query ? `${base}?${query}` : base;
}

async function browserHermesApi<T>(request: HermesApiRequest): Promise<T> {
  const spaceId = getStoredSpaceId();
  if (!spaceId) {
    throw new Error("No Space selected");
  }

  const init: RequestInit = {
    method: request.method ?? "GET",
  };

  if (request.body !== undefined) {
    init.body = JSON.stringify(request.body);
  }

  if (request.timeoutMs && typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    init.signal = AbortSignal.timeout(request.timeoutMs);
  }

  return DAOFetch<T>(resolveHermesProxyUrl(spaceId, request.path), init);
}

const noopBool = async () => false;
const noopOk = async () => ({ ok: true as const });

function browserConnectionConfig(): DesktopConnectionConfig {
  return {
    envOverride: false,
    mode: "remote",
    profile: null,
    remoteAuthMode: "token",
    remoteOauthConnected: false,
    remoteTokenPreview: null,
    remoteTokenSet: false,
    remoteUrl: buildDAOSidecarConnection().baseUrl,
  };
}

/** Install a minimal `window.hermesDesktop` when running outside Electron. */
export function installBrowserHermesBridge(): void {
  if (typeof window === "undefined" || window.hermesDesktop) {
    return;
  }

  const bridge = {
    api: browserHermesApi,
    getConnection: async () => buildDAOSidecarConnection(),
    revalidateConnection: async () => ({ ok: true, rebuilt: false }),
    touchBackend: noopOk,
    getGatewayWsUrl: async () => "",
    openSessionWindow: async () => ({ ok: false, error: "browser-mode" }),
    getBootProgress: async () => ({
      running: false,
      phase: "idle",
      message: "",
      progress: 100,
      error: null,
      fakeMode: false,
      timestamp: Date.now(),
    }),
    getConnectionConfig: async () => browserConnectionConfig(),
    saveConnectionConfig: async () => browserConnectionConfig(),
    applyConnectionConfig: async () => browserConnectionConfig(),
    testConnectionConfig: async () => ({
      ok: true,
      baseUrl: buildDAOSidecarConnection().baseUrl,
      version: null,
    }),
    probeConnectionConfig: async (remoteUrl: string) => ({
      baseUrl: remoteUrl,
      reachable: true,
      authMode: "token" as const,
      providers: [],
      version: null,
      error: null,
    }),
    oauthLoginConnectionConfig: async () => ({ ok: false, error: "browser-mode" }),
    oauthLogoutConnectionConfig: noopOk,
    profile: {
      get: async () => ({ active: "default", current: "default" }),
      set: async (name: string | null) => ({ active: name || "default", current: name || "default" }),
    },
    notify: noopBool,
    requestMicrophoneAccess: noopBool,
    readFileDataUrl: async () => "",
    readFileText: async () => ({
      binary: false,
      byteSize: 0,
      language: "text",
      mimeType: "text/plain",
      path: "",
      text: "",
      truncated: false,
    }),
    selectPaths: async () => [],
    writeClipboard: async (text: string) => {
      await navigator.clipboard?.writeText(text);
      return true;
    },
    saveImageFromUrl: noopBool,
    saveImageBuffer: async () => "",
    saveClipboardImage: async () => "",
    getPathForFile: (file: File) => file.name,
    normalizePreviewTarget: async () => null,
    watchPreviewFile: async () => ({ id: "", url: "" }),
    stopPreviewFileWatch: noopBool,
    openExternal: async (url: string) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    fetchLinkTitle: async () => "",
    sanitizeWorkspaceCwd: async (cwd?: string | null) => ({ cwd: cwd?.trim() || "", sanitized: false }),
    settings: {
      getDefaultProjectDir: async () => ({ defaultLabel: "Home", dir: null, resolvedCwd: "" }),
      pickDefaultProjectDir: async () => ({ canceled: true, dir: null }),
      setDefaultProjectDir: async () => ({ dir: null }),
    },
    revealLogs: async () => ({ ok: false, path: "" }),
    getRecentLogs: async () => ({ path: "", lines: [] }),
    readDir: async () => ({ path: "", entries: [] }),
    gitRoot: async () => null,
    worktrees: async () => ({}),
    terminal: {
      dispose: noopBool,
      onData: () => () => undefined,
      onExit: () => () => undefined,
      resize: noopBool,
      start: async () => ({ cwd: "", id: "browser", shell: "" }),
      write: noopBool,
    },
    onPreviewFileChanged: () => () => undefined,
    onBackendExit: () => () => undefined,
    onBootProgress: () => () => undefined,
    getBootstrapState: async () => ({ status: "idle" as const }),
    resetBootstrap: noopOk,
    repairBootstrap: noopOk,
    cancelBootstrap: async () => ({ ok: true, cancelled: false }),
    onBootstrapEvent: () => () => undefined,
    getVersion: async () => ({
      appVersion: "browser",
      electronVersion: "",
      nodeVersion: "",
      platform: "browser",
      hermesRoot: "",
    }),
    updates: {
      check: async () => ({ supported: false, reason: "browser-mode" }),
      apply: async () => ({ ok: false, error: "browser-mode" }),
      getBranch: async () => ({ branch: "main" }),
      setBranch: async (name: string) => ({ branch: name }),
      onProgress: () => () => undefined,
    },
    uninstall: {
      summary: async () => ({
        hermes_home: "",
        agent_installed: false,
        gui_installed: false,
        source_built_artifacts: [],
        packaged_app_paths: [],
        userdata_dir: "",
        userdata_exists: false,
        platform: "browser",
      }),
      run: async () => ({ ok: false, error: "browser-mode" }),
    },
    themes: {
      fetchMarketplace: async () => ({ extensionId: "", displayName: "", themes: [] }),
      searchMarketplace: async () => [],
    },
    signalDeepLinkReady: noopOk,
  };

  window.hermesDesktop = bridge as unknown as Window["hermesDesktop"];
}
