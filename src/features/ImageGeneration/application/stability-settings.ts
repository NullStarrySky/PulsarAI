import { getDefaultConfig, setDefaultConfig } from "@/features/defaultConfigs/application/default-config-service";
import { clearSecretValue, hasSecret, setSecret } from "@/features/ModelConnection/application/secret-service";
import { createDefaultStabilitySettings, STABILITY_API_KEY_NAME, type StabilitySettings } from "../domain/image-generation";

const settingsKey = "imageGeneration.stability";

export async function loadStabilitySettings(): Promise<StabilitySettings> {
  const fallback = createDefaultStabilitySettings();
  const stored = await getDefaultConfig<Partial<StabilitySettings>>(settingsKey, fallback);
  return { ...fallback, ...stored };
}

export function saveStabilitySettings(settings: StabilitySettings) {
  return setDefaultConfig(settingsKey, settings);
}

export function hasStabilityApiKey() {
  return hasSecret(STABILITY_API_KEY_NAME);
}

export function saveStabilityApiKey(value: string) {
  return value.trim() ? setSecret(STABILITY_API_KEY_NAME, value.trim()) : clearSecretValue(STABILITY_API_KEY_NAME);
}
