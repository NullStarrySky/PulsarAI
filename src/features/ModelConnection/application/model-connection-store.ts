import { defineStore } from "pinia";
import { builtinModelProviders } from "./builtin-providers";
import type { BuiltinModelProviderId, ModelProviderConnection } from "../domain/model-provider";

function createDefaultConnections(): Record<BuiltinModelProviderId, ModelProviderConnection> {
  return Object.fromEntries(
    builtinModelProviders.map((provider) => [
      provider.id,
      {
        providerId: provider.id,
        enabled: provider.id === "openai",
        apiKey: "",
        baseUrl: provider.baseUrl,
        model: provider.defaultModel,
      },
    ]),
  ) as Record<BuiltinModelProviderId, ModelProviderConnection>;
}

export const useModelConnectionStore = defineStore("modelConnection", {
  state: () => ({
    activeProviderId: "openai" as BuiltinModelProviderId,
    connections: createDefaultConnections(),
  }),
  getters: {
    providers: () => builtinModelProviders,
    activeProvider: (state) => builtinModelProviders.find((provider) => provider.id === state.activeProviderId),
    activeConnection: (state) => state.connections[state.activeProviderId],
  },
  actions: {
    activateProvider(providerId: BuiltinModelProviderId) {
      this.activeProviderId = providerId;
    },
    patchConnection(providerId: BuiltinModelProviderId, patch: Partial<ModelProviderConnection>) {
      this.connections[providerId] = {
        ...this.connections[providerId],
        ...patch,
        providerId,
      };
    },
  },
});
