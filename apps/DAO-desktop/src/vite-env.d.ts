/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DAO_API_URL?: string;
  readonly VITE_DAO_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
