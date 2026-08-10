import { invoke } from "@tauri-apps/api/core";
import {
  defaultConfigKeys,
  fallbackDefaultConfigs,
} from "../domain/default-config";

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

export function getSpeechModel() {
  return getDefaultConfig(defaultConfigKeys.speechModel, fallbackDefaultConfigs.speechModel);
}

export function setSpeechModel(model: string) {
  return setDefaultConfig(defaultConfigKeys.speechModel, model);
}

export function getTranscriptionModel() {
  return getDefaultConfig(defaultConfigKeys.transcriptionModel, fallbackDefaultConfigs.transcriptionModel);
}

export function setTranscriptionModel(model: string) {
  return setDefaultConfig(defaultConfigKeys.transcriptionModel, model);
}

export function getPromptOptimizationModel() {
  return getDefaultConfig(
    defaultConfigKeys.promptOptimizationModel,
    fallbackDefaultConfigs.promptOptimizationModel,
  );
}

export function setPromptOptimizationModel(model: string) {
  return setDefaultConfig(defaultConfigKeys.promptOptimizationModel, model);
}

export function getPromptOptimizationPrompt() {
  return getDefaultConfig(
    defaultConfigKeys.promptOptimizationPrompt,
    fallbackDefaultConfigs.promptOptimizationPrompt,
  );
}

export function setPromptOptimizationPrompt(prompt: string) {
  return setDefaultConfig(defaultConfigKeys.promptOptimizationPrompt, prompt);
}

export function getSttLanguage() {
  return getDefaultConfig(defaultConfigKeys.sttLanguage, fallbackDefaultConfigs.sttLanguage);
}

export function setSttLanguage(language: string) {
  return setDefaultConfig(defaultConfigKeys.sttLanguage, language);
}

export function getSttAutoPolish() {
  return getDefaultConfig(defaultConfigKeys.sttAutoPolish, fallbackDefaultConfigs.sttAutoPolish);
}

export function setSttAutoPolish(autoPolish: boolean) {
  return setDefaultConfig(defaultConfigKeys.sttAutoPolish, autoPolish);
}

export function getSttPolishModel() {
  return getDefaultConfig(defaultConfigKeys.sttPolishModel, fallbackDefaultConfigs.sttPolishModel);
}

export function setSttPolishModel(model: string) {
  return setDefaultConfig(defaultConfigKeys.sttPolishModel, model);
}

export function getSttPolishPrompt() {
  return getDefaultConfig(defaultConfigKeys.sttPolishPrompt, fallbackDefaultConfigs.sttPolishPrompt);
}

export function setSttPolishPrompt(prompt: string) {
  return setDefaultConfig(defaultConfigKeys.sttPolishPrompt, prompt);
}
