import { invoke } from "@tauri-apps/api/core";
import { defaultConfigKeys, fallbackDefaultConfigs } from "../domain/default-config";

export async function getDefaultConfig<T>(key: string, fallback: T): Promise<T> {
  const value = await invoke<T | null>("config_get", { key });
  return value ?? fallback;
}

export function setDefaultConfig<T>(key: string, value: T) {
  return invoke<void>("config_set", { key, value });
}

export function deleteDefaultConfig(key: string) {
  return invoke<void>("config_delete", { key });
}

export function getDefaultChatModel() {
  return getDefaultConfig(defaultConfigKeys.defaultChatModel, fallbackDefaultConfigs.defaultChatModel);
}

export function setDefaultChatModel(model: string) {
  return setDefaultConfig(defaultConfigKeys.defaultChatModel, model);
}

export function getFastModel() {
  return getDefaultConfig(defaultConfigKeys.fastModel, fallbackDefaultConfigs.fastModel);
}

export function setFastModel(model: string) {
  return setDefaultConfig(defaultConfigKeys.fastModel, model);
}

export function getEmbeddingModel() {
  return getDefaultConfig(defaultConfigKeys.embeddingModel, fallbackDefaultConfigs.embeddingModel);
}

export function setEmbeddingModel(model: string) {
  return setDefaultConfig(defaultConfigKeys.embeddingModel, model);
}

export function getImageModel() {
  return getDefaultConfig(defaultConfigKeys.imageModel, fallbackDefaultConfigs.imageModel);
}

export function setImageModel(model: string) {
  return setDefaultConfig(defaultConfigKeys.imageModel, model);
}

export function getDefaultCapabilities() {
  return getDefaultConfig(
    defaultConfigKeys.defaultCapabilities,
    fallbackDefaultConfigs.defaultCapabilities,
  );
}

export function setDefaultCapabilities(
  capabilities: typeof fallbackDefaultConfigs.defaultCapabilities,
) {
  return setDefaultConfig(defaultConfigKeys.defaultCapabilities, capabilities);
}
