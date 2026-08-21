<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  Braces,
  ClipboardPaste,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  CopyPlus,
  FileDown,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Image,
  MoreHorizontal,
  Package,
  PenSquare,
  Trash2,
  Upload,
  X,
} from "lucide-vue-next";
import { push } from "notivue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import { createPluginResourceContent } from "@/features/Plugin/editors/resource-defaults";
import { createPluginMediaContent } from "@/features/Plugin/editors/media/plugin-media";
import {
  pluginFileType,
  findPluginNodeByPath,
  pluginChildNodes,
  pluginConventions,
  pluginParentPath,
  type Plugin,
  type PluginFile,
  type PluginTreeNode,
} from "@/features/Plugin/tree/plugin-types";

interface TreeRow {
  key: string;
  plugin: Plugin;
  node: PluginTreeNode | null;
  depth: number;
  path: string;
  root: boolean;
}

type NewPluginFileType = "agents" | "markdown" | "chat" | "data" | "javascript" | "json" | "media" | "component" | "text";
type ClipboardNode = {
  name: string;
  kind: "file" | "folder";
  content?: unknown;
  order?: number;
  insertion?: PluginFile["insertion"];
  children?: ClipboardNode[];
};

const newFileTypes: Array<{ id: NewPluginFileType; label: string; extension: string }> = [
  { id: "agents", label: "AGENTS.md", extension: ".md" },
  { id: "markdown", label: "Markdown", extension: ".md" },
  { id: "chat", label: "角色消息", extension: ".chat.json" },
  { id: "data", label: "数据定义", extension: ".data.json" },
  { id: "javascript", label: "JavaScript", extension: ".js" },
  { id: "json", label: "JSON", extension: ".json" },
  { id: "media", label: "媒体", extension: ".png" },
  { id: "component", label: "组件", extension: ".vue" },
  { id: "text", label: "纯文本", extension: ".txt" },
];

const props = defineProps<{
  pluginId: string;
}>();

const emit = defineEmits<{
  select: [value: { plugin: Plugin; file: PluginFile; path: string }];
  close: [];
}>();

const pluginStore = usePluginStore();
const importInput = ref<HTMLInputElement | null>(null);
const expandedIds = ref(new Set<string>());
const selectedKey = ref("");
const focusedPluginId = ref("");
const localError = ref("");
const importTarget = ref<{ pluginId: string; folderPath: string } | null>(null);
const clipboardNode = ref<ClipboardNode | null>(null);
const renameTarget = ref<{ pluginId: string; nodeId: string } | null>(null);
const renameDraft = ref("");
const renamingKey = ref("");
const draggingNode = ref<{ pluginId: string; nodeId: string } | null>(null);
const panelPosition = ref<{ x: number; y: number } | null>(null);
let isDraggingPanel = false;
let dragStartX = 0;
let dragStartY = 0;
let initialX = 0;
let initialY = 0;
let renameFocusTimer: ReturnType<typeof setTimeout> | null = null;

function startPanelDrag(e: MouseEvent) {
  if ((e.target as HTMLElement).closest("button, input")) return;
  isDraggingPanel = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  initialX = panelPosition.value?.x ?? 0;
  initialY = panelPosition.value?.y ?? 0;
  window.addEventListener("mousemove", onPanelDrag);
  window.addEventListener("mouseup", stopPanelDrag);
}

function onPanelDrag(e: MouseEvent) {
  if (!isDraggingPanel) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  panelPosition.value = { x: initialX + dx, y: initialY + dy };
}

function stopPanelDrag() {
  isDraggingPanel = false;
  window.removeEventListener("mousemove", onPanelDrag);
  window.removeEventListener("mouseup", stopPanelDrag);
}

const packagePlugins = computed(() => pluginStore.sortedPlugins.filter((plugin) => plugin.id === props.pluginId));
const selectedPlugin = computed(() => packagePlugins.value[0] ?? null);
const selectedPluginLabel = computed(() => selectedPlugin.value?.packageId !== null ? "本地" : selectedPlugin.value?.name ?? "插件");

function keyFor(pluginId: string, nodeId: string) {
  return `${pluginId}:${nodeId}`;
}

function rootKeyFor(pluginId: string) {
  return `${pluginId}:`;
}

