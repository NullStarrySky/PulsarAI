<script setup lang="ts">
import { computed, onMounted } from "vue";
import { Plug } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";

const conversation = useConversationStore();
const pluginStore = usePluginStore();
const plugins = computed(() =>
  pluginStore.sortedPluginsForPackage(
    conversation.activePackageId,
    conversation.activePackage?.globalPluginOrder,
  ),
);

onMounted(() => {
  void Promise.all([conversation.initialize(), pluginStore.initialize()]);
});

function sortedResources<T extends { order: number; name: string }>(resources: T[]): T[] {
  return [...resources].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "zh-Hans"));
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button size="icon" variant="ghost" class="size-8" title="插件资源">
        <Plug class="size-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-64">
      <DropdownMenuLabel class="text-xs font-medium text-muted-foreground">插件资源</DropdownMenuLabel>
      <DropdownMenuSub v-for="plugin in plugins" :key="plugin.id">
        <DropdownMenuSubTrigger class="gap-2">
          <img v-if="plugin.icon" :src="plugin.icon" alt="" class="size-5 rounded object-cover" />
          <span class="min-w-0 flex-1 truncate">{{ plugin.name }}</span>
          <span v-if="plugin.main" class="ml-2 text-[10px] text-primary">主要</span>
          <span v-if="plugin.builtIn" class="ml-2 text-[10px] text-muted-foreground">内置</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent class="w-72">
          <DropdownMenuItem class="min-h-9 justify-between" @select.prevent>
            <span class="truncate">启用插件</span>
            <Switch size="sm" :model-value="plugin.enabled" @click.stop @update:model-value="pluginStore.updatePlugin(plugin.id, { enabled: Boolean($event) })" />
          </DropdownMenuItem>
          <DropdownMenuSeparator />

          <DropdownMenuSub v-for="container in plugin.resources" :key="container.id">
            <DropdownMenuSubTrigger class="gap-2">
              <img v-if="container.icon" :src="container.icon" alt="" class="size-5 rounded object-cover" />
              <span class="min-w-0 flex-1 truncate">{{ container.name }}</span>
              <span class="ml-2 text-xs font-medium text-muted-foreground">{{ container.resources.length }}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent class="w-80">
              <DropdownMenuItem
                v-for="resource in sortedResources(container.resources)"
                :key="resource.id"
                class="grid min-h-10 gap-2"
                :class="resource.icon ? 'grid-cols-[auto_minmax(0,1fr)_auto_auto]' : 'grid-cols-[minmax(0,1fr)_auto_auto]'"
                @select.prevent
              >
                <img v-if="resource.icon" :src="resource.icon" alt="" class="size-6 rounded object-cover" />
                <span class="min-w-0">
                  <span class="block truncate text-sm">{{ resource.name }}</span>
                  <span v-if="resource.description" class="block truncate text-[11px] text-muted-foreground">
                    {{ resource.description }}
                  </span>
                </span>
                <Switch
                  v-if="container.contentControl.selectable !== 'none'"
                  size="sm"
                  :model-value="resource.enabled"
                  title="启用"
                  @click.stop
                  @update:model-value="pluginStore.toggleResourceEnabled(plugin.id, container.id, resource.id, Boolean($event))"
                />
                <Switch
                  v-if="container.contentControl.insertable"
                  size="sm"
                  :model-value="resource.inserted"
                  title="插入"
                  @click.stop
                  @update:model-value="pluginStore.toggleResourceInserted(plugin.id, container.id, resource.id, Boolean($event))"
                />
              </DropdownMenuItem>
              <DropdownMenuItem v-if="container.resources.length === 0" disabled>没有资源</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
