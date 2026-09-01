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
	createDefaultElevenLabsTtsSettings,
	ELEVENLABS_TTS_API_KEY_SECRET,
	type ElevenLabsTtsSettings,
} from "./tts";

const settingsKey = "tts.elevenlabs";

export async function loadElevenLabsTtsSettings(): Promise<ElevenLabsTtsSettings> {
	const fallback = createDefaultElevenLabsTtsSettings();
	const stored = await getDefaultConfig<Partial<ElevenLabsTtsSettings>>(
		settingsKey,
		fallback,
	);
	return {
		enabled: stored.enabled === true,
		baseUrl: stringValue(stored.baseUrl, fallback.baseUrl),
		modelId: stringValue(stored.modelId, fallback.modelId),
		voiceId: stringValue(stored.voiceId, fallback.voiceId),
		outputFormat: stringValue(stored.outputFormat, fallback.outputFormat),
		stability: numberValue(stored.stability, fallback.stability, 0, 1),
		similarityBoost: numberValue(
			stored.similarityBoost,
			fallback.similarityBoost,
			0,
			1,
		),
		style: numberValue(stored.style, fallback.style, 0, 1),
		speakerBoost: stored.speakerBoost !== false,
		speed: numberValue(stored.speed, fallback.speed, 0.7, 1.2),
	};
}

export function saveElevenLabsTtsSettings(settings: ElevenLabsTtsSettings) {
	return setDefaultConfig(settingsKey, settings);
}

export function hasElevenLabsTtsApiKey() {
	return hasSecret(ELEVENLABS_TTS_API_KEY_SECRET);
}

export function saveElevenLabsTtsApiKey(value: string) {
	return value.trim()
		? setSecret(ELEVENLABS_TTS_API_KEY_SECRET, value.trim())
		: clearSecretValue(ELEVENLABS_TTS_API_KEY_SECRET);
}

function stringValue(value: unknown, fallback: string) {
	return typeof value === "string" ? value.trim() : fallback;
}

function numberValue(
	value: unknown,
	fallback: number,
	min: number,
	max: number,
) {
	const number = typeof value === "number" ? value : Number(value);
	return Number.isFinite(number)
		? Math.min(max, Math.max(min, number))
		: fallback;
}
