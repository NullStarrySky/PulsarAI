import type { Host, HostConfig } from "../contracts";
import { mockHostDatabase } from "@/features/Database/mock-database";

declare global {
	interface Window {
		pulsarHost?: ElectronHostBridge;
	}
}

interface ElectronHostBridge {
	invoke<T>(
		namespace: string,
		method: string,
		payload?: Record<string, unknown>,
	): Promise<T>;
	listen(event: string, listener: (payload: unknown) => void): () => void;
}

const bridge = typeof window !== "undefined" ? window.pulsarHost : undefined;

function toPlainSerializable<T>(val: T): T {
	if (val === undefined || val === null) return val;
	try {
		return JSON.parse(JSON.stringify(val));
	} catch {
		return val;
	}
}

const invoke = <T>(
	namespace: string,
	method: string,
	payload?: Record<string, unknown>,
): Promise<T> => {
	if (!bridge) {
		return Promise.resolve(undefined as T);
	}
	return bridge.invoke<T>(
		namespace,
		method,
		payload ? toPlainSerializable(payload) : undefined,
	);
};

const platform = navigator.userAgent.toLocaleLowerCase().includes("windows")
	? "windows"
		: navigator.userAgent.toLocaleLowerCase().includes("mac")
			? "macos"
			: "linux";

const fallbackMedia = new Map<
	string,
	{ bytes: number[]; mediaType: string }
>();

function fallbackMediaUrl(bytes: number[], mediaType: string) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `data:${mediaType};base64,${btoa(binary)}`;
}

class DesktopWebSocket extends WebSocket {
	constructor(
		url: string | URL,
		protocolsOrOptions?:
			| string
			| string[]
			| { headers?: Record<string, string> },
	) {
		super(
			url,
			typeof protocolsOrOptions === "string" ||
				Array.isArray(protocolsOrOptions)
				? protocolsOrOptions
				: undefined,
		);
	}
}

