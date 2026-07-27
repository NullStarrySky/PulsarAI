<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { MoreHorizontal, Plus, Search, ShieldCheck, Star, Trash2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import CapabilityGrantEditor from "@/features/Capabilities/presentation/CapabilityGrantEditor.vue";
import type { CapabilityGrants } from "@/features/Capabilities/domain/capability";
import { useDefaultConfigStore } from "@/features/defaultConfigs/application/default-config-store";

const layout = useLayoutStore();
const conversation = useConversationStore();
const pluginStore = usePluginStore();
const defaults = useDefaultConfigStore();
const draggingPluginId = ref("");

onMounted(() => {
  void Promise.all([conversation.initialize(), pluginStore.initialize(), defaults.load()]);
});

const usesDefaultCapabilities = computed(
  () => conversation.activePackage?.capabilities === undefined,
);

async function setUsesDefaultCapabilities(enabled: boolean) {
  const active = conversation.activePackage;
  if (!active) {
    return;
  }
  await conversation.updatePackage(active.id, {
    capabilities: enabled
      ? undefined
      : structuredClone(defaults.defaultCapabilities),
  });
}

async function updatePackageCapabilities(value: CapabilityGrants) {
  const active = conversation.activePackage;
  if (!active) {
    return;
  }
  await conversation.updatePackage(active.id, { capabilities: value });
}

const pluginSections = computed(() => {
  const plugins = pluginStore.visiblePluginsForPackage(
    conversation.activePackageId,
    conversation.activePackage?.globalPluginOrder,
  );
  return [
    {
      id: "local",
      label: "本地",
      plugins: plugins.filter((plugin) => plugin.packageId !== null),
    },
    {
      id: "global",
      label: "内置",
      plugins: plugins.filter((plugin) => plugin.packageId === null),
    },
  ];
});

function openPlugin(pluginId: string) {
  const plugin = pluginStore.plugins.find((item) => item.id === pluginId);
  if (!plugin) {
    return;
  }
  pluginStore.openPlugin(plugin.id);
  layout.openResourceTab({
    resourceType: "plugin",
    resourceId: plugin.id,
    packageId: conversation.activePackageId,
    title: plugin.name,
  });
}

async function createPlugin() {
  if (!conversation.activePackageId) {
    return;
  }
  const plugin = await pluginStore.createPlugin(conversation.activePackageId);
  if (plugin) {
    openPlugin(plugin.id);
  }
}

function onDragStart(pluginId: string) {
  draggingPluginId.value = pluginId;
}

async function onDrop(targetPluginId: string) {
  if (!draggingPluginId.value) {
    return;
  }
  const moving = pluginStore.plugins.find((plugin) => plugin.id === draggingPluginId.value);
  const target = pluginStore.plugins.find((plugin) => plugin.id === targetPluginId);
  if (!moving || !target || moving.packageId !== target.packageId) {
    draggingPluginId.value = "";
    return;
  }

  if (moving.packageId === null) {
    await conversation.movePackageGlobalPluginBefore(
      conversation.activePackageId,
      moving.id,
      target.builtIn ? undefined : target.id,
    );
  } else {
    await pluginStore.movePluginBefore(
      moving.id,
      target.id,
      conversation.activePackageId,
    );
  }
  draggingPluginId.value = "";
}
</script>

<template>
  <div class="flex min-w-72 flex-1 flex-col overflow-hidden">
    <div class="flex h-12 items-center gap-2 border-b px-3">
      <div class="relative min-w-0 flex-1">
        <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="pluginStore.search"
          class="h-8 w-full rounded-md bg-transparent pl-8 pr-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:bg-muted/45"
          placeholder="搜索插件"
        />
      </div>
      <Button size="icon" variant="ghost" class="size-8" title="新建插件" @click="createPlugin">
        <Plus class="size-4" />
      </Button>
    </div>

    <div class="flex-1 overflow-y-auto px-2 pb-3">
      <details class="mt-3 rounded-lg border bg-card/40">
        <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium">
          <ShieldCheck class="size-4 text-muted-foreground" />
          Feature API 权限
        </summary>
        <div class="border-t p-2">
          <div class="mb-2 flex min-h-10 items-center justify-between gap-3 px-1">
            <div>
              <div class="text-xs font-medium">继承默认权限</div>
              <div class="text-[11px] text-muted-foreground">关闭后仅影响当前角色包。</div>
            </div>
            <Switch
              size="sm"
              :model-value="usesDefaultCapabilities"
              @update:model-value="setUsesDefaultCapabilities(Boolean($event))"
            />
          </div>
          <CapabilityGrantEditor
            v-if="conversation.activePackage?.capabilities"
            compact
            :model-value="conversation.activePackage.capabilities"
            @update:model-value="updatePackageCapabilities"
          />
          <p v-else class="px-1 pb-1 text-xs leading-5 text-muted-foreground">
            当前角色包使用“设置 → 默认项”中的权限配置。
          </p>
        </div>
      </details>

      <section v-for="section in pluginSections" :key="section.id" class="pt-3">
        <div class="px-2.5 pb-1.5 text-[11px] font-medium text-muted-foreground">
          {{ section.label }}
        </div>
        <div
          v-for="plugin in section.plugins"
          :key="plugin.id"
          :draggable="!plugin.builtIn"
          :class="
            cn(
              'group mb-0.5 flex min-h-12 cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors hover:bg-accent/55',
              plugin.id === pluginStore.activePluginId && 'bg-accent text-accent-foreground',
              draggingPluginId === plugin.id && 'opacity-50',
            )
          "
          @click="openPlugin(plugin.id)"
          @dragstart="onDragStart(plugin.id)"
          @dragend="draggingPluginId = ''"
          @dragover.prevent
          @drop.prevent="onDrop(plugin.id)"
        >
          <img v-if="plugin.icon" :src="plugin.icon" alt="" class="size-8 rounded-md object-cover" />
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-baseline gap-1.5">
              <span class="truncate text-sm font-medium">{{ plugin.name }}</span>
              <span v-if="plugin.main" class="shrink-0 text-[10px] font-medium text-primary">主要</span>
              <span v-if="plugin.builtIn" class="shrink-0 text-[10px] text-muted-foreground">系统</span>
            </div>
            <p v-if="plugin.shortDescription" class="truncate text-xs text-muted-foreground">
              {{ plugin.shortDescription }}
            </p>
          </div>

          <div class="flex items-center gap-1" @click.stop>
            <Switch size="sm" :model-value="plugin.enabled" @update:model-value="pluginStore.updatePlugin(plugin.id, { enabled: Boolean($event) })" />
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button size="icon" variant="ghost" class="mobile-touch-actions size-7 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" title="插件菜单">
                  <MoreHorizontal class="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-40">
                <DropdownMenuItem :disabled="plugin.packageId === null" @click="pluginStore.updatePlugin(plugin.id, { main: !plugin.main })">
                  <Star class="mr-2 size-4" />
                  {{ plugin.main ? "取消主要" : "设为主要" }}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  :disabled="plugin.packageId === null"
                  class="text-destructive focus:text-destructive"
                  @click="pluginStore.deletePlugin(plugin.id)"
                >
                  <Trash2 class="mr-2 size-4" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div
          v-if="section.plugins.length === 0"
          class="px-2.5 py-2 text-xs text-muted-foreground"
        >
          暂无{{ section.label }}插件
        </div>
      </section>
    </div>
  </div>
</template>
