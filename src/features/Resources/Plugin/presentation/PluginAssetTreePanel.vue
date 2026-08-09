<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  Braces,
  ClipboardPaste,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  CopyPlus,
  Crown,
  FileDown,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Image,
  MoreHorizontal,
  Package,
  PenSquare,
  Power,
  Trash2,
  Upload,
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
import { usePluginStore } from "../application/plugin-store";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { createPluginMediaContent } from "../domain/plugin-media";
import {
  pluginFileType,
  findPluginTreeNode,
  findPluginTreeParent,
  pluginConventions,
  pluginNodePath,
  sortPluginTreeNodes,
  type Plugin,
  type PluginFile,
  type PluginFolder,
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
const importTarget = ref<{ pluginId: string; folderId: string } | null>(null);
const clipboardNode = ref<ClipboardNode | null>(null);
const renameTarget = ref<{ pluginId: string; nodeId: string } | null>(null);
const renameDraft = ref("");
const renamingKey = ref("");
const draggingNode = ref<{ pluginId: string; nodeId: string } | null>(null);

const internalPlugins = computed(() => pluginStore.sortedPlugins.filter(
  (plugin) => plugin.packageId === conversation.activePackageId,
));
const globalPlugins = computed(() => pluginStore.globalPlugins);
const packagePlugins = computed(() => [...internalPlugins.value, ...globalPlugins.value]);

function pluginIsActive(plugin: Plugin) {
  if (plugin.id === conversation.activePackage?.mainPluginId) return true;
  if (plugin.packageId !== null) return plugin.enabled;
  return plugin.enabled && (conversation.activePackage?.enabledGlobalPluginIds.includes(plugin.id) ?? false);
}

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

async function togglePlugin(plugin: Plugin) {
  if (plugin.id === conversation.activePackage?.mainPluginId) return;
  if (plugin.packageId !== null) {
    await pluginStore.updatePlugin(plugin.id, { enabled: !plugin.enabled });
    return;
  }
  const item = conversation.activePackage;
  if (!item) return;
  const enabled = new Set(item.enabledGlobalPluginIds);
  if (pluginIsActive(plugin)) {
    enabled.delete(plugin.id);
  } else {
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
    expandedIds.value = new Set([...expandedIds.value, keyFor(plugin.id, plugin.root.id)]);
  } catch (error) {
    localError.value = error instanceof Error ? error.message : "无法设为主要插件";
  }
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

function expandFolder(plugin: Plugin, folder: PluginFolder) {
  expandedIds.value = new Set([...expandedIds.value, keyFor(plugin.id, folder.id)]);
}

function chooseImport(plugin?: Plugin, folder?: PluginFolder) {
  const targetPlugin = plugin
    ?? packagePlugins.value.find((item) => item.id === focusedPluginId.value && pluginIsActive(item))
    ?? packagePlugins.value.find(pluginIsActive);
  if (!targetPlugin) return;
  importTarget.value = { pluginId: targetPlugin.id, folderId: folder?.id ?? targetPlugin.root.id };
  importInput.value?.click();
}

function newFileTemplate(type: NewPluginFileType) {
  if (type === "agents") return { name: "AGENTS.md", content: "# Plugin Instructions\n\n" };
  if (type === "data") return {
    name: "untitled.data.json",
    content: { version: 1, isolation: "resource", description: "", initialValue: {}, enableUpdater: false, wrapperSource: "" },
  };
  if (type === "chat") return { name: "untitled.chat.json", content: { message: [] } };
  if (type === "javascript") return { name: "untitled.js", content: "" };
  if (type === "json") return { name: "untitled.json", content: {} };
  if (type === "media") return { name: "untitled.png", content: createPluginMediaContent("") };
  if (type === "component") return { name: "untitled.vue", content: "<template>\n  <div />\n</template>\n" };
  if (type === "text") return { name: "untitled.txt", content: "" };
  return { name: "untitled.md", content: "" };
}

async function createFile(plugin: Plugin, folder: PluginFolder, type: NewPluginFileType) {
  const file = await pluginStore.createFile(plugin.id, folder.id, newFileTemplate(type));
  if (!file) return;
  expandFolder(plugin, folder);
  selectedKey.value = keyFor(plugin.id, file.id);
}

async function createFolder(plugin: Plugin, parent: PluginFolder) {
  const folder = await pluginStore.createFolder(plugin.id, parent.id, uniqueNodeName(plugin, parent.id, "新文件夹"));
  if (!folder) return;
  expandFolder(plugin, parent);
}

function cloneNode(node: PluginTreeNode): ClipboardNode {
  if (node.kind === "file") {
    return {
      name: node.name,
      kind: "file",
      content: structuredClone(node.content),
      order: node.order,
      insertion: node.insertion ? structuredClone(node.insertion) : undefined,
    };
  }
  return { name: node.name, kind: "folder", children: node.children.map(cloneNode) };
}

function copyNode(node: PluginTreeNode) {
  clipboardNode.value = cloneNode(node);
  push.success(`已复制${node.kind === "folder" ? "文件夹" : "文件"}：${node.name}`);
}

function uniqueNodeName(plugin: Plugin, parentId: string, name: string) {
  const parent = findPluginTreeNode(plugin.root, parentId);
  if (parent?.kind !== "folder") return name;
  const match = /^(.*?)(\.[^.]+)?$/.exec(name);
  const base = match?.[1] || name;
  const extension = match?.[2] || "";
  let candidate = name;
  let index = 1;
  while (parent.children.some((child) => child.name === candidate)) {
    candidate = `${base}_副本${index++}${extension}`;
  }
  return candidate;
}

async function pasteClipboardNode(plugin: Plugin, parent: PluginFolder, node: ClipboardNode): Promise<PluginTreeNode | null> {
  if (node.kind === "file") {
    return pluginStore.createFile(plugin.id, parent.id, {
      name: uniqueNodeName(plugin, parent.id, node.name),
      content: structuredClone(node.content),
      order: node.order,
      insertion: node.insertion ? structuredClone(node.insertion) : undefined,
    });
  }
  const folder = await pluginStore.createFolder(plugin.id, parent.id, uniqueNodeName(plugin, parent.id, node.name));
  if (!folder) return null;
  for (const child of node.children ?? []) await pasteClipboardNode(plugin, folder, child);
  return folder;
}

async function pasteNode(plugin: Plugin, parent: PluginFolder) {
  if (!clipboardNode.value) return;
  const created = await pasteClipboardNode(plugin, parent, clipboardNode.value);
  if (!created) return;
  expandFolder(plugin, parent);
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
    pluginConventions.manifest,
    pluginConventions.containers,
    pluginConventions.regex,
    pluginConventions.componentsFolder,
    pluginConventions.toolsFolder,
  ].some((item) => path === item.toLocaleLowerCase());
}

function startRename(row: TreeRow) {
  renameTarget.value = { pluginId: row.plugin.id, nodeId: row.node.id };
  renameDraft.value = row.node.name;
  renamingKey.value = row.key;
}

async function confirmRename() {
  const target = renameTarget.value;
  const name = renameDraft.value.trim();
  if (!target || !name) return;
  renameTarget.value = null;
  renamingKey.value = "";
  await pluginStore.updateNode(target.pluginId, target.nodeId, { name });
}

function cancelRename() {
  renamingKey.value = "";
  renameTarget.value = null;
}

async function removeNode(row: TreeRow) {
  await pluginStore.deleteNode(row.plugin.id, row.node.id);
  if (selectedKey.value === row.key) selectedKey.value = "";
}

async function dropOnRow(row: TreeRow) {
  const dragging = draggingNode.value;
  if (!dragging || dragging.pluginId !== row.plugin.id) return;
  const target = row.node.kind === "folder"
    ? row.node
    : findPluginTreeParent(row.plugin.root, row.node.id);
  if (!target) return;
  await pluginStore.moveNode(row.plugin.id, dragging.nodeId, target.id, row.node.kind === "file" ? row.node.id : undefined);
  draggingNode.value = null;
  expandFolder(row.plugin, target);
}

function insertionLabel(node: PluginTreeNode) {
  if (node.kind !== "file" || !node.insertion?.target) return "";
  return /^container:(?:local|global)\/(.+)$/.exec(node.insertion.target)?.[1]
    ?? node.insertion.target;
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
      const created = await pluginStore.importFile(plugin.id, target.folderId, file.name, content);
      if (!created) continue;
      const folder = findPluginTreeNode(plugin.root, target.folderId);
      if (folder?.kind === "folder") expandFolder(plugin, folder);
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
const internalRows = computed(() => treeRows.value.filter((row) => row.plugin.packageId !== null));
const globalRows = computed(() => treeRows.value.filter((row) => row.plugin.packageId === null));
const pluginSections = computed(() => [
  { title: "内置插件", rows: internalRows.value },
  { title: "全局插件", rows: globalRows.value },
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
    expandedIds.value = new Set([keyFor(first.id, first.root.id)]);
  }
});
</script>

<template>
  <aside class="asset-tree-panel absolute right-3 top-3 z-40 flex max-h-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover shadow-sm mobile:right-2 mobile:top-2 mobile:max-h-[calc(100%-1rem)]">
    <div class="flex h-12 shrink-0 items-center justify-between border-b border-border/80 px-3">
      <h2 class="text-base font-medium">资产</h2>
      <Button variant="ghost" size="icon-sm" class="rounded-full" title="导入文件" aria-label="导入文件" @click="chooseImport">
        <Upload class="size-4" />
      </Button>
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
              @dragstart="draggingNode = { pluginId: row.plugin.id, nodeId: row.node.id }"
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
                  <component :is="expandedIds.has(row.key) ? ChevronDown : ChevronRight" v-if="row.node.kind === 'folder'" class="size-3.5" />
                </span>
                <img v-if="row.node.icon" :src="row.node.icon" alt="" class="size-4 shrink-0 rounded-sm object-cover" />
                <component v-else :is="iconFor(row)" class="size-4 shrink-0 text-muted-foreground" />
                <span v-if="renamingKey !== row.key" class="truncate" :class="row.root && 'font-medium'">{{ row.root ? row.plugin.name : row.node.name }}</span>
                <Badge v-if="renamingKey !== row.key && insertionLabel(row.node)" variant="secondary" class="max-w-24 shrink-0 truncate px-1.5 text-[10px] font-normal" :title="insertionLabel(row.node)">{{ insertionLabel(row.node) }}</Badge>
              </button>
              <Input
                v-if="renamingKey === row.key"
                v-model="renameDraft"
                autofocus
                class="h-7 min-w-0 flex-1 px-2 text-xs"
                @click.stop
                @keydown.enter.prevent="confirmRename"
                @keydown.esc.prevent="cancelRename"
                @blur="confirmRename"
              />
              <Crown v-if="row.root && conversation.activePackage?.mainPluginId === row.plugin.id" class="size-4 shrink-0 fill-current text-amber-500" title="主要插件" />
              <Button
                v-if="row.root"
                variant="ghost"
                size="icon-sm"
                class="size-7 shrink-0"
                :class="pluginIsActive(row.plugin) ? 'text-emerald-500' : 'text-muted-foreground/45'"
                :disabled="row.plugin.id === conversation.activePackage?.mainPluginId"
                :title="row.plugin.id === conversation.activePackage?.mainPluginId ? '主插件保持启用' : pluginIsActive(row.plugin) ? '关闭插件' : '启用插件'"
                @click.stop="togglePlugin(row.plugin)"
              >
                <Power />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon-sm" class="mr-0.5 size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 mobile:opacity-100" title="资源菜单" @click.stop>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" class="w-44">
                  <DropdownMenuItem v-if="row.root && conversation.activePackage?.mainPluginId !== row.plugin.id" @click="setMainPlugin(row.plugin)">
                    <Crown data-icon="inline-start" />设为主要插件
                  </DropdownMenuItem>
                  <DropdownMenuSeparator v-if="row.root && conversation.activePackage?.mainPluginId !== row.plugin.id" />
                  <template v-if="row.node.kind === 'folder'">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger><FilePlus2 data-icon="inline-start" />新建文件</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent class="w-48">
                        <DropdownMenuItem v-for="fileType in newFileTypes" :key="fileType.id" @click="createFile(row.plugin, row.node, fileType.id)">
                          <span class="min-w-0 flex-1">{{ fileType.label }}</span>
                          <span class="font-mono text-[10px] text-muted-foreground">{{ fileType.extension }}</span>
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuItem @click="createFolder(row.plugin, row.node)"><FolderPlus data-icon="inline-start" />新建文件夹</DropdownMenuItem>
                    <DropdownMenuItem @click="chooseImport(row.plugin, row.node)"><FileDown data-icon="inline-start" />导入文件</DropdownMenuItem>
                    <DropdownMenuItem v-if="clipboardNode" @click="pasteNode(row.plugin, row.node)"><ClipboardPaste data-icon="inline-start" />粘贴至此</DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </template>
                  <DropdownMenuItem @click="copyNodePath(row)"><Copy data-icon="inline-start" />复制路径</DropdownMenuItem>
                  <DropdownMenuItem v-if="!row.root" @click="copyNode(row.node)"><CopyPlus data-icon="inline-start" />复制此项</DropdownMenuItem>
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