const treeRows = computed(() => {
  const rows: TreeRow[] = [];
  for (const plugin of packagePlugins.value) {
    const rootKey = rootKeyFor(plugin.id);
    rows.push({ key: rootKey, plugin, node: null, depth: 0, path: "", root: true });
    if (!expandedIds.value.has(rootKey)) continue;
    appendChildren(rows, plugin, "", 1);
  }
  return rows;
});

function appendChildren(
  rows: TreeRow[],
  plugin: Plugin,
  folderPath: string,
  depth: number,
) {
  for (const node of pluginChildNodes(plugin, folderPath)) {
    const key = keyFor(plugin.id, node.id);
    rows.push({ key, plugin, node, depth, path: node.path, root: false });
    if (node.kind === "folder" && expandedIds.value.has(key)) {
      appendChildren(rows, plugin, node.path, depth + 1);
    }
  }
}

function folderPathOf(row: TreeRow) {
  return row.root || row.node?.kind === "folder" ? row.node?.path ?? "" : pluginParentPath(row.node?.path ?? "");
}

function toggleRow(row: TreeRow) {
  if (!row.root && row.node?.kind !== "folder") return;
  const next = new Set(expandedIds.value);
  next.has(row.key) ? next.delete(row.key) : next.add(row.key);
  expandedIds.value = next;
  focusedPluginId.value = row.plugin.id;
}

function activateRow(row: TreeRow) {
  focusedPluginId.value = row.plugin.id;
  void pluginStore.openPlugin(row.plugin.id);
  if (row.root || row.node?.kind === "folder") {
    toggleRow(row);
    return;
  }
  selectedKey.value = row.key;
  emit("select", { plugin: row.plugin, file: row.node!, path: row.path });
}


function iconFor(row: TreeRow) {
  if (row.root) return Package;
  if (row.node?.kind === "folder") {
    return expandedIds.value.has(row.key) ? FolderOpen : Folder;
  }
  const type = pluginFileType(row.node?.name ?? "");
  if (type === "javascript" || type === "component") return Code2;
  if (type === "json" || type === "chat" || type === "data") return Braces;
  if (type === "media") return Image;
  return FileText;
}

function expandFolder(plugin: Plugin, folderPath: string) {
  const node = folderPath ? findPluginNodeByPath(plugin, folderPath) : null;
  const key = node ? keyFor(plugin.id, node.id) : rootKeyFor(plugin.id);
  expandedIds.value = new Set([...expandedIds.value, key]);
}

function chooseImport(plugin?: Plugin, folderPath = "") {
  const targetPlugin = plugin
    ?? packagePlugins.value.find((item) => item.id === focusedPluginId.value)
    ?? packagePlugins.value[0];
  if (!targetPlugin) return;
  importTarget.value = { pluginId: targetPlugin.id, folderPath };
  importInput.value?.click();
}

function newFileTemplate(type: NewPluginFileType) {
  if (type === "agents") return { name: "AGENTS.md", content: "# Plugin Instructions\n\n" };
  if (type === "data") return { name: "untitled.data.json", content: createPluginResourceContent("data") };
  if (type === "chat") return { name: "untitled.chat.json", content: createPluginResourceContent("chat") };
  if (type === "javascript") return { name: "untitled.js", content: createPluginResourceContent("javascript") };
  if (type === "json") return { name: "untitled.json", content: createPluginResourceContent("json") };
  if (type === "media") return { name: "untitled.png", content: createPluginResourceContent("media") };
  if (type === "component") return { name: "untitled.vue", content: createPluginResourceContent("component") };
  if (type === "text") return { name: "untitled.txt", content: createPluginResourceContent("text") };
  return { name: "untitled.md", content: createPluginResourceContent("markdown") };
}

async function createFile(plugin: Plugin, folderPath: string, type: NewPluginFileType) {
  const file = await pluginStore.createFile(plugin.id, folderPath, newFileTemplate(type));
  if (!file) return;
  expandFolder(plugin, folderPath);
  selectedKey.value = keyFor(plugin.id, file.id);
}

async function createFolder(plugin: Plugin, parentPath: string) {
  const folder = await pluginStore.createFolder(plugin.id, parentPath, uniqueNodeName(plugin, parentPath, "新文件夹"));
  if (!folder) return;
  expandFolder(plugin, parentPath);
}

