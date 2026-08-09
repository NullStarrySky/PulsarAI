import { defineStore } from "pinia";
import { builtinModelProviders } from "./builtin-providers";
import { loadPersistedProviders, persistProvider } from "./model-provider-persistence";
import { providerIconUrl } from "./provider-icons";
import { registerOpenAICompatibleProvider } from "./model-ai";
import {
  clearSecretValue,
  deleteSecret,
  hasSecret,
  setSecret,
} from "./secret-service";
import type {
  ModelApiType,
  ModelDefinition,
  ModelProviderDefinition,
  NewModelInput,
  NewModelProviderInput,
} from "../domain/model-provider";

function cloneProviders() {
  return builtinModelProviders.map((provider) => ({
    ...provider,
    models: provider.models.map((model) => ({ ...model })),
  }));
}

function mergeProvider(base: ModelProviderDefinition | undefined, persisted: ModelProviderDefinition): ModelProviderDefinition {
  const models = new Map<string, ModelDefinition>();
  const persistedModels = migratePersistedModels(persisted);
  for (const model of base?.models ?? []) {
    models.set(model.id, { ...model });
  }
  for (const model of persistedModels) {
    models.set(model.id, { ...models.get(model.id), ...model });
  }

  return {
    ...base,
    ...persisted,
    models: [...models.values()],
  };
}

