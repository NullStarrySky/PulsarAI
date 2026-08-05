<script setup lang="ts">
import { Box, Command, FileText, Folder, MessageSquare, Package, Plug, Search } from "lucide-vue-next";
import { type Component, computed, nextTick, ref, watch } from "vue";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCommandStore } from "@/features/Hotkey/application/command-store";
import { useHotkeyStore } from "@/features/Hotkey/application/hotkey-store";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import type { PluginSearchHit } from "@/features/Resources/Plugin/application/plugin-persistence";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import { useLayoutStore } from "@/features/UI/application/layout-store";

type SearchResult = {
  id: string;
  title: string;
  description: string;
  icon: Component;
  hotkey?: string;
  run: () => unknown;
};

const commandStore = useCommandStore();
const hotkeyStore = useHotkeyStore();
const conversation = useConversationStore();
const pluginStore = usePluginStore();
const layout = useLayoutStore();
const inputRoot = ref<HTMLElement | null>(null);
const activeIndex = ref(0);
const pluginNodeHits = ref<PluginSearchHit[]>([]);
let pluginSearchTimer: number | undefined;
let pluginSearchSequence = 0;

const query = computed({
  get: () => commandStore.paletteQuery,
  set: (value: string) => {
    commandStore.paletteQuery = value;
  },
});
const isTagSearch = computed(() => query.value.trim().toLowerCase().startsWith("tag:"));
const normalizedQuery = computed(() =>
  (isTagSearch.value ? query.value.trim().slice(4) : query.value)
    .trim()
    .toLowerCase(),
);

const commandResults = computed<SearchResult[]>(() => {
  if (isTagSearch.value) {
    return [];
  }
  const search = normalizedQuery.value;
  return commandStore.commands
    .filter((command) =>
      !search || `${command.title} ${command.description ?? ""} ${command.category}`.toLowerCase().includes(search),
    )
    .map((command) => ({
      id: `command:${command.id}`,
      title: command.title,
      description: command.category,
      icon: command.icon ?? Command,
      hotkey: hotkeyStore.getHotkey(command.id),
      run: () => commandStore.executeCommand(command.id),
    }));
});

const packageResults = computed<SearchResult[]>(() => {
  const search = normalizedQuery.value;
  return conversation.packages
    .filter((item) => matchesItem([item.name, item.description, item.id], search, isTagSearch.value))
    .map((item) => ({
      id: `package:${item.id}`,
      title: item.name,
      description: item.description || "角色包",
      icon: Package,
      run: async () => {
        await conversation.openPackage(item.id);
        const active = conversation.activeConversation;
        if (active) {
          layout.openResourceTab({
            resourceType: "conversation",
            resourceId: active.id,
            packageId: active.packageId,
            title: active.title,
          });
        }
        commandStore.closePalette();
      },
    }));
});

const conversationResults = computed<SearchResult[]>(() => {
  const search = normalizedQuery.value;
  return conversation.conversations
    .filter((item) => matchesItem([item.title, item.id, item.packageId], search, isTagSearch.value))
    .map((item) => ({
      id: `conversation:${item.id}`,
      title: item.title,
      description: conversation.packages.find((packageItem) => packageItem.id === item.packageId)?.name ?? "对话",
      icon: MessageSquare,
      run: () => {
        conversation.openConversation(item.id);
        layout.openResourceTab({
          resourceType: "conversation",
          resourceId: item.id,
          packageId: item.packageId,
          title: item.title,
        });
        commandStore.closePalette();
      },
    }));
});

const pluginResults = computed<SearchResult[]>(() => {
  if (isTagSearch.value) return [];
  const search = normalizedQuery.value;
  return pluginStore.sortedPlugins
    .filter((plugin) => matchesItem(
      [plugin.name, plugin.shortDescription, plugin.id],
      search,
      false,
    ))
    .map((plugin) => ({
      id: `plugin:${plugin.id}`,
      title: plugin.name,
      description: plugin.shortDescription || (plugin.packageId ? "角色包插件" : "全局插件"),
      icon: Plug,
      run: () => {
        pluginStore.openPlugin(plugin.id);
        layout.openResourceTab({
          resourceType: "plugin",
          resourceId: plugin.id,
          title: plugin.name,
          resourceParams: { nodeId: plugin.root.id },
        });
        commandStore.closePalette();
      },
    }));
});

const pluginResourceResults = computed<SearchResult[]>(() =>
  pluginNodeHits.value.map((hit) => ({
    id: `plugin-resource:${hit.pluginId}:${hit.nodeId}`,
    title: hit.name || hit.path,
    description: [hit.pluginName, hit.path, hit.excerpt]
      .filter(Boolean)
      .join(" · "),
    icon: hit.kind === "folder" ? Folder : FileText,
    run: () => {
      pluginStore.openPlugin(hit.pluginId);
      layout.openResourceTab({
        resourceType: "plugin",
        resourceId: hit.pluginId,
        title: hit.pluginName,
        resourceParams: { nodeId: hit.nodeId },
      });
      commandStore.closePalette();
    },
  })),
);

