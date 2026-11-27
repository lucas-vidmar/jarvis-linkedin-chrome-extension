interface ImportMetaEnv {
  readonly WXT_JARVIS_RECIPIENT?: string;
  readonly WXT_GOOGLE_CLIENT_ID?: string;
  readonly DEV?: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
