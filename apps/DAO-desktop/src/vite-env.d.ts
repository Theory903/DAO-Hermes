/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DAO_API_URL?: string;
  readonly VITE_DAO_WS_URL?: string;
  /** Set to `1` or `true` to show six-lens nav (Work, Memory, Automation, Control). Legacy routes unchanged. */
  readonly VITE_FEATURE_GRAPH_NAV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
