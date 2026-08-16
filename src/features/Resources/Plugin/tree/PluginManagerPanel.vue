<script setup lang="ts">
import { computed, ref } from "vue";
import { Crown, Package, Pencil, Power, X } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversationStore } from "@/features/Resources/Conversation/store/conversation-store";
import { usePluginStore } from "@/features/Resources/Plugin/tree/plugin-store";
import type { Plugin } from "@/features/Resources/Plugin/tree/plugin-types";

const emit = defineEmits<{
  select: [plugin: Plugin];
  close: [];
}>();

const conversation = useConversationStore();
const pluginStore = usePluginStore();
const renamingPluginId = ref("");
const nameDraft = ref("");
const localError = ref("");

const localPlugins = computed(() => pluginStore.sortedPlugins.filter(
  (plugin) => plugin.packageId === conversation.activePackageId,
));
const globalPlugins = computed(() => pluginStore.globalPlugins);

function pluginIsActive(plugin: Plugin) {
  if (plugin.id === conversation.activePackage?.mainPluginId) return true;
  if (plugin.packageId !== null) return plugin.enabled;
  return plugin.enabled && (conversation.activePackage?.enabledGlobalPluginIds.includes(plugin.id) ?? false);
}

async function togglePlugin(plugin: Plugin) {
  if (plugin.id === conversation.activePackage?.mainPluginId) return;
  if (plugin.packageId !== null) {
    await pluginStore.updatePlugin(plugin.id, { enabled: !plugin.enabled });
    return;
  }
  const item = conversation.activePackage;
  if (!item) return;
  const enabled = new Set(item.enabledGlobalPluginIds);
  if (pluginIsActive(plugin)) enabled.delete(plugin.id);
  else {
    if (!plugin.enabled) await pluginStore.updatePlugin(plugin.id, { enabled: true });
    enabled.add(plugin.id);
  }
  await conversation.updatePackage(item.id, { enabledGlobalPluginIds: [...enabled] });
}

async function setMainPlugin(plugin: Plugin) {
  const item = conversation.activePackage;
  if (!item || item.mainPluginId === plugin.id) return;
  localError.value = "";
  try {
    await conversation.updatePackage(item.id, { mainPluginId: plugin.id });
  } catch (error) {
    localError.value = error instanceof Error ? error.message : "无法设为主要插件";
  }
}

function startRename(plugin: Plugin) {
  renamingPluginId.value = plugin.id;
  nameDraft.value = plugin.name;
}

async function confirmRename(plugin: Plugin) {
  const name = nameDraft.value.trim();
  renamingPluginId.value = "";
  if (name && name !== plugin.name) await pluginStore.updatePlugin(plugin.id, { name });
}
</script>

<template>
  <aside class="absolute right-3 top-3 z-40 flex w-[min(22rem,calc(100%-1.5rem))] max-h-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover/95 shadow-xl backdrop-blur-md mobile:right-2 mobile:top-2 mobile:w-[calc(100%-1rem)] mobile:max-h-[calc(100%-1rem)]">
    <div class="flex h-12 shrink-0 items-center justify-between border-b border-border/80 px-3">
      <h2 class="flex items-center gap-1.5 text-base font-medium"><Package class="size-4 text-muted-foreground" />插件</h2>
      <Button variant="ghost" size="icon-sm" class="rounded-full hover:bg-destructive/15 hover:text-destructive" title="关闭插件" aria-label="关闭插件" @click="emit('close')"><X class="size-4" /></Button>
    </div>

    <ScrollArea class="min-h-0 flex-1">
      <div class="space-y-4 p-2">
        <section v-for="section in [{ title: '本地插件', plugins: localPlugins }, { title: '全局插件', plugins: globalPlugins }]" :key="section.title">
          <h3 class="px-2 pb-1 text-[11px] font-medium text-muted-foreground">{{ section.title }}</h3>
          <div class="space-y-1">
            <div v-for="item in section.plugins" :key="item.id" class="group flex min-w-0 items-center gap-1 rounded-lg p-1 hover:bg-muted/70">
              <button type="button" class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left" :title="`打开 ${item.name} 的资产`" @click="emit('select', item)">
                <Package class="size-4 shrink-0 text-muted-foreground" />
                <span v-if="renamingPluginId !== item.id" class="min-w-0 flex-1 truncate text-sm font-medium">{{ item.name }}</span>
                <Badge v-if="item.packageId !== null && renamingPluginId !== item.id" variant="secondary" class="shrink-0 text-[10px] font-normal">本地</Badge>
              </button>
              <Input v-if="renamingPluginId === item.id" v-model="nameDraft" autofocus class="h-7 min-w-0 flex-1 px-2 text-xs" @click.stop @keydown.enter.prevent="confirmRename(item)" @keydown.esc.prevent="renamingPluginId = ''" @blur="confirmRename(item)" />
              <Crown v-if="item.id === conversation.activePackage?.mainPluginId" class="size-4 shrink-0 fill-current text-amber-500" title="主要插件" />
              <Button v-else variant="ghost" size="icon-sm" class="size-7 shrink-0" title="设为主要插件" @click="setMainPlugin(item)"><Crown class="size-4" /></Button>
              <Button variant="ghost" size="icon-sm" class="size-7 shrink-0" :class="pluginIsActive(item) ? 'text-emerald-500' : 'text-muted-foreground/45'" :disabled="item.id === conversation.activePackage?.mainPluginId" :title="item.id === conversation.activePackage?.mainPluginId ? '主插件保持启用' : pluginIsActive(item) ? '关闭插件' : '启用插件'" @click="togglePlugin(item)"><Power class="size-4" /></Button>
              <Button variant="ghost" size="icon-sm" class="size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 mobile:opacity-100" title="重命名插件" @click="startRename(item)"><Pencil class="size-4" /></Button>
            </div>
            <p v-if="section.plugins.length === 0" class="px-2 py-2 text-xs text-muted-foreground">暂无插件</p>
          </div>
        </section>
        <p v-if="localError" class="px-2 text-xs leading-5 text-destructive">{{ localError }}</p>
      </div>
    </ScrollArea>
  </aside>
</template>