function cloneNode(plugin: Plugin, node: PluginTreeNode): ClipboardNode {
  if (node.kind === "file") {
    return {
      name: node.name,
      kind: "file",
      content: structuredClone(node.content),
      order: node.order,
      insertion: node.insertion ? structuredClone(node.insertion) : undefined,
    };
  }
  return {
    name: node.name,
    kind: "folder",
    children: pluginChildNodes(plugin, node.path).map((child) => cloneNode(plugin, child)),
  };
}

function copyNode(plugin: Plugin, node: PluginTreeNode) {
  clipboardNode.value = cloneNode(plugin, node);
  push.success(`已复制${node.kind === "folder" ? "文件夹" : "文件"}：${node.name}`);
}

function uniqueNodeName(plugin: Plugin, parentPath: string, name: string) {
  const siblings = pluginChildNodes(plugin, parentPath);
  const match = /^(.*?)(\.[^.]+)?$/.exec(name);
  const base = match?.[1] || name;
  const extension = match?.[2] || "";
  let candidate = name;
  let index = 1;
  while (siblings.some((child) => child.name === candidate)) {
    candidate = `${base}_副本${index++}${extension}`;
  }
  return candidate;
}

async function pasteClipboardNode(plugin: Plugin, parentPath: string, node: ClipboardNode): Promise<PluginTreeNode | null> {
  if (node.kind === "file") {
    return pluginStore.createFile(plugin.id, parentPath, {
      name: uniqueNodeName(plugin, parentPath, node.name),
      content: structuredClone(node.content),
      order: node.order,
      insertion: node.insertion ? structuredClone(node.insertion) : undefined,
    });
  }
  const folderPath = await pluginStore.createFolder(
    plugin.id,
    parentPath,
    uniqueNodeName(plugin, parentPath, node.name),
  ).then((folder) => folder?.path ?? "");
  if (!folderPath) return null;
  for (const child of node.children ?? []) await pasteClipboardNode(plugin, folderPath, child);
  return findPluginNodeByPath(plugin, folderPath);
}

async function pasteNode(plugin: Plugin, parentPath: string) {
  if (!clipboardNode.value) return;
  const created = await pasteClipboardNode(plugin, parentPath, clipboardNode.value);
  if (!created) return;
  expandFolder(plugin, parentPath);
  push.success(`已粘贴：${created.name}`);
}

async function copyNodePath(row: TreeRow) {
  await navigator.clipboard.writeText(`${row.plugin.id}/${row.path}`.replace(/\/$/, ""));
  push.success("路径已复制");
}

function isFixedConventionRow(row: TreeRow) {
  if (row.root) return true;
  const path = row.path.toLocaleLowerCase();
  return [
    pluginConventions.config,
    pluginConventions.slots,
    pluginConventions.regex,
    pluginConventions.componentsFolder,
    pluginConventions.toolsFolder,
  ].some((item) => path === item.toLocaleLowerCase());
}

function startRename(row: TreeRow) {
  if (renameFocusTimer) clearTimeout(renameFocusTimer);
  renameTarget.value = { pluginId: row.plugin.id, nodeId: row.node!.id };
  renameDraft.value = row.node!.name;
  renamingKey.value = row.key;
  void nextTick(() => {
    renameFocusTimer = setTimeout(() => {
      if (renamingKey.value !== row.key) return;
        const input = document.querySelector<HTMLInputElement>("[data-plugin-rename-input]");
        input?.focus();
        input?.select();
    }, 180);
  });
}

async function confirmRename() {
  if (renameFocusTimer) clearTimeout(renameFocusTimer);
  const target = renameTarget.value;
  const name = renameDraft.value.trim();
  if (!target || !name) return;
  renameTarget.value = null;
  renamingKey.value = "";
  await pluginStore.updateNode(target.pluginId, target.nodeId, { name });
}

function cancelRename() {
  if (renameFocusTimer) clearTimeout(renameFocusTimer);
  renamingKey.value = "";
  renameTarget.value = null;
}

async function removeNode(row: TreeRow) {
  await pluginStore.deleteNode(row.plugin.id, row.node!.id);
  if (selectedKey.value === row.key) selectedKey.value = "";
}

