<script setup lang="ts">
import { computed } from "vue";
import { ChevronDown, Search } from "lucide-vue-next";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
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

const enabledCollapsed = defineModel<boolean>("enabledCollapsed", { default: false });
const disabledCollapsed = defineModel<boolean>("disabledCollapsed", { default: false });

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
const enabledProviders = computed(() => filteredProviders.value.filter((provider) => provider.enabled));
const disabledProviders = computed(() => filteredProviders.value.filter((provider) => !provider.enabled));
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <div class="grid h-full min-h-0 overflow-hidden lg:grid-cols-[15rem_minmax(0,1fr)] mobile:grid-rows-[10rem_minmax(0,1fr)]">
      <aside class="flex min-h-0 flex-col border-r mobile:border-b mobile:border-r-0">
        <div class="border-b p-3">
          <div class="relative min-w-0">
            <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              :model-value="search"
              class="h-8 pl-8"
              placeholder="搜索服务商"
              @update:model-value="emit('update:search', String($event))"
            />
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          <section>
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-md px-2 py-2 text-xs font-medium text-muted-foreground"
              @click="enabledCollapsed = !enabledCollapsed"
            >
              已启用
              <ChevronDown :class="cn('size-4 transition-transform', enabledCollapsed && '-rotate-90')" />
            </button>
            <div v-if="!enabledCollapsed" class="flex flex-col gap-1">
              <button
                v-for="provider in enabledProviders"
                :key="provider.id"
                type="button"
                :class="cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent',
                  provider.id === activeProvider?.id && 'bg-accent text-accent-foreground',
                )"
                @click="emit('select-provider', provider.id)"
              >
                <ProviderAvatar :name="provider.name" :src="provider.iconUrl" />
                <span class="min-w-0 truncate">{{ provider.name }}</span>
              </button>
              <p v-if="enabledProviders.length === 0" class="px-2 py-2 text-xs text-muted-foreground">暂无已启用服务</p>
            </div>
          </section>

          <section class="mt-2">
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-md px-2 py-2 text-xs font-medium text-muted-foreground"
              @click="disabledCollapsed = !disabledCollapsed"
            >
              未启用
              <ChevronDown :class="cn('size-4 transition-transform', disabledCollapsed && '-rotate-90')" />
            </button>
            <div v-if="!disabledCollapsed" class="flex flex-col gap-1">
              <button
                v-for="provider in disabledProviders"
                :key="provider.id"
                type="button"
                :class="cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent',
                  provider.id === activeProvider?.id && 'bg-accent text-accent-foreground',
                )"
                @click="emit('select-provider', provider.id)"
              >
                <ProviderAvatar :name="provider.name" :src="provider.iconUrl" />
                <span class="min-w-0 truncate">{{ provider.name }}</span>
              </button>
              <p v-if="disabledProviders.length === 0" class="px-2 py-2 text-xs text-muted-foreground">暂无未启用服务</p>
            </div>
          </section>
        </div>
      </aside>

      <section v-if="activeProvider" class="flex min-h-0 flex-col">
        <header class="flex items-center justify-between gap-3 border-b px-6 pb-5 pt-6 mobile:px-4 mobile:py-3">
          <div class="flex min-w-0 items-center gap-3">
            <ProviderAvatar :name="activeProvider.name" :src="activeProvider.iconUrl" />
            <div class="min-w-0">
              <h3 class="truncate text-lg font-semibold">{{ activeProvider.name }}</h3>
              <p class="truncate text-sm text-muted-foreground">{{ activeProvider.description || activeProvider.id }}</p>
            </div>
          </div>
          <Switch
            :model-value="activeProvider.enabled"
            @update:model-value="emit('toggle-provider', activeProvider.id, Boolean($event))"
          />
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto p-6 mobile:p-4">
          <slot :provider="activeProvider" />
        </div>
      </section>
    </div>
  </section>
</template>
