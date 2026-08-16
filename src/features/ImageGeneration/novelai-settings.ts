import { getDefaultConfig, setDefaultConfig } from "@/features/defaultConfigs/default-config-service";
import {
  clearSecretValue,
  hasSecret,
  setSecret,
} from "@/features/ModelConnection/services/secret-service";
import {
  createDefaultNovelAISettings,
  NOVELAI_API_KEY_NAME,
  NOVELAI_MODELS,
  NOVELAI_SAMPLERS,
  type NovelAISettings,
} from "./image-generation-types";

const settingsKey = "imageGeneration.novelai";

export async function loadNovelAISettings(): Promise<NovelAISettings> {
  const fallback = createDefaultNovelAISettings();
  const stored = await getDefaultConfig<Partial<NovelAISettings>>(settingsKey, fallback);
  const settings = { ...fallback, ...stored };
  if (!NOVELAI_MODELS.some((model) => model.id === settings.model)) settings.model = fallback.model;
  if (!NOVELAI_SAMPLERS.some((sampler) => sampler.id === settings.sampler)) settings.sampler = fallback.sampler;
  settings.enabled = settings.enabled === true;
  settings.baseUrl = typeof settings.baseUrl === "string" ? settings.baseUrl : fallback.baseUrl;
  settings.width = normalizeNumber(settings.width, fallback.width, 64, 2048, 64);
  settings.height = normalizeNumber(settings.height, fallback.height, 64, 2048, 64);
  settings.steps = normalizeNumber(settings.steps, fallback.steps, 1, 50, 1);
  settings.guidance = normalizeNumber(settings.guidance, fallback.guidance, 0, 10);
  settings.seed = settings.seed == null ? null : normalizeNumber(settings.seed, 0, 0, 4294967295);
  settings.negativePrompt = typeof settings.negativePrompt === "string" ? settings.negativePrompt : "";
  settings.addQualityTags = settings.addQualityTags !== false;
  return settings;
}

export function saveNovelAISettings(settings: NovelAISettings) {
  return setDefaultConfig(settingsKey, settings);
}

export function hasNovelAIApiKey() {
  return hasSecret(NOVELAI_API_KEY_NAME);
}

export function saveNovelAIApiKey(value: string) {
  return value.trim()
    ? setSecret(NOVELAI_API_KEY_NAME, value.trim())
    : clearSecretValue(NOVELAI_API_KEY_NAME);
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number, step?: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  const clamped = Math.min(max, Math.max(min, number));
  return step ? Math.round(clamped / step) * step : clamped;
}
