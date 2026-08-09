<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, ChevronDown, Search } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import type { ServiceProviderView } from "../domain/service-provider";
import ProviderAvatar from "./ProviderAvatar.vue";

const props = defineProps<{
  providers: ServiceProviderView[];
  activeProviderId: string;
  search: string;
}>();

const emit = defineEmits<{
  "update:search": [value: string];
  "select-provider": [providerId: string];
  "toggle-provider": [providerId: string, enabled: boolean];
}>();

const open = ref(false);
const activeProvider = computed(
  () => props.providers.find((provider) => provider.id === props.activeProviderId) ?? props.providers[0],
);
const filteredProviders = computed(() => {
  const keyword = props.search.trim().toLowerCase();
  if (!keyword) return props.providers;
  return props.providers.filter((provider) =>
    [provider.id, provider.name, provider.description]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(keyword)),
  );
});
const providerListHeight = computed(() => {
  const rowCount = filteredProviders.value.length || 2;
  return `${Math.min(rowCount * 48 + 8, 320)}px`;
});

function selectProvider(providerId: string) {
  emit("select-provider", providerId);
  open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button v-if="activeProvider" variant="ghost" class="h-11 max-w-full justify-start gap-2 px-2">
        <ProviderAvatar :name="activeProvider.name" :src="activeProvider.iconUrl" />
        <span class="min-w-0 text-left">
          <span class="block truncate text-sm font-medium">{{ activeProvider.name }}</span>
          <span class="block truncate text-xs font-normal text-muted-foreground">
            {{ activeProvider.description || activeProvider.id }}
          </span>
        </span>
        <ChevronDown class="ml-1 shrink-0 text-muted-foreground" />
      </Button>
    </PopoverTrigger>

    <PopoverContent align="start" :side-offset="6" class="w-[min(24rem,calc(100vw-1rem))] p-2">
      <div class="flex items-center gap-2 p-1">
        <div class="relative min-w-0 flex-1">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            :model-value="search"
            class="h-9 pl-8"
            placeholder="搜索提供商"
            @update:model-value="emit('update:search', String($event))"
          />
        </div>
        <slot name="actions" />
      </div>

      <ScrollArea class="mt-1" :style="{ height: providerListHeight }">
        <div class="flex flex-col gap-1 p-1">
          <div
            v-for="provider in filteredProviders"
            :key="provider.id"
            class="flex h-11 items-center gap-2 rounded-md px-2 hover:bg-accent"
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2 text-left"
              @click="selectProvider(provider.id)"
            >
              <ProviderAvatar :name="provider.name" :src="provider.iconUrl" />
              <span class="min-w-0 flex-1 truncate text-sm">{{ provider.name }}</span>
              <Check v-if="provider.id === activeProviderId" class="shrink-0 text-muted-foreground" />
            </button>
            <Switch
              size="sm"
              :model-value="provider.enabled"
              :disabled="provider.canEnable === false"
              :title="provider.canEnable === false ? '填写 API Key 后才能启用' : '启用提供商'"
              @click.stop
              @update:model-value="emit('toggle-provider', provider.id, Boolean($event))"
            />
          </div>
          <p v-if="filteredProviders.length === 0" class="py-8 text-center text-sm text-muted-foreground">
            没有匹配的提供商
          </p>
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
</template>
