import { getDefaultConfig, setDefaultConfig } from "@/features/defaultConfigs/default-config-service";
import {
  clearSecretValue,
  hasSecret,
  setSecret,
} from "@/features/ModelConnection/services/secret-service";
import {
  createDefaultVolcengineTtsSettings,
  VOLCENGINE_TTS_ACCESS_KEY_SECRET,
  VOLCENGINE_TTS_APP_ID_SECRET,
  type VolcengineTtsSettings,
} from "./tts";

const settingsKey = "tts.volcengine";

export async function loadVolcengineTtsSettings(): Promise<VolcengineTtsSettings> {
  const fallback = createDefaultVolcengineTtsSettings();
  const stored = await getDefaultConfig<Partial<VolcengineTtsSettings>>(settingsKey, fallback);
  const sampleRate = Number(stored.sampleRate);
  return {
    enabled: stored.enabled === true,
    resourceId: typeof stored.resourceId === "string" ? stored.resourceId.trim() : fallback.resourceId,
    speakerId: typeof stored.speakerId === "string" ? stored.speakerId.trim() : fallback.speakerId,
    sampleRate: Number.isFinite(sampleRate) && sampleRate > 0 ? Math.trunc(sampleRate) : fallback.sampleRate,
  };
}

export function saveVolcengineTtsSettings(settings: VolcengineTtsSettings) {
  return setDefaultConfig(settingsKey, settings);
}

export async function getVolcengineTtsCredentialStatus() {
  const [hasAppId, hasAccessKey] = await Promise.all([
    hasSecret(VOLCENGINE_TTS_APP_ID_SECRET),
    hasSecret(VOLCENGINE_TTS_ACCESS_KEY_SECRET),
  ]);
  return { hasAppId, hasAccessKey };
}

export function saveVolcengineTtsAppId(value: string) {
  return value.trim()
    ? setSecret(VOLCENGINE_TTS_APP_ID_SECRET, value.trim())
    : clearSecretValue(VOLCENGINE_TTS_APP_ID_SECRET);
}

export function saveVolcengineTtsAccessKey(value: string) {
  return value.trim()
    ? setSecret(VOLCENGINE_TTS_ACCESS_KEY_SECRET, value.trim())
    : clearSecretValue(VOLCENGINE_TTS_ACCESS_KEY_SECRET);
}
