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
	AUTOMATIC1111_BASIC_AUTH_NAME,
	type Automatic1111Settings,
	createDefaultAutomatic1111Settings,
} from "./image-generation-types";

const settingsKey = "imageGeneration.automatic1111";

export async function loadAutomatic1111Settings(): Promise<Automatic1111Settings> {
	const fallback = createDefaultAutomatic1111Settings();
	const stored = await getDefaultConfig<Partial<Automatic1111Settings>>(
		settingsKey,
		fallback,
	);
	return { ...fallback, ...stored };
}

export function saveAutomatic1111Settings(settings: Automatic1111Settings) {
	return setDefaultConfig(settingsKey, settings);
}

export function hasAutomatic1111Auth() {
	return hasSecret(AUTOMATIC1111_BASIC_AUTH_NAME);
}

export function saveAutomatic1111Auth(username: string, password: string) {
	if (!username && !password)
		return clearSecretValue(AUTOMATIC1111_BASIC_AUTH_NAME);
	return setSecret(
		AUTOMATIC1111_BASIC_AUTH_NAME,
		btoa(`${username}:${password}`),
	);
}
