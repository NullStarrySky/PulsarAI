import { computed, ref } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { supportsFeatureService, type ModelApiType } from "../model-provider";
import type { ServiceProviderView } from "../service-provider";
import { useModelConnectionStore } from "./model-connection-store";

const apiKeyMask = "••••••••";

export function useModelCapabilityProviders(apiType: ModelApiType) {
  const store = useModelConnectionStore();
  const activeProviderId = ref("");
  const selectedModelId = ref("");
  const apiKeyDraft = ref("");

  const modelProviders = computed(() =>
    store.providers.filter(
      (provider) =>
        supportsFeatureService(provider) && provider.models.some((model) => model.apiType === apiType),
    ),
  );
  const providerViews = computed<ServiceProviderView[]>(() =>
    modelProviders.value.map((provider) => ({
      id: provider.id,
      name: provider.name,
      description: provider.description,
      iconUrl: provider.iconUrl,
      enabled: provider.enabled && provider.models.some((model) => model.apiType === apiType && model.enabled),
      canEnable: Boolean(store.apiKeyStatus[provider.apiKeyName]),
      source: "model",
    })),
  );
  const activeProvider = computed(
    () => modelProviders.value.find((provider) => provider.id === activeProviderId.value) ?? modelProviders.value[0],
  );
  const models = computed(() => activeProvider.value?.models.filter((model) => model.apiType === apiType) ?? []);
  const activeProviderHasKey = computed(() =>
    activeProvider.value ? Boolean(store.apiKeyStatus[activeProvider.value.apiKeyName]) : false,
  );
  const selectedModelRef = computed(() =>
    activeProvider.value && selectedModelId.value
      ? `${activeProvider.value.id}/${selectedModelId.value}`
      : "",
  );

  function syncModel() {
    if (!models.value.some((model) => model.id === selectedModelId.value && model.enabled)) {
      selectedModelId.value = models.value.find((model) => model.enabled)?.id ?? models.value[0]?.id ?? "";
    }
  }

  function syncApiKeyDraft() {
    apiKeyDraft.value = activeProviderHasKey.value ? apiKeyMask : "";
  }

  async function initialize() {
    await store.initialize();
    if (!modelProviders.value.some((provider) => provider.id === activeProviderId.value)) {
      activeProviderId.value = modelProviders.value[0]?.id ?? "";
    }
    if (activeProvider.value) {
      await store.refreshSecretStatus(activeProvider.value.id);
    }
    syncModel();
    syncApiKeyDraft();
  }

  async function activateProvider(providerId: string) {
    if (!modelProviders.value.some((provider) => provider.id === providerId)) return;
    activeProviderId.value = providerId;
    store.activateProvider(providerId);
    await store.refreshSecretStatus(providerId);
    syncModel();
    syncApiKeyDraft();
  }

  async function toggleProvider(providerId: string, enabled: boolean) {
    await store.setModelsEnabledByType(providerId, apiType, enabled);
    if (providerId === activeProviderId.value) syncModel();
  }

  const persistApiKey = useDebounceFn(async (value: string) => {
    const provider = activeProvider.value;
    if (!provider || value === apiKeyMask) return;
    if (value.trim()) {
      await store.saveProviderApiKey(provider.id, value.trim());
    } else {
      await store.clearProviderApiKeyValue(provider.id);
    }
  }, 600);

  function updateApiKey(value: string) {
    apiKeyDraft.value = value;
    void persistApiKey(value);
  }

  return {
    store,
    activeProviderId,
    selectedModelId,
    apiKeyDraft,
    providerViews,
    activeProvider,
    models,
    activeProviderHasKey,
    selectedModelRef,
    initialize,
    activateProvider,
    toggleProvider,
    updateApiKey,
  };
}
