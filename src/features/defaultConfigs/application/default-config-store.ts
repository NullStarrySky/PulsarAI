import { defineStore } from "pinia";
import { fallbackDefaultConfigs, type ReasoningEffort } from "../domain/default-config";
import {
  getDefaultChatModel,
  getDefaultReasoningEffort,
  getEmbeddingModel,
  getFastModel,
  getImageModel,
  getPromptOptimizationModel,
  getPromptOptimizationPrompt,
  getSpeechModel,
  getTranscriptionModel,
  setDefaultChatModel,
  setDefaultReasoningEffort,
  setEmbeddingModel,
  setFastModel,
  setImageModel,
  setPromptOptimizationModel,
  setPromptOptimizationPrompt,
  setSpeechModel,
  setTranscriptionModel,
} from "./default-config-service";

export const useDefaultConfigStore = defineStore("defaultConfigs", {
  state: () => ({
    defaultChatModel: fallbackDefaultConfigs.defaultChatModel,
    reasoningEffort: fallbackDefaultConfigs.reasoningEffort,
    fastModel: fallbackDefaultConfigs.fastModel,
    embeddingModel: fallbackDefaultConfigs.embeddingModel,
    imageModel: fallbackDefaultConfigs.imageModel,
    speechModel: fallbackDefaultConfigs.speechModel,
    transcriptionModel: fallbackDefaultConfigs.transcriptionModel,
    promptOptimizationModel: fallbackDefaultConfigs.promptOptimizationModel,
    promptOptimizationPrompt: fallbackDefaultConfigs.promptOptimizationPrompt,
    loaded: false,
  }),
  actions: {
    async load() {
      const [defaultChatModel, reasoningEffort, fastModel, embeddingModel, imageModel, speechModel, transcriptionModel, promptOptimizationModel, promptOptimizationPrompt] = await Promise.all([
        getDefaultChatModel(),
        getDefaultReasoningEffort(),
        getFastModel(),
        getEmbeddingModel(),
        getImageModel(),
        getSpeechModel(),
        getTranscriptionModel(),
        getPromptOptimizationModel(),
        getPromptOptimizationPrompt(),
      ]);
      this.defaultChatModel = migrateModelRef(defaultChatModel);
      this.reasoningEffort = reasoningEffort;
      this.fastModel = migrateModelRef(fastModel || defaultChatModel);
      this.embeddingModel = migrateModelRef(embeddingModel);
      this.imageModel = migrateModelRef(imageModel);
      this.speechModel = migrateModelRef(speechModel);
      this.transcriptionModel = migrateModelRef(transcriptionModel);
      this.promptOptimizationModel = migrateModelRef(promptOptimizationModel);
      this.promptOptimizationPrompt = promptOptimizationPrompt;
      await Promise.all([
        this.defaultChatModel !== defaultChatModel ? setDefaultChatModel(this.defaultChatModel) : Promise.resolve(),
        this.fastModel !== fastModel ? setFastModel(this.fastModel) : Promise.resolve(),
        this.embeddingModel !== embeddingModel ? setEmbeddingModel(this.embeddingModel) : Promise.resolve(),
        this.imageModel !== imageModel ? setImageModel(this.imageModel) : Promise.resolve(),
        this.speechModel !== speechModel ? setSpeechModel(this.speechModel) : Promise.resolve(),
        this.transcriptionModel !== transcriptionModel ? setTranscriptionModel(this.transcriptionModel) : Promise.resolve(),
        this.promptOptimizationModel !== promptOptimizationModel ? setPromptOptimizationModel(this.promptOptimizationModel) : Promise.resolve(),
      ]);
      this.loaded = true;
    },
    async setDefaultChatModel(model: string) {
      this.defaultChatModel = model;
      await setDefaultChatModel(model);
    },
    async setReasoningEffort(reasoningEffort: ReasoningEffort) {
      this.reasoningEffort = reasoningEffort;
      await setDefaultReasoningEffort(reasoningEffort);
    },
    async setFastModel(model: string) {
      this.fastModel = model;
      await setFastModel(model);
    },
    async setEmbeddingModel(model: string) {
      this.embeddingModel = model;
      await setEmbeddingModel(model);
    },
    async setImageModel(model: string) {
      this.imageModel = model;
      await setImageModel(model);
    },
    async setSpeechModel(model: string) {
      this.speechModel = model;
      await setSpeechModel(model);
    },
    async setTranscriptionModel(model: string) {
      this.transcriptionModel = model;
      await setTranscriptionModel(model);
    },
    async setPromptOptimizationModel(model: string) {
      this.promptOptimizationModel = model;
      await setPromptOptimizationModel(model);
    },
    async setPromptOptimizationPrompt(prompt: string) {
      this.promptOptimizationPrompt = prompt;
      await setPromptOptimizationPrompt(prompt);
    },
  },
});

function migrateModelRef(model: string) {
  if (model === "deepseek/deepseek-chat") {
    return "deepseek/deepseek-v4-flash";
  }
  if (model === "deepseek/deepseek-reasoner") {
    return "deepseek/deepseek-v4-pro";
  }
  return model;
}
