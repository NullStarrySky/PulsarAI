export type HostTarget = "desktop-electron" | "mobile-tauri";

export interface DatabaseRecord<T> {
  id: string | null;
  value: T;
}

export interface HostDatabase {
  selectAll<T>(table: string): Promise<Array<DatabaseRecord<T>>>;
  selectByField<T>(table: string, field: "packageId" | "conversationid", value: string): Promise<Array<DatabaseRecord<T>>>;
  selectOne<T>(table: string, id: string): Promise<T | null>;
  upsert<T>(table: string, id: string, value: T): Promise<void>;
  remove(table: string, id: string): Promise<void>;
  resetCharacterData(): Promise<void>;
}

export interface HostPluginStorage {
  load<T>(): Promise<T[]>;
  save<T>(plugin: T): Promise<void>;
  remove(pluginId: string): Promise<void>;
  search<T>(query: string, limit?: number): Promise<T[]>;
}

export interface HostConfig {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface HostSecrets {
  has(name: string): Promise<boolean>;
  preview(name: string): Promise<string>;
  set(name: string, value: string): Promise<void>;
  clearValue(name: string): Promise<void>;
  remove(name: string): Promise<void>;
}

export interface HostDialog {
  open(options: Record<string, unknown>): Promise<string | string[] | null>;
  save(options: Record<string, unknown>): Promise<string | null>;
}

export interface HostDesktopWindow {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  hide(): Promise<void>;
}

export interface HostDesktop {
  window: HostDesktopWindow;
  openExternal(url: string): Promise<void>;
  executeEnvironmentCommand(name: string): Promise<{ code: number; stdout: string; stderr: string }>;
  subWindow: {
    create(input: { label: string; url: string; title?: string; width?: number; height?: number; hidden?: boolean }): Promise<void>;
    send(label: string, event: string, payload: unknown): Promise<void>;
    listen(event: string, listener: (payload: unknown) => void): () => void;
    close(label: string): Promise<void>;
  };
}

export interface HostMobile {
  battery: {
    getStatus(): Promise<{ available: boolean; isOptimized: boolean; isIgnoringOptimizations: boolean }>;
    requestExemption(): Promise<void>;
    openSettings(): Promise<void>;
  };
  navigationBar: {
    setColor(color: "light" | "dark"): Promise<boolean>;
  };
  speechRecognition: {
    isAvailable(): Promise<boolean>;
  };
  stt: { invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T> };
}

export interface HostPlatform {
  platform(): string;
  osType(): string;
  arch(): string;
  family(): string;
  version(): string;
  isMobile: boolean;
}

export interface HostNotifications {
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<"granted" | "denied">;
  send(input: { title: string; body: string }): Promise<void>;
}

export interface Host {
  target: HostTarget;
  database: HostDatabase;
  plugins: HostPluginStorage;
  config: HostConfig;
  secrets: HostSecrets;
  dialog: HostDialog;
  platform: HostPlatform;
  notifications: HostNotifications;
  external: { open(url: string): Promise<void> };
  /** Shared, typed command groups that do not belong in renderer feature code. */
  backup: { invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T> };
  migration: { invoke<T>(command: string, payload: { path: string }): Promise<T> };
  network: {
    webSearch<T>(request: unknown): Promise<T>;
    modelProxyFetch<T>(request: unknown): Promise<T>;
  };
  local: { invoke<T>(area: "tts" | "stt", command: string, payload?: Record<string, unknown>): Promise<T> };
  speech: { invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T> };
  webSocket: typeof WebSocket;
  desktop?: HostDesktop;
  mobile?: HostMobile;
}
