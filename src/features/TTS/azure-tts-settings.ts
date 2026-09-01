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
	AZURE_TTS_API_KEY_SECRET,
	type AzureTtsSettings,
	createDefaultAzureTtsSettings,
} from "./tts";

const settingsKey = "tts.azureSpeech";

export async function loadAzureTtsSettings(): Promise<AzureTtsSettings> {
	const fallback = createDefaultAzureTtsSettings();
	const stored = await getDefaultConfig<Partial<AzureTtsSettings>>(
		settingsKey,
		fallback,
	);
	return {
		enabled: stored.enabled === true,
		region: stringValue(stored.region, fallback.region),
		voiceId: stringValue(stored.voiceId, fallback.voiceId),
		style: stringValue(stored.style, fallback.style),
		outputFormat: stringValue(stored.outputFormat, fallback.outputFormat),
		speed: numberValue(stored.speed, fallback.speed, 0.5, 2),
	};
}

export function saveAzureTtsSettings(settings: AzureTtsSettings) {
	return setDefaultConfig(settingsKey, settings);
}

export function hasAzureTtsApiKey() {
	return hasSecret(AZURE_TTS_API_KEY_SECRET);
}

export function saveAzureTtsApiKey(value: string) {
	return value.trim()
		? setSecret(AZURE_TTS_API_KEY_SECRET, value.trim())
		: clearSecretValue(AZURE_TTS_API_KEY_SECRET);
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