function migratePersistedModels(provider: ModelProviderDefinition) {
  if (provider.id !== "deepseek") {
    return provider.models ?? [];
  }

  return (provider.models ?? [])
    .filter((model) => !["deepseek-chat", "deepseek-reasoner"].includes(model.id))
    .concat(
      (provider.models ?? [])
        .filter((model) => model.id === "deepseek-chat")
        .map((model) => ({ ...model, id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" })),
      (provider.models ?? [])
        .filter((model) => model.id === "deepseek-reasoner")
        .map((model) => ({ ...model, id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" })),
    );
}

let initializationPromise: Promise<void> | null = null;

export const modelTypeLabels: Record<ModelApiType, string> = {
  chat: "对话",
  image: "图片",
  video: "视频",
  embedding: "向量化",
  asr: "ASR",
  tts: "TTS",
};

export const useModelConnectionStore = defineStore("modelConnection", {
  state: () => ({
    search: "",
    modelSearch: "",
    activeProviderId: "openai",
    activeModelTab: "all" as ModelApiType | "all",
    apiKeyStatus: {} as Record<string, boolean>,
    providers: cloneProviders() as ModelProviderDefinition[],
    loaded: false,
  }),
  getters: {
    activeProvider: (state) =>
      state.providers.find((provider) => provider.id === state.activeProviderId) ?? state.providers[0],
    activeModels(): ModelDefinition[] {
      const provider = this.activeProvider;
      const keyword = this.modelSearch.trim().toLowerCase();
      const tab = this.activeModelTab;

      return provider.models.filter((model) => {
        const matchesKeyword =
          !keyword ||
          [model.id, model.name].some((value) => value.toLowerCase().includes(keyword));
        const matchesTab = tab === "all" || model.apiType === tab;
        return matchesKeyword && matchesTab;
      });
    },
    availableModelCount(): number {
      return this.activeProvider.models.filter((model) => model.enabled).length;
    },
    visibleModelTabs(): Array<ModelApiType | "all"> {
      const types = new Set(this.activeProvider.models.map((model) => model.apiType));
      return ["all", ...Object.keys(modelTypeLabels).filter((type) => types.has(type as ModelApiType))] as Array<
        ModelApiType | "all"
      >;
    },
    chatModelOptions(): Array<{ value: string; label: string; providerIconUrl?: string }> {
      return this.providers.flatMap((provider) =>
        provider.models
          .filter((model) => provider.enabled && model.enabled && model.apiType === "chat")
          .map((model) => ({
            value: `${provider.id}/${model.id}`,
            label: `${provider.name} · ${model.name}`,
            providerIconUrl: provider.iconUrl,
          })),
      );
    },
  },
  actions: {
    async initialize() {
      if (this.loaded) {
        return;
      }

      initializationPromise ??= (async () => {
        const builtinProviders = cloneProviders();
        const persistedProviders = await loadPersistedProviders();
        const merged = new Map<string, ModelProviderDefinition>();

        for (const provider of builtinProviders) {
          merged.set(provider.id, provider);
        }
        for (const provider of persistedProviders) {
          merged.set(provider.id, mergeProvider(merged.get(provider.id), provider));
        }

        this.providers = [...merged.values()];

        const persistedIds = new Set(persistedProviders.map((provider) => provider.id));
        if (persistedIds.size < persistedProviders.length) {
          console.warn(
            `[ModelConnection] compacting ${persistedProviders.length} provider rows into ${persistedIds.size} unique records`,
          );
          for (const provider of this.providers) {
            if (persistedIds.has(provider.id)) {
              await persistProvider(provider);
            }
          }
        }

        if (!this.providers.some((provider) => provider.id === this.activeProviderId)) {
          this.activeProviderId = this.providers[0]?.id ?? "";
        }
        for (const provider of this.providers) {
          registerOpenAICompatibleProvider(provider.id, provider.baseUrl, provider.apiKeyName);
        }
        await Promise.all(this.providers.map(async (provider) => {
          const hasApiKey = await hasSecret(provider.apiKeyName);
          this.apiKeyStatus[provider.apiKeyName] = hasApiKey;
          if (provider.enabled && !hasApiKey) {
            provider.enabled = false;
            await persistProvider(provider);
          }
        }));
        this.loaded = true;
      })();

      try {
        await initializationPromise;
      } finally {
        initializationPromise = null;
      }
    },
    activateProvider(providerId: string) {
      if (this.providers.some((provider) => provider.id === providerId)) {
        this.activeProviderId = providerId;
      }
    },
    async patchProvider(providerId: string, patch: Partial<ModelProviderDefinition>) {
      const provider = this.providers.find((item) => item.id === providerId);
      if (!provider) {
        return;
      }

      if (patch.enabled === true && !this.apiKeyStatus[provider.apiKeyName]) {
        return false;
      }

      Object.assign(provider, patch);

      registerOpenAICompatibleProvider(provider.id, provider.baseUrl, provider.apiKeyName);
      await persistProvider(provider);
      return true;
    },
    async refreshSecretStatus(providerId?: string) {
      providerId ??= this.activeProviderId;
      const provider = this.providers.find((item) => item.id === providerId);
      if (!provider) {
        return;
      }

      this.apiKeyStatus[provider.apiKeyName] = await hasSecret(provider.apiKeyName);
    },
    async saveProviderApiKey(providerId: string, apiKey: string) {
      const provider = this.providers.find((item) => item.id === providerId);
      if (!provider || !apiKey) {
        return;
      }

      await setSecret(provider.apiKeyName, apiKey);
      await this.refreshSecretStatus(providerId);
    },
    async clearProviderApiKeyValue(providerId: string) {
      const provider = this.providers.find((item) => item.id === providerId);
      if (!provider) {
        return;
      }

      await clearSecretValue(provider.apiKeyName);
      await this.refreshSecretStatus(providerId);
      if (provider.enabled) {
        provider.enabled = false;
        await persistProvider(provider);
      }
    },
    async deleteProviderApiKey(providerId: string) {
      const provider = this.providers.find((item) => item.id === providerId);
      if (!provider) {
        return;
      }

      await deleteSecret(provider.apiKeyName);
      await this.refreshSecretStatus(providerId);
      if (provider.enabled) {
        provider.enabled = false;
        await persistProvider(provider);
      }
    },
    async addProvider(input: NewModelProviderInput) {
      const id = input.id.trim().toLowerCase();
      if (!id || this.providers.some((provider) => provider.id === id)) {
        throw new Error("服务商 id 为空或已存在。");
      }

      const provider: ModelProviderDefinition = {
        id,
        name: input.name?.trim() || id,
        description: input.description?.trim(),
        iconUrl: providerIconUrl(id, input.iconUrl?.trim()),
        baseUrl: input.baseUrl?.trim() || "",
        apiKeyName: `${id}_API_KEY`,
        enabled: false,
        runtime: "remote",
        models: [],
      };

      this.providers.push(provider);
      this.activeProviderId = id;
      registerOpenAICompatibleProvider(provider.id, provider.baseUrl, provider.apiKeyName);
      await persistProvider(provider);

      if (input.apiKey) {
        await this.saveProviderApiKey(id, input.apiKey);
      }
    },
    async addModel(providerId: string, input: NewModelInput) {
      const provider = this.providers.find((item) => item.id === providerId);
      if (!provider) {
        return;
      }

      const id = input.id.trim();
      if (!id || provider.models.some((model) => model.id === id)) {
        throw new Error("模型 id 为空或已存在。");
      }

      provider.models.push({
        id,
        name: input.name?.trim() || id,
        apiType: input.apiType,
        contextSize: input.contextSize,
        iconUrl: input.iconUrl,
        enabled: true,
      });
      await persistProvider(provider);
    },
    async upsertModels(providerId: string, models: ModelDefinition[]) {
      const provider = this.providers.find((item) => item.id === providerId);
      if (!provider) {
        return 0;
      }

      let added = 0;
      for (const model of models) {
        const existing = provider.models.find((item) => item.id === model.id);
        if (existing) {
          existing.name = existing.name || model.name;
          existing.contextSize = existing.contextSize ?? model.contextSize;
          existing.iconUrl = existing.iconUrl || model.iconUrl;
          continue;
        }

        provider.models.push({ ...model });
        added += 1;
      }

      await persistProvider(provider);
      return added;
    },
    async patchModel(providerId: string, modelId: string, patch: Partial<ModelDefinition>) {
      const provider = this.providers.find((item) => item.id === providerId);
      const model = this.providers
        .find((provider) => provider.id === providerId)
        ?.models.find((item) => item.id === modelId);

      if (!provider || !model) {
        return;
      }

      Object.assign(model, patch);
      await persistProvider(provider);
    },
    async setModelsEnabledByType(providerId: string, apiType: ModelApiType, enabled: boolean) {
      const provider = this.providers.find((item) => item.id === providerId);
      if (!provider) {
        return;
      }

      const models = provider.models.filter((model) => model.apiType === apiType);
      if (models.length === 0) {
        return;
      }

      if (enabled) {
        if (!this.apiKeyStatus[provider.apiKeyName]) {
          return;
        }
        provider.enabled = true;
        models[0].enabled = true;
      } else {
        for (const model of models) {
          model.enabled = false;
        }
      }
      await persistProvider(provider);
    },
  },
});
