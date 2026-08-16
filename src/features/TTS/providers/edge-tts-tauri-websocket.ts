import TauriWebSocket, {
  type Message as TauriWebSocketMessage,
} from "@tauri-apps/plugin-websocket";

interface EdgeTtsWebSocketOptions {
  headers?: HeadersInit;
}

export class EdgeTtsTauriWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  binaryType: BinaryType = "blob";
  bufferedAmount = 0;
  extensions = "";
  protocol = "";
  readyState = EdgeTtsTauriWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  private socket: TauriWebSocket | undefined;
  private removeListener: (() => void) | undefined;

  constructor(url: string | URL, options: EdgeTtsWebSocketOptions = {}) {
    this.url = String(url);
    void this.connect(options.headers);
  }

  private async connect(headers?: HeadersInit): Promise<void> {
    try {
      this.socket = await TauriWebSocket.connect(this.url, { headers });
      this.removeListener = this.socket.addListener((message) => this.handleMessage(message));
      this.readyState = EdgeTtsTauriWebSocket.OPEN;
      this.onopen?.(new Event("open"));
    } catch (error) {
      this.readyState = EdgeTtsTauriWebSocket.CLOSED;
      this.onerror?.(
        new ErrorEvent("error", {
          error,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private handleMessage(message: TauriWebSocketMessage): void {
    if (message.type === "Text") {
      this.onmessage?.(new MessageEvent("message", { data: message.data }));
      return;
    }
    if (message.type === "Binary") {
      const bytes = Uint8Array.from(message.data);
      const data = this.binaryType === "arraybuffer"
        ? bytes.buffer
        : new Blob([bytes]);
      this.onmessage?.(new MessageEvent("message", { data }));
      return;
    }
    if (message.type === "Close") {
      this.readyState = EdgeTtsTauriWebSocket.CLOSED;
      this.onclose?.(
        new CloseEvent("close", {
          code: message.data?.code ?? 1000,
          reason: message.data?.reason ?? "",
        }),
      );
    }
  }

  send(data: string | ArrayBuffer | ArrayBufferView): void {
    if (!this.socket || this.readyState !== EdgeTtsTauriWebSocket.OPEN) {
      throw new Error("Tauri WebSocket 尚未连接。");
    }

    const payload = typeof data === "string"
      ? data
      : Array.from(
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
        );
    void this.socket.send(payload).catch((error) => {
      this.onerror?.(
        new ErrorEvent("error", {
          error,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    });
  }

  close(): void {
    if (!this.socket || this.readyState >= EdgeTtsTauriWebSocket.CLOSING) return;
    this.readyState = EdgeTtsTauriWebSocket.CLOSING;
    this.removeListener?.();
    this.removeListener = undefined;
    void this.socket.disconnect().finally(() => {
      this.readyState = EdgeTtsTauriWebSocket.CLOSED;
    });
  }
}
