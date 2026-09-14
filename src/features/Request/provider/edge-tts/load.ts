import { host } from "@/host";

type EdgeTtsModule = typeof import("edge-tts-ts");

let edgeTtsModulePromise: Promise<EdgeTtsModule> | undefined;

function importEdgeTts(): Promise<EdgeTtsModule> {
	if (
		typeof window === "undefined" ||
		typeof globalThis.WebSocket === "undefined"
	) {
		return import("edge-tts-ts");
	}

	const NativeWebSocket = globalThis.WebSocket;
	globalThis.WebSocket = host.webSocket;

	return import("edge-tts-ts").finally(() => {
		globalThis.WebSocket = NativeWebSocket;
	});
}

export function loadEdgeTts(): Promise<EdgeTtsModule> {
	edgeTtsModulePromise ??= importEdgeTts();
	return edgeTtsModulePromise;
}
