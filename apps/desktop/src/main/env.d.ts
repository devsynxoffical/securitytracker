/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  /** Server address baked in at build time (electron-vite exposes MAIN_VITE_* to the main process). */
  readonly MAIN_VITE_API_URL?: string;
}
