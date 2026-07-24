import { defineStore } from "pinia";
import { fallbackDefaultConfigs } from "../domain/default-config";
import { getDefaultChatModel, setDefaultChatModel } from "./default-config-service";

export const useDefaultConfigStore = defineStore("defaultConfigs", {
  state: () => ({
    defaultChatModel: fallbackDefaultConfigs.defaultChatModel,
    loaded: false,
  }),
  actions: {
    async load() {
      this.defaultChatModel = await getDefaultChatModel();
      this.loaded = true;
    },
    async setDefaultChatModel(model: string) {
      this.defaultChatModel = model;
      await setDefaultChatModel(model);
    },
  },
});
