import { defineStore } from "pinia";
import { fallbackDefaultConfigs } from "../domain/default-config";
import {
  getDefaultChatModel,
  getEmbeddingModel,
  getFastModel,
  getImageModel,
  getSpeechModel,
  getTranscriptionModel,
  setDefaultChatModel,
  setEmbeddingModel,
  setFastModel,
  setImageModel,
  setSpeechModel,
  setTranscriptionModel,
} from "./default-config-service";

export const useDefaultConfigStore = defineStore("defaultConfigs", {
  state: () => ({
    defaultChatModel: fallbackDefaultConfigs.defaultChatModel,
    fastModel: fallbackDefaultConfigs.fastModel,
    embeddingModel: fallbackDefaultConfigs.embeddingModel,
    imageModel: fallbackDefaultConfigs.imageModel,
    speechModel: fallbackDefaultConfigs.speechModel,
    transcriptionModel: fallbackDefaultConfigs.transcriptionModel,
    loaded: false,
  }),
  actions: {
    async load() {
      const [defaultChatModel, fastModel, embeddingModel, imageModel, speechModel, transcriptionModel] = await Promise.all([
        getDefaultChatModel(),
        getFastModel(),
        getEmbeddingModel(),
        getImageModel(),
        getSpeechModel(),
        getTranscriptionModel(),
      ]);
      this.defaultChatModel = migrateModelRef(defaultChatModel);
      this.fastModel = migrateModelRef(fastModel || defaultChatModel);
      this.embeddingModel = migrateModelRef(embeddingModel);
      this.imageModel = migrateModelRef(imageModel);
      this.speechModel = migrateModelRef(speechModel);
      this.transcriptionModel = migrateModelRef(transcriptionModel);
      await Promise.all([
        this.defaultChatModel !== defaultChatModel ? setDefaultChatModel(this.defaultChatModel) : Promise.resolve(),
        this.fastModel !== fastModel ? setFastModel(this.fastModel) : Promise.resolve(),
        this.embeddingModel !== embeddingModel ? setEmbeddingModel(this.embeddingModel) : Promise.resolve(),
        this.imageModel !== imageModel ? setImageModel(this.imageModel) : Promise.resolve(),
        this.speechModel !== speechModel ? setSpeechModel(this.speechModel) : Promise.resolve(),
        this.transcriptionModel !== transcriptionModel ? setTranscriptionModel(this.transcriptionModel) : Promise.resolve(),
      ]);
      this.loaded = true;
    },
    async setDefaultChatModel(model: string) {
      this.defaultChatModel = model;
      await setDefaultChatModel(model);
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
