import {
	getDefaultConfig,
	setDefaultConfig,
} from "@/features/defaultConfigs/default-config-service";
import {
	clearSecretValue,
	hasSecret,
	setSecret,
} from "@/features/ModelConnection/services/secret-service";
import {
	COMFYUI_RUNPOD_API_KEY_NAME,
	type ComfyUISettings,
	createDefaultComfyUISettings,
} from "./image-generation-types";

const settingsKey = "imageGeneration.comfyui";

export async function loadComfyUISettings(): Promise<ComfyUISettings> {
	const fallback = createDefaultComfyUISettings();
	const stored = await getDefaultConfig<Partial<ComfyUISettings>>(
		settingsKey,
		fallback,
	);
	const settings = { ...fallback, ...stored };
	settings.enabled = settings.enabled === true;
	settings.serverType =
		settings.serverType === "runpod" ? "runpod" : "standard";
	settings.protocol = settings.protocol === "https" ? "https" : "http";
	settings.host =
		typeof settings.host === "string" && settings.host.trim()
			? settings.host.trim()
			: fallback.host;
	settings.port = normalizeNumber(settings.port, fallback.port, 1, 65535, 1);
	settings.runpodEndpointUrl =
		typeof settings.runpodEndpointUrl === "string"
			? settings.runpodEndpointUrl.trim()
			: "";
	settings.timeoutSeconds = normalizeNumber(
		settings.timeoutSeconds,
		fallback.timeoutSeconds,
		5,
		3600,
		1,
	);
	settings.workflowMode =
		settings.workflowMode === "custom" ? "custom" : "basic";
	settings.workflowJson =
		typeof settings.workflowJson === "string" ? settings.workflowJson : "";
	settings.checkpoint =
		typeof settings.checkpoint === "string" ? settings.checkpoint : "";
	settings.width = normalizeNumber(settings.width, fallback.width, 64, 4096, 8);
	settings.height = normalizeNumber(
		settings.height,
		fallback.height,
		64,
		4096,
		8,
	);
	settings.steps = normalizeNumber(settings.steps, fallback.steps, 1, 200, 1);
	settings.cfg = normalizeNumber(settings.cfg, fallback.cfg, 0, 100);
	settings.sampler =
		typeof settings.sampler === "string" && settings.sampler.trim()
			? settings.sampler
			: fallback.sampler;
	settings.scheduler =
		typeof settings.scheduler === "string" && settings.scheduler.trim()
			? settings.scheduler
			: fallback.scheduler;
	settings.negativePrompt =
		typeof settings.negativePrompt === "string" ? settings.negativePrompt : "";
	return settings;
}

export function saveComfyUISettings(settings: ComfyUISettings) {
	return setDefaultConfig(settingsKey, settings);
}

export function hasComfyUIRunPodApiKey() {
	return hasSecret(COMFYUI_RUNPOD_API_KEY_NAME);
}

export function saveComfyUIRunPodApiKey(value: string) {
	return value.trim()
		? setSecret(COMFYUI_RUNPOD_API_KEY_NAME, value.trim())
		: clearSecretValue(COMFYUI_RUNPOD_API_KEY_NAME);
}

function normalizeNumber(
	value: unknown,
	fallback: number,
	min: number,
	max: number,
	step?: number,
) {
	const number = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(number)) return fallback;
	const clamped = Math.min(max, Math.max(min, number));
	return step ? Math.round(clamped / step) * step : clamped;
}
