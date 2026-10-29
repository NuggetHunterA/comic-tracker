/// <reference types="vite/client" />

declare const __VERSION__: string;

interface ImportMetaEnv {
  // Account the app signs in with on its own, set in the Vercel project settings.
  readonly VITE_APP_EMAIL?: string;
  readonly VITE_APP_PASSWORD?: string;
}
