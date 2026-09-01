import {
	getDefaultConfig,
	setDefaultConfig,
} from "@/features/defaultConfigs/default-config-service";
import {
	clearSecretValue,
	hasSecret,
	setSecret,
} from "@/features/ModelConnection/services/secret-service";
import { host } from "@/host";
import {
	createDefaultWebSearchSettings,
	EXA_API_KEY_SECRET,
	type WebSearchSettings,
} from "./web-search-types";

const settingsKey = "webSearch.settings";

export async function loadWebSearchSettings(): Promise<WebSearchSettings> {
	const fallback = createDefaultWebSearchSettings();
	const stored = await getDefaultConfig<Partial<WebSearchSettings>>(
		settingsKey,
		fallback,
	);
	const activeProviderId =
		host.desktop && stored.activeProviderId !== "exa" ? "playwright" : "exa";
	return {
		...fallback,
		...stored,
		activeProviderId,
		resultLimit: Math.max(
			1,
			Math.min(
				10,
				Math.trunc(Number(stored.resultLimit) || fallback.resultLimit),
			),
		),
	};
}

export function saveWebSearchSettings(settings: WebSearchSettings) {
	return setDefaultConfig(settingsKey, settings);
}

export function hasExaApiKey() {
	return hasSecret(EXA_API_KEY_SECRET);
}

export function saveExaApiKey(value: string) {
	return value.trim()
		? setSecret(EXA_API_KEY_SECRET, value.trim())
		: clearSecretValue(EXA_API_KEY_SECRET);
}
