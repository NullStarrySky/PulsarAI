<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  Braces,
  ChevronDown,
  ChevronRight,
  Code2,
  FileText,
  Folder,
  FolderOpen,
  Image,
  Package,
  Upload,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePluginStore } from "../application/plugin-store";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { createPluginMediaContent } from "../domain/plugin-media";
import {
  pluginFileType,
  pluginNodePath,
  sortPluginTreeNodes,
  type Plugin,
  type PluginFile,
  type PluginTreeNode,
} from "../domain/plugin-types";

interface TreeRow {
  key: string;
  plugin: Plugin;
  node: PluginTreeNode;
  depth: number;
  path: string;
  root: boolean;
}

const emit = defineEmits<{
  select: [value: { plugin: Plugin; file: PluginFile; path: string }];
}>();

const pluginStore = usePluginStore();
const conversation = useConversationStore();
const importInput = ref<HTMLInputElement | null>(null);
const expandedIds = ref(new Set<string>());
const selectedKey = ref("");
const focusedPluginId = ref("");
const localError = ref("");

const packagePlugins = computed(() => pluginStore.sortedPluginsForPackage(
  conversation.activePackageId,
  conversation.activePackage?.enabledGlobalPluginIds,
  conversation.activePackage?.mainPluginId,
));

const treeRows = computed(() => {
  const rows: TreeRow[] = [];
  for (const plugin of packagePlugins.value) {
    const rootKey = keyFor(plugin.id, plugin.root.id);
    rows.push({ key: rootKey, plugin, node: plugin.root, depth: 0, path: "", root: true });
    if (!expandedIds.value.has(rootKey)) continue;
    appendChildren(rows, plugin, plugin.root.children, 1, []);
  }
  return rows;
});

function keyFor(pluginId: string, nodeId: string) {
  return `${pluginId}:${nodeId}`;
}

function appendChildren(
  rows: TreeRow[],
  plugin: Plugin,
  nodes: PluginTreeNode[],
  depth: number,
  parents: string[],
) {
  for (const node of sortPluginTreeNodes(nodes)) {
    const key = keyFor(plugin.id, node.id);
    const path = [...parents, node.name].join("/");
    rows.push({ key, plugin, node, depth, path, root: false });
    if (node.kind === "folder" && expandedIds.value.has(key)) {
      appendChildren(rows, plugin, node.children, depth + 1, [...parents, node.name]);
    }
  }
}

function toggleRow(row: TreeRow) {
  if (row.node.kind !== "folder") return;
  const next = new Set(expandedIds.value);
  next.has(row.key) ? next.delete(row.key) : next.add(row.key);
  expandedIds.value = next;
  focusedPluginId.value = row.plugin.id;
}

function activateRow(row: TreeRow) {
  focusedPluginId.value = row.plugin.id;
  void pluginStore.openPlugin(row.plugin.id);
  if (row.node.kind === "folder") {
    toggleRow(row);
    return;
  }
  selectedKey.value = row.key;
  emit("select", { plugin: row.plugin, file: row.node, path: row.path });
}

function iconFor(row: TreeRow) {
  if (row.root) return Package;
  if (row.node.kind === "folder") {
    return expandedIds.value.has(row.key) ? FolderOpen : Folder;
  }
  const type = pluginFileType(row.node.name);
  if (type === "javascript" || type === "component") return Code2;
  if (type === "json" || type === "chat" || type === "data") return Braces;
  if (type === "media") return Image;
  return FileText;
}

function chooseImport() {
  importInput.value?.click();
}

async function importFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (!files.length) return;
  const plugin = packagePlugins.value.find((item) => item.id === focusedPluginId.value)
    ?? packagePlugins.value[0];
  if (!plugin) return;

  localError.value = "";
  try {
    for (const file of files) {
      const content = await browserFileContent(file);
      const created = await pluginStore.importFile(plugin.id, plugin.root.id, file.name, content);
      if (!created) continue;
      const rootKey = keyFor(plugin.id, plugin.root.id);
      expandedIds.value = new Set([...expandedIds.value, rootKey]);
      selectedKey.value = keyFor(plugin.id, created.id);
      emit("select", {
        plugin,
        file: created,
        path: pluginNodePath(plugin.root, created.id).join("/"),
      });
    }
  } catch (error) {
    localError.value = error instanceof Error ? error.message : "导入文件失败";
  }
}

