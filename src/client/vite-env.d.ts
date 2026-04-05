/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SNAP_API_TOKEN?: string;
  readonly VITE_SNAP_LENS_GROUP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