async function dropOnRow(row: TreeRow) {
  const dragging = draggingNode.value;
  if (!dragging || dragging.pluginId !== row.plugin.id) return;
  const targetPath = row.root || row.node?.kind === "folder"
    ? row.node?.path ?? ""
    : pluginParentPath(row.node?.path ?? "");
  await pluginStore.moveNode(
    row.plugin.id,
    dragging.nodeId,
    targetPath,
    !row.root && row.node?.kind === "file" ? row.node.id : undefined,
  );
  draggingNode.value = null;
  expandFolder(row.plugin, targetPath);
}

function insertionLabel(node: PluginTreeNode | null) {
  if (!node || node.kind !== "file" || !node.insertion?.slot) return "";
  return node.insertion.slot;
}

async function importFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (!files.length) return;
  const target = importTarget.value;
  importTarget.value = null;
  const plugin = target ? packagePlugins.value.find((item) => item.id === target.pluginId) : null;
  if (!plugin || !target) return;

  localError.value = "";
  try {
    for (const file of files) {
      const content = await browserFileContent(file);
      const created = await pluginStore.importFile(plugin.id, target.folderPath, file.name, content);
      if (!created) continue;
      expandFolder(plugin, target.folderPath);
      selectedKey.value = keyFor(plugin.id, created.id);
      emit("select", {
        plugin,
        file: created,
        path: created.path,
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
    await pluginStore.initialize();
    const first = packagePlugins.value[0];
    if (!first) return;
    focusedPluginId.value = first.id;
    expandedIds.value = new Set([rootKeyFor(first.id)]);
  } catch (error) {
    localError.value = error instanceof Error ? error.message : "资产数据库初始化失败";
  }
});
const pluginSections = computed(() => [
  { title: selectedPluginLabel.value, rows: treeRows.value },
]);
const treeViewportHeight = computed(() => Math.min(
  448,
  Math.max(80, treeRows.value.length * 32 + pluginSections.value.length * 28 + 16),
));

watch(packagePlugins, (plugins) => {
  const first = plugins[0];
  if (!first) {
    focusedPluginId.value = "";
    expandedIds.value = new Set();
    return;
  }
  if (!plugins.some((item) => item.id === focusedPluginId.value)) {
    focusedPluginId.value = first.id;
    expandedIds.value = new Set([rootKeyFor(first.id)]);
  }
});
onUnmounted(() => {
  if (renameFocusTimer) clearTimeout(renameFocusTimer);
  stopPanelDrag();
});
</script>

<template>
  <aside
    class="asset-tree-panel absolute right-3 top-3 z-40 flex w-[min(724px,calc(100vw-1.5rem))] max-h-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover/95 shadow-xl backdrop-blur-md transition-shadow mobile:right-2 mobile:top-2 mobile:w-[calc(100%-1rem)] mobile:max-h-[calc(100%-1rem)]"
    :style="panelPosition ? { transform: `translate3d(${panelPosition.x}px, ${panelPosition.y}px, 0)` } : undefined"
  >
    <div
      class="flex h-12 shrink-0 select-none items-center justify-between border-b border-border/80 px-3 cursor-grab active:cursor-grabbing"
      @mousedown="startPanelDrag"
    >
      <h2 class="flex items-center gap-1.5 text-base font-medium">
        <GripVertical class="size-4 text-muted-foreground/70" />
        资产 · {{ selectedPluginLabel }}
      </h2>
      <div class="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" class="rounded-full" title="导入文件" aria-label="导入文件" @click.stop="chooseImport">
          <Upload class="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" class="rounded-full hover:bg-destructive/15 hover:text-destructive" title="关闭资产" aria-label="关闭资产" @click.stop="emit('close')">
          <X class="size-4" />
        </Button>
      </div>
      <input ref="importInput" class="hidden" type="file" multiple @change="importFiles" />
    </div>

    <ScrollArea class="min-h-0" :style="{ height: `${treeViewportHeight}px`, maxHeight: 'calc(100dvh - 10rem)' }">
      <div class="space-y-2 p-2">
        <section v-for="section in pluginSections" :key="section.title">
          <h3 class="px-2 pb-1 text-[11px] font-medium text-muted-foreground">{{ section.title }}</h3>
          <div class="space-y-0.5">
            <div
              v-for="row in section.rows"
              :key="row.key"
              class="group flex min-w-0 items-center"
              :draggable="!row.root && !isFixedConventionRow(row)"
              @dragstart="draggingNode = { pluginId: row.plugin.id, nodeId: row.node!.id }"
              @dragend="draggingNode = null"
              @dragover.prevent
              @drop.stop.prevent="dropOnRow(row)"
            >
              <button
                type="button"
                class="flex h-8 min-w-0 items-center gap-1 rounded-md pr-1 text-left text-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :class="[selectedKey === row.key && 'bg-muted text-foreground', renamingKey === row.key ? 'flex-none' : 'flex-1']"
                :style="{ paddingLeft: `${Math.min(row.depth, 7) * 14 + 6}px` }"
                :title="row.path || row.plugin.name"
                @click="activateRow(row)"
              >
                <span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                  <component :is="expandedIds.has(row.key) ? ChevronDown : ChevronRight" v-if="row.root || row.node?.kind === 'folder'" class="size-3.5" />
                </span>
                <img v-if="row.node?.icon" :src="row.node.icon" alt="" class="size-4 shrink-0 rounded-sm object-cover" />
                <component v-else :is="iconFor(row)" class="size-4 shrink-0 text-muted-foreground" />
                <span v-if="renamingKey !== row.key" class="truncate" :class="row.root && 'font-medium'">{{ row.root ? selectedPluginLabel : row.node?.name }}</span>
                <Badge v-if="renamingKey !== row.key && insertionLabel(row.node)" variant="secondary" class="max-w-24 shrink-0 truncate px-1.5 text-[10px] font-normal" :title="insertionLabel(row.node)">{{ insertionLabel(row.node) }}</Badge>
              </button>
              <Input
                v-if="renamingKey === row.key"
                v-model="renameDraft"
                data-plugin-rename-input
                class="h-7 min-w-0 flex-1 px-2 text-xs"
                @click.stop
                @keydown.enter.prevent="confirmRename"
                @keydown.esc.prevent="cancelRename"
                @blur="confirmRename"
              />
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon-sm" class="mr-0.5 size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 mobile:opacity-100" title="资源菜单" @click.stop>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" class="w-44">
                  <template v-if="row.root || row.node?.kind === 'folder'">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger><FilePlus2 data-icon="inline-start" />新建文件</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent class="w-48">
                        <DropdownMenuItem v-for="fileType in newFileTypes" :key="fileType.id" @click="createFile(row.plugin, folderPathOf(row), fileType.id)">
                          <span class="min-w-0 flex-1">{{ fileType.label }}</span>
                          <span class="font-mono text-[10px] text-muted-foreground">{{ fileType.extension }}</span>
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuItem @click="createFolder(row.plugin, folderPathOf(row))"><FolderPlus data-icon="inline-start" />新建文件夹</DropdownMenuItem>
                    <DropdownMenuItem @click="chooseImport(row.plugin, folderPathOf(row))"><FileDown data-icon="inline-start" />导入文件</DropdownMenuItem>
                    <DropdownMenuItem v-if="clipboardNode" @click="pasteNode(row.plugin, folderPathOf(row))"><ClipboardPaste data-icon="inline-start" />粘贴至此</DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </template>
                  <DropdownMenuItem @click="copyNodePath(row)"><Copy data-icon="inline-start" />复制路径</DropdownMenuItem>
                  <DropdownMenuItem v-if="!row.root" @click="copyNode(row.plugin, row.node!)"><CopyPlus data-icon="inline-start" />复制此项</DropdownMenuItem>
                  <template v-if="!isFixedConventionRow(row)">
                    <DropdownMenuSeparator />
                    <DropdownMenuItem @click="startRename(row)"><PenSquare data-icon="inline-start" />重命名</DropdownMenuItem>
                    <DropdownMenuItem class="text-destructive focus:text-destructive" @click="removeNode(row)"><Trash2 data-icon="inline-start" />删除</DropdownMenuItem>
                  </template>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p v-if="section.rows.length === 0" class="px-2 py-2 text-xs text-muted-foreground">暂无插件</p>
          </div>
        </section>

        <p v-if="pluginStore.loaded && treeRows.length === 0" class="px-2 py-10 text-center text-sm text-muted-foreground">暂无资产</p>
        <p v-if="pluginStore.loadError || localError" class="px-2 py-3 text-xs leading-5 text-destructive">
          {{ localError || pluginStore.loadError }}
        </p>
      </div>
    </ScrollArea>

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
