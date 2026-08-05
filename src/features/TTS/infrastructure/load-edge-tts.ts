import { isTauri } from "@tauri-apps/api/core";
import { EdgeTtsTauriWebSocket } from "./edge-tts-tauri-websocket";

type EdgeTtsModule = typeof import("edge-tts-ts");

let edgeTtsModulePromise: Promise<EdgeTtsModule> | undefined;

function importEdgeTts(): Promise<EdgeTtsModule> {
  if (typeof window === "undefined" || typeof globalThis.WebSocket === "undefined") {
    return import("edge-tts-ts");
  }

  const NativeWebSocket = globalThis.WebSocket;
  if (isTauri()) {
    globalThis.WebSocket = EdgeTtsTauriWebSocket as unknown as typeof WebSocket;
  } else {
    class BrowserCompatibleWebSocket extends NativeWebSocket {
      constructor(
        url: string | URL,
        protocolsOrOptions?: string | string[] | { headers?: Record<string, string> },
      ) {
        if (typeof protocolsOrOptions === "string" || Array.isArray(protocolsOrOptions)) {
          super(url, protocolsOrOptions);
        } else {
          // Plain browsers cannot set the Node-only handshake headers used by
          // edge-tts-ts. This path remains useful for its standalone diagnostic.
          super(url);
        }
      }
    }
    globalThis.WebSocket = BrowserCompatibleWebSocket;
  }

  return import("edge-tts-ts").finally(() => {
    globalThis.WebSocket = NativeWebSocket;
  });
}

export function loadEdgeTts(): Promise<EdgeTtsModule> {
  edgeTtsModulePromise ??= importEdgeTts();
  return edgeTtsModulePromise;
}
