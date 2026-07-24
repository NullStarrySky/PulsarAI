<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Search } from "lucide-vue-next";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useModelConnectionStore } from "../application/model-connection-store";
import ProviderAvatar from "./ProviderAvatar.vue";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const store = useModelConnectionStore();
const keyword = ref("");

const enabledProviders = computed(() => store.providers.filter((provider) => provider.enabled));
const activeProvider = computed(
  () => enabledProviders.value.find((provider) => provider.id === store.activeProviderId) ?? enabledProviders.value[0],
);
const models = computed(() => {
  const provider = activeProvider.value;
  const query = keyword.value.trim().toLowerCase();

  if (!provider) {
    return [];
  }

  return provider.models.filter((model) => {
    const matchesType = model.enabled && model.apiType === "chat";
    const matchesQuery = !query || [model.id, model.name].some((value) => value.toLowerCase().includes(query));
    return matchesType && matchesQuery;
  });
});

onMounted(async () => {
  await store.initialize();
  const [providerId] = props.modelValue.split("/");
  if (providerId) {
    store.activateProvider(providerId);
  }
});
</script>

<template>
  <div class="flex h-[380px] flex-col overflow-hidden rounded-lg border bg-popover">
    <div class="border-b p-3">
      <div class="relative">
        <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="keyword" class="h-9 border-0 bg-muted/60 pl-8 shadow-none" placeholder="搜索模型..." />
      </div>
    </div>

    <div class="grid min-h-0 flex-1 sm:grid-cols-[3.75rem_minmax(0,1fr)]">
      <aside class="flex min-h-0 flex-col border-r">
      <div class="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        <button
          v-for="provider in enabledProviders"
          :key="provider.id"
          :title="provider.name"
          :class="cn(
            'flex size-10 items-center justify-center rounded-md transition-colors hover:bg-accent',
            provider.id === activeProvider?.id && 'bg-accent',
          )"
          @click="store.activateProvider(provider.id)"
        >
          <ProviderAvatar :name="provider.name" :src="provider.iconUrl" />
        </button>
      </div>
      </aside>

      <section class="flex min-h-0 min-w-0 flex-col">
      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <button
          v-for="model in models"
          :key="model.id"
          :class="cn(
            'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent',
            `${activeProvider?.id}/${model.id}` === modelValue && 'bg-accent text-accent-foreground',
          )"
          @click="activeProvider && emit('update:modelValue', `${activeProvider.id}/${model.id}`)"
        >
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium">{{ model.name }}</span>
            <span class="block truncate text-xs text-muted-foreground">{{ model.id }}</span>
          </span>
          <ProviderAvatar :name="model.name" :src="model.iconUrl || activeProvider?.iconUrl" />
        </button>
        <p v-if="models.length === 0" class="px-2 py-8 text-center text-sm text-muted-foreground">
          没有可用的对话模型
        </p>
      </div>
      </section>
    </div>
  </div>
</template>