const sections = computed(() => [
  { name: "命令", items: commandResults.value },
  { name: "角色包", items: packageResults.value },
  { name: "对话", items: conversationResults.value },
  { name: "插件", items: pluginResults.value },
  { name: "插件资源", items: pluginResourceResults.value },
].filter((section) => section.items.length > 0));

const flatResults = computed(() => sections.value.flatMap((section) => section.items));

watch(
  () => commandStore.paletteOpen,
  async (open) => {
    if (!open) {
      return;
    }
    await Promise.all([conversation.initialize(), pluginStore.initialize()]);
    activeIndex.value = 0;
    await nextTick();
    inputRoot.value?.querySelector("input")?.focus();
  },
);

watch(
  [() => commandStore.paletteOpen, normalizedQuery, isTagSearch],
  ([open, search, tagOnly]) => {
    if (pluginSearchTimer !== undefined) window.clearTimeout(pluginSearchTimer);
    const sequence = ++pluginSearchSequence;
    if (!open || !search || tagOnly) {
      pluginNodeHits.value = [];
      return;
    }
    pluginSearchTimer = window.setTimeout(async () => {
      try {
        const hits = await pluginStore.searchPluginNodes(search, 40);
        if (sequence === pluginSearchSequence) pluginNodeHits.value = hits;
      } catch (error) {
        if (sequence === pluginSearchSequence) {
          pluginNodeHits.value = [];
          console.warn("搜索插件资源失败", error);
        }
      }
    }, 120);
  },
  { immediate: true },
);

watch(query, () => {
  activeIndex.value = 0;
});

function matchesItem(values: Array<string | undefined | null>, search: string, tagOnly: boolean) {
  if (!search) {
    return true;
  }
  if (tagOnly) {
    return values.some((value) => value?.toLowerCase().split(/\s+/).some((part) => part.includes(search)));
  }
  return values.join(" ").toLowerCase().includes(search);
}

function runActive() {
  const item = flatResults.value[activeIndex.value];
  if (item) {
    void item.run();
  }
}

function moveActive(offset: number) {
  if (!flatResults.value.length) {
    return;
  }
  activeIndex.value = (activeIndex.value + offset + flatResults.value.length) % flatResults.value.length;
}

function isActive(id: string) {
  return flatResults.value[activeIndex.value]?.id === id;
}
</script>

<template>
  <Dialog
    :open="commandStore.paletteOpen"
    @update:open="(open) => open ? commandStore.openPalette(query) : commandStore.closePalette()"
  >
    <DialogContent
      class="top-[18vh] translate-y-0 overflow-hidden p-0 sm:max-w-xl"
      :show-close-button="false"
      @escape-key-down="commandStore.closePalette"
      @interact-outside="commandStore.closePalette"
      @pointer-down-outside="commandStore.closePalette"
    >
      <DialogTitle class="sr-only">搜索或运行命令</DialogTitle>
      <div ref="inputRoot" class="border-b px-4 py-3">
        <div class="relative">
          <Search class="pointer-events-none absolute left-0 top-2.5 size-4 text-muted-foreground" />
          <Input
            v-model="query"
            class="border-0 bg-transparent pl-7 text-base shadow-none focus-visible:ring-0"
            placeholder="搜索命令、对话、插件路径或内容"
            @keydown.down.prevent="moveActive(1)"
            @keydown.up.prevent="moveActive(-1)"
            @keydown.enter.prevent="runActive"
            @keydown.esc.prevent="commandStore.closePalette"
          />
        </div>
      </div>

      <ScrollArea class="max-h-[62vh]">
        <div v-if="sections.length" class="p-2">
          <section v-for="section in sections" :key="section.name" class="py-1">
            <p class="px-2 py-1 text-xs font-medium text-muted-foreground">{{ section.name }}</p>
            <button
              v-for="item in section.items"
              :key="item.id"
              class="flex h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm"
              :class="isActive(item.id) ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'"
              type="button"
              @mouseenter="activeIndex = flatResults.findIndex((result) => result.id === item.id)"
              @click="item.run"
            >
              <component :is="item.icon || Box" class="size-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ item.title }}</span>
                <span class="block truncate text-xs text-muted-foreground">{{ item.description }}</span>
              </span>
              <Badge v-if="item.hotkey" variant="secondary" class="shrink-0 font-mono">{{ item.hotkey }}</Badge>
            </button>
          </section>
        </div>
        <div v-else class="px-4 py-10 text-center text-sm text-muted-foreground">
          没有找到匹配项
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
</template>
