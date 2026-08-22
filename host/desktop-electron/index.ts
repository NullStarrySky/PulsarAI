import type { Host } from "../contracts";

declare global {
  interface Window {
    pulsarHost?: ElectronHostBridge;
  }
}

interface ElectronHostBridge {
  invoke<T>(namespace: string, method: string, payload?: Record<string, unknown>): Promise<T>;
  listen(event: string, listener: (payload: unknown) => void): () => void;
}

const bridge = window.pulsarHost;
if (!bridge) {
  throw new Error("Electron preload bridge is unavailable.");
}

const invoke = <T>(namespace: string, method: string, payload?: Record<string, unknown>) =>
  bridge.invoke<T>(namespace, method, payload);

const platform = navigator.userAgent.toLocaleLowerCase().includes("windows")
  ? "windows"
  : navigator.userAgent.toLocaleLowerCase().includes("mac")
    ? "macos"
    : "linux";

class DesktopWebSocket extends WebSocket {
  constructor(url: string | URL, protocolsOrOptions?: string | string[] | { headers?: Record<string, string> }) {
    super(url, typeof protocolsOrOptions === "string" || Array.isArray(protocolsOrOptions) ? protocolsOrOptions : undefined);
  }
}

async function desktopSpeech<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  if (command === "stop") {
    speechSynthesis.cancel();
    return undefined as T;
  }
  if (command === "isSpeaking") return speechSynthesis.speaking as T;
  if (command === "status") return { initialized: true, voiceCount: speechSynthesis.getVoices().length } as T;
  if (command === "voices") {
    const language = typeof payload?.language === "string" ? payload.language : "";
    return speechSynthesis.getVoices()
      .filter((voice) => !language || voice.lang.startsWith(language))
      .map((voice) => ({ id: voice.voiceURI, name: voice.name, language: voice.lang })) as T;
  }
  const request = payload?.request as Record<string, unknown> | undefined;
  if (!request || typeof request.text !== "string" && command === "speak") throw new Error("系统 TTS 文本不能为空。");
  if (command === "speak" || command === "preview") {
    const utterance = new SpeechSynthesisUtterance(String(request?.text ?? "测试语音"));
    const voiceId = typeof request?.voiceId === "string" ? request.voiceId : "";
    utterance.voice = speechSynthesis.getVoices().find((voice) => voice.voiceURI === voiceId) ?? null;
    if (typeof request?.language === "string") utterance.lang = request.language;
    if (typeof request?.rate === "number") utterance.rate = request.rate;
    if (typeof request?.pitch === "number") utterance.pitch = request.pitch;
    if (typeof request?.volume === "number") utterance.volume = request.volume;
    speechSynthesis.speak(utterance);
    return undefined as T;
  }
  throw new Error(`Unsupported desktop speech command: ${command}`);
}

export const host: Host = {
  target: "desktop-electron",
  database: {
    selectAll: (table) => invoke("database", "selectAll", { table }),
    selectByField: (table, field, value) => invoke("database", "selectByField", { table, field, value }),
    selectOne: (table, id) => invoke("database", "selectOne", { table, id }),
    upsert: (table, id, value) => invoke("database", "upsert", { table, id, value }),
    remove: (table, id) => invoke("database", "remove", { table, id }),
    resetCharacterData: () => invoke("database", "resetCharacterData"),
  },
  plugins: {
    load: () => invoke("plugins", "load"),
    save: (plugin) => invoke("plugins", "save", { plugin }),
    remove: (pluginId) => invoke("plugins", "remove", { pluginId }),
    search: (query, limit) => invoke("plugins", "search", { query, limit }),
  },
  config: {
    get: (key) => invoke("config", "get", { key }),
    set: (key, value) => invoke("config", "set", { key, value }),
    remove: (key) => invoke("config", "remove", { key }),
  },
  secrets: {
    has: (name) => invoke("secrets", "has", { name }),
    set: (name, value) => invoke("secrets", "set", { name, value }),
    clearValue: (name) => invoke("secrets", "clearValue", { name }),
    remove: (name) => invoke("secrets", "remove", { name }),
  },
  dialog: {
    open: (options) => invoke("dialog", "open", { options }),
    save: (options) => invoke("dialog", "save", { options }),
  },
  platform: { platform: () => platform, osType: () => platform, arch: () => "unknown", family: () => platform === "windows" ? "windows" : "unix", version: () => "unknown", isMobile: false },
  notifications: {
    isPermissionGranted: () => Promise.resolve(Notification.permission === "granted"),
    requestPermission: async () => (await Notification.requestPermission()) === "granted" ? "granted" : "denied",
    send: (input) => invoke("notifications", "send", input),
  },
  external: { open: (url) => invoke("desktop", "openExternal", { url }) },
  backup: { invoke: (command, payload) => invoke("backup", command, payload) },
  migration: { invoke: (command, payload) => invoke("migration", command, payload) },
  network: {
    webSearch: (request) => invoke("network", "webSearch", { request }),
    modelProxyFetch: (request) => invoke("network", "modelProxyFetch", { request }),
  },
  local: { invoke: (area, command, payload) => invoke("local", `${area}:${command}`, payload) },
  speech: { invoke: desktopSpeech },
  webSocket: DesktopWebSocket,
  desktop: {
    window: {
      minimize: () => invoke("window", "minimize"),
      toggleMaximize: () => invoke("window", "toggleMaximize"),
      close: () => invoke("window", "close"),
      hide: () => invoke("window", "hide"),
      startDragging: () => invoke("window", "startDragging"),
    },
    openExternal: (url) => invoke("desktop", "openExternal", { url }),
    executeEnvironmentCommand: (name) => invoke("desktop", "executeEnvironmentCommand", { name }),
    subWindow: {
      create: (input) => invoke("subWindow", "create", input),
      send: (label, event, payload) => invoke("subWindow", "send", { label, event, payload }),
      listen: (event, listener) => bridge.listen(event, listener),
      close: (label) => invoke("subWindow", "close", { label }),
    },
  },
};
