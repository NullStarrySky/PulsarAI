import {
	isPermissionGranted,
	requestPermission,
	sendNotification,
} from "@choochmeque/tauri-plugin-notifications-api";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
	arch,
	family,
	type as osType,
	platform,
	version,
} from "@tauri-apps/plugin-os";
import {
	checkBatteryOptimizationStatus,
	openBatterySettings,
	requestBatteryOptimizationExemption,
} from "tauri-plugin-android-battery-optimization-api";
import { M3 } from "tauri-plugin-m3";
import {
	checkPermission,
	getSupportedLanguages,
	isAvailable,
	onError,
	onResult,
	requestPermission as requestSttPermission,
	startListening,
	stopListening,
} from "tauri-plugin-stt-api";
import {
	getVoices,
	isInitialized,
	isSpeaking,
	previewVoice,
	speak,
	stop,
} from "tauri-plugin-tts-api";
import type { Host } from "../contracts";
import { EdgeTtsTauriWebSocket } from "./edge-tts-websocket";

const command = <T>(name: string, payload?: Record<string, unknown>) =>
	invoke<T>(name, payload);

export const host: Host = {
	target: "mobile-tauri",
	database: {
		selectAll: (table) => command("database_select_all", { table }),
		selectByField: (table, field, value) =>
			command("database_select_by_field", { table, field, value }),
		selectOne: (table, id) => command("database_select_one", { table, id }),
		upsert: (table, id, value) =>
			command("database_upsert", { table, id, value }),
		update: (table, id, patches) =>
			command("database_update", { table, id, patches }),
		remove: (table, id) => command("database_delete", { table, id }),
		resetCharacterData: () => command("database_reset_character_data"),
	},
	config: {
		get: (key) => command("config_get", { key }),
		set: (key, value) => command("config_set", { key, value }),
		remove: (key) => command("config_delete", { key }),
	},
	secrets: {
		has: (name) => command("secret_has", { name }),
		preview: (name) => command("secret_preview", { name }),
		set: (name, value) => command("secret_set", { name, value }),
		clearValue: (name) => command("secret_clear_value", { name }),
		remove: (name) => command("secret_delete", { name }),
	},
	dialog: {
		open: (options) => open(options as Parameters<typeof open>[0]),
		save: (options) => save(options as Parameters<typeof save>[0]),
	},
	platform: {
		platform,
		osType,
		arch,
		family,
		version,
		isMobile: true,
	},
	notifications: {
		isPermissionGranted,
		requestPermission: async () =>
			(await requestPermission()) === "granted" ? "granted" : "denied",
		send: (input) => sendNotification({ ...input, autoCancel: true }),
	},
	external: { open: openUrl },
	backup: { invoke: (name, payload) => command(name, payload) },
	migration: { invoke: (name, payload) => command(name, payload) },
	network: {
		webSearch: (request) => command("web_search", { request }),
		modelProxyFetch: (request) => command("model_proxy_fetch", { request }),
	},
	local: {
		invoke: (area, name, payload) => command(`${area}_${name}`, payload),
	},
	speech: {
		async invoke(name, payload) {
			if (name === "speak")
				return speak(
					payload?.request as Parameters<typeof speak>[0],
				) as Promise<never>;
			if (name === "stop") return stop() as Promise<never>;
			if (name === "isSpeaking") return isSpeaking() as Promise<never>;
			if (name === "status") return isInitialized() as Promise<never>;
			if (name === "voices")
				return getVoices(
					payload?.language as string | undefined,
				) as Promise<never>;
			if (name === "preview")
				return previewVoice(
					payload?.request as Parameters<typeof previewVoice>[0],
				) as Promise<never>;
			throw new Error(`Unsupported mobile speech command: ${name}`);
		},
	},
	webSocket: EdgeTtsTauriWebSocket as unknown as typeof WebSocket,
	mobile: {
		battery: {
			async getStatus() {
				if (platform() !== "android")
					return {
						available: false,
						isOptimized: false,
						isIgnoringOptimizations: false,
					};
				return { available: true, ...(await checkBatteryOptimizationStatus()) };
			},
			async requestExemption() {
				if (platform() === "android")
					await requestBatteryOptimizationExemption();
			},
			async openSettings() {
				if (platform() === "android") await openBatterySettings();
			},
		},
		navigationBar: {
			async setColor(color) {
				return platform() === "android"
					? Boolean(await M3.setBarColor(color))
					: false;
			},
		},
		speechRecognition: {
			async isAvailable() {
				return (await isAvailable()).available;
			},
		},
		stt: {
			async invoke(name, payload) {
				if (name === "permission") return checkPermission() as Promise<never>;
				if (name === "requestPermission")
					return requestSttPermission() as Promise<never>;
				if (name === "languages")
					return getSupportedLanguages() as Promise<never>;
				if (name === "start")
					return startListening(
						payload?.options as Parameters<typeof startListening>[0],
					) as Promise<never>;
				if (name === "stop") return stopListening() as Promise<never>;
				if (name === "onResult")
					return onResult(
						payload?.handler as Parameters<typeof onResult>[0],
					) as Promise<never>;
				if (name === "onError")
					return onError(
						payload?.handler as Parameters<typeof onError>[0],
					) as Promise<never>;
				throw new Error(`Unsupported mobile STT command: ${name}`);
			},
		},
	},
	desktop: undefined,
};