async function desktopSpeech<T>(
	command: string,
	payload?: Record<string, unknown>,
): Promise<T> {
	if (command === "stop") {
		speechSynthesis.cancel();
		return undefined as T;
	}
	if (command === "isSpeaking") return speechSynthesis.speaking as T;
	if (command === "status")
		return {
			initialized: true,
			voiceCount: speechSynthesis.getVoices().length,
		} as T;
	if (command === "voices") {
		const language =
			typeof payload?.language === "string" ? payload.language : "";
		return speechSynthesis
			.getVoices()
			.filter((voice) => !language || voice.lang.startsWith(language))
			.map((voice) => ({
				id: voice.voiceURI,
				name: voice.name,
				language: voice.lang,
			})) as T;
	}
	const request = payload?.request as Record<string, unknown> | undefined;
	if (!request || (typeof request.text !== "string" && command === "speak"))
		throw new Error("系统 TTS 文本不能为空。");
	if (command === "speak" || command === "preview") {
		const utterance = new SpeechSynthesisUtterance(
			String(request?.text ?? "测试语音"),
		);
		const voiceId = typeof request?.voiceId === "string" ? request.voiceId : "";
		utterance.voice =
			speechSynthesis.getVoices().find((voice) => voice.voiceURI === voiceId) ??
			null;
		if (typeof request?.language === "string")
			utterance.lang = request.language;
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
		selectAll: (table) =>
			bridge
				? invoke("database", "selectAll", { table })
				: mockHostDatabase.selectAll(table),
		selectByField: (table, field, value) =>
			bridge
				? invoke("database", "selectByField", { table, field, value })
				: mockHostDatabase.selectByField(table, field, value),
		selectOne: (table, id) =>
			bridge
				? invoke("database", "selectOne", { table, id })
				: mockHostDatabase.selectOne(table, id),
		upsert: (table, id, value) =>
			bridge
				? invoke("database", "upsert", { table, id, value })
				: mockHostDatabase.upsert(table, id, value),
		update: (table, id, patches) =>
			bridge
				? invoke("database", "update", { table, id, patches })
				: mockHostDatabase.update(table, id, patches),
		remove: (table, id) =>
			bridge
				? invoke("database", "remove", { table, id })
				: mockHostDatabase.remove(table, id),
		resetCharacterData: () =>
			bridge
				? invoke("database", "resetCharacterData")
				: mockHostDatabase.resetCharacterData(),
	},
	config: {
		get: (async (key: string, fallback?: unknown) => ((await invoke("config", "get", { key })) ?? fallback ?? null)) as HostConfig["get"],
		set: (key, value) => invoke("config", "set", { key, value }),
		remove: (key) => invoke("config", "remove", { key }),
	},
	secrets: {
		has: (name) => invoke("secrets", "has", { name }),
		preview: (name) => invoke("secrets", "preview", { name }),
		set: (name, value) => invoke("secrets", "set", { name, value }),
		clearValue: (name) => invoke("secrets", "clearValue", { name }),
		remove: (name) => invoke("secrets", "remove", { name }),
	},
	dialog: {
		open: (options) => invoke("dialog", "open", { options }),
		save: (options) => invoke("dialog", "save", { options }),
	},
	media: {
		async write(input) {
			if (bridge) return invoke("media", "write", input);
			const id = crypto.randomUUID();
			const bytes = [...input.bytes];
			fallbackMedia.set(id, { bytes, mediaType: input.mediaType });
			return { id, mediaType: input.mediaType, size: bytes.length };
		},
		async read(id) {
			if (bridge) return invoke("media", "read", { id });
			const file = fallbackMedia.get(id);
			if (!file) throw new Error("媒体文件不存在。");
			return { id, ...file, size: file.bytes.length };
		},
		async url(id) {
			if (bridge) return invoke("media", "url", { id });
			const file = fallbackMedia.get(id);
			if (!file) throw new Error("媒体文件不存在。");
			return fallbackMediaUrl(file.bytes, file.mediaType);
		},
		async remove(id) {
			if (bridge) return invoke("media", "remove", { id });
			fallbackMedia.delete(id);
		},
	},
	platform: {
		platform: () => platform,
		osType: () => platform,
		arch: () => "unknown",
		family: () => (platform === "windows" ? "windows" : "unix"),
		version: () => "unknown",
		isMobile: false,
	},
	notifications: {
		isPermissionGranted: () =>
			Promise.resolve(Notification.permission === "granted"),
		requestPermission: async () =>
			(await Notification.requestPermission()) === "granted"
				? "granted"
				: "denied",
		send: (input) => invoke("notifications", "send", input),
	},
	external: { open: (url) => invoke("desktop", "openExternal", { url }) },
	backup: { invoke: (command, payload) => invoke("backup", command, payload) },
	migration: {
		invoke: (command, payload) => invoke("migration", command, payload),
	},
	network: {
		webSearch: (request) => invoke("network", "webSearch", { request }),
		modelProxyFetch: (request) =>
			invoke("network", "modelProxyFetch", { request }),
	},
	local: {
		invoke: (area, command, payload) =>
			invoke("local", `${area}:${command}`, payload),
	},
	speech: { invoke: desktopSpeech },
	webSocket: DesktopWebSocket,
	desktop: {
		window: {
			minimize: () => invoke("window", "minimize"),
			toggleMaximize: () => invoke("window", "toggleMaximize"),
			close: () => invoke("window", "close"),
			hide: () => invoke("window", "hide"),
		},
		openExternal: (url) => invoke("desktop", "openExternal", { url }),
		executeEnvironmentCommand: (name) =>
			invoke("desktop", "executeEnvironmentCommand", { name }),
		subWindow: {
			create: (input) => invoke("subWindow", "create", input),
			send: (label, event, payload) =>
				invoke("subWindow", "send", { label, event, payload }),
			listen: (event, listener) =>
				bridge ? bridge.listen(event, listener) : () => {},
			close: (label) => invoke("subWindow", "close", { label }),
		},
		update: {
			check: () => invoke("update", "check"),
			download: () => invoke("update", "download"),
			install: () => invoke("update", "install"),
			listen: (listener) =>
				bridge
					? bridge.listen("update", (payload) =>
							listener(payload as Parameters<typeof listener>[0]),
						)
					: () => {},
		},
	},
};