async function browserFileContent(file: File) {
  if (pluginFileType(file.name) === "media") {
    return createPluginMediaContent(await readFileAsDataUrl(file));
  }
  const source = await file.text();
  const type = pluginFileType(file.name);
  if (type !== "json" && type !== "chat" && type !== "data") return source;
  try {
    return JSON.parse(source) as unknown;
  } catch {
    return source;
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

onMounted(async () => {
  try {
    await Promise.all([pluginStore.initialize(), conversation.initialize()]);
    const first = packagePlugins.value[0];
    if (!first) return;
    focusedPluginId.value = first.id;
    expandedIds.value = new Set([keyFor(first.id, first.root.id)]);
  } catch (error) {
    localError.value = error instanceof Error ? error.message : "资产数据库初始化失败";
  }
});

watch(packagePlugins, (plugins) => {
  const first = plugins[0];
  if (!first) {
    focusedPluginId.value = "";
    expandedIds.value = new Set();
    return;
  }
  if (!plugins.some((item) => item.id === focusedPluginId.value)) {
    focusedPluginId.value = first.id;
    expandedIds.value = new Set([keyFor(first.id, first.root.id)]);
  }
});
</script>

<template>
  <aside class="asset-tree-panel absolute right-3 top-3 z-40 flex max-h-[min(34rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover shadow-sm mobile:right-2 mobile:top-2 mobile:max-h-[calc(100%-1rem)]">
    <div class="flex h-12 shrink-0 items-center justify-between border-b border-border/80 px-3">
      <h2 class="text-base font-medium">资产</h2>
      <Button variant="ghost" size="icon-sm" class="rounded-full" title="导入文件" aria-label="导入文件" @click="chooseImport">
        <Upload class="size-4" />
      </Button>
      <input ref="importInput" class="hidden" type="file" multiple @change="importFiles" />
    </div>

    <ScrollArea class="min-h-0 flex-1">
      <div class="space-y-0.5 p-2">
        <button
          v-for="row in treeRows"
          :key="row.key"
          type="button"
          class="group flex h-8 w-full min-w-0 items-center gap-1 rounded-md pr-2 text-left text-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :class="selectedKey === row.key && 'bg-muted text-foreground'"
          :style="{ paddingLeft: `${Math.min(row.depth, 7) * 14 + 6}px` }"
          :title="row.path || row.plugin.name"
          @click="activateRow(row)"
        >
          <span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            <component
              :is="expandedIds.has(row.key) ? ChevronDown : ChevronRight"
              v-if="row.node.kind === 'folder'"
              class="size-3.5"
            />
          </span>
          <component :is="iconFor(row)" class="size-4 shrink-0 text-muted-foreground" />
          <span class="truncate" :class="row.root && 'font-medium'">{{ row.root ? row.plugin.name : row.node.name }}</span>
          <span v-if="row.root && row.plugin.enabled" class="ml-auto size-1.5 shrink-0 rounded-full bg-emerald-500" title="已启用" />
        </button>

        <p v-if="pluginStore.loaded && treeRows.length === 0" class="px-2 py-10 text-center text-sm text-muted-foreground">暂无资产</p>
        <p v-if="pluginStore.loadError || localError" class="px-2 py-3 text-xs leading-5 text-destructive">
          {{ localError || pluginStore.loadError }}
        </p>
      </div>
    </ScrollArea>

    <div class="shrink-0 border-t border-border/80 px-3 py-2 text-xs text-muted-foreground">
      {{ packagePlugins.length }} 个关联插件 · {{ treeRows.filter((row) => row.node.kind === 'file').length }} 个可见文件
    </div>
  </aside>
</template>

<style scoped>
.asset-tree-panel {
  width: clamp(15rem, calc((100vw - 724px) / 2 - 1.5rem), 18rem);
}

:global(.mobile-layout) .asset-tree-panel {
  width: min(21rem, calc(100% - 1rem));
}
</style>
