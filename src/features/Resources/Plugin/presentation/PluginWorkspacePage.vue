<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { readFile } from "@tauri-apps/plugin-fs";
import { push } from "notivue";
import {
  ArrowLeft,
  Braces,
  ChevronDown,
  ChevronRight,
  Code2,
  File,
  FileDown,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Image,
  MoreHorizontal,
  Search,
  Star,
  Trash2,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
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
import { useResponsiveStore } from "@/features/Misc/application/responsive-store";
import ConversationComposerEditor from "@/features/Resources/Conversation/presentation/ConversationComposerEditor.vue";
import ConversationMarkdown from "@/features/Resources/Conversation/presentation/ConversationMarkdown.vue";
import JavaScriptCodeMirrorEditor from "@/features/Resources/Preset/presentation/JavaScriptCodeMirrorEditor.vue";
import InteractiveDocumentWorkspacePage from "@/features/Resources/InteractiveDoc/presentation/InteractiveDocumentWorkspacePage.vue";
import type { InteractiveDocumentData } from "@/features/Resources/InteractiveDoc/domain/interactive-document";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import {
  findPluginNodeByPath,
  findPluginTreeNode,
  findPluginTreeParent,
  pluginConventions,
  pluginFileType,
  pluginNodePath,
  sortPluginTreeNodes,
  type PluginFolder,
  type PluginTreeNode,
} from "@/features/Resources/Plugin/domain/plugin-types";
import {
  createPluginMediaContent,
  pluginMediaSource,
  pluginMediaType,
} from "@/features/Resources/Plugin/domain/plugin-media";
import PluginResourceInjectionMenu from "./PluginResourceInjectionMenu.vue";

interface TreeRow {
  node: PluginTreeNode;
  parentId: string;
  depth: number;
}

type NewPluginFileType =
  | "agents"
  | "markdown"
  | "interactive-document"
  | "javascript"
  | "json"
  | "media"
  | "component"
  | "text";

const newFileTypes: Array<{
  id: NewPluginFileType;
  label: string;
  extension: string;
}> = [
  { id: "agents", label: "AGENTS.md", extension: ".md" },
  { id: "markdown", label: "Markdown", extension: ".md" },
  { id: "interactive-document", label: "交互式文档", extension: ".imd" },
  { id: "javascript", label: "JavaScript", extension: ".js" },
  { id: "json", label: "JSON", extension: ".json" },
  { id: "media", label: "媒体", extension: ".png" },
  { id: "component", label: "组件", extension: ".vue" },
  { id: "text", label: "纯文本", extension: ".txt" },
];

const props = defineProps<{
  resourceId: string;
  packageId?: string;
}>();

const pluginStore = usePluginStore();
const responsive = useResponsiveStore();
const { isMobileLayout } = storeToRefs(responsive);
const search = ref("");
const selectedNodeId = ref("");
const treeVisibleOnMobile = ref(true);
const showProperties = ref(false);
const contentDraft = ref("");
const contentError = ref("");
const importInput = ref<HTMLInputElement | null>(null);
const importTargetFolderId = ref("");
const draggingNodeId = ref("");
const externalFileDragActive = ref(false);
let contentSaveTimer: ReturnType<typeof setTimeout> | null = null;
let unlistenNativeFileDrop: (() => void) | null = null;

const plugin = computed(
  () => pluginStore.plugins.find((item) => item.id === props.resourceId) ?? null,
);
const selectedNode = computed(() =>
  plugin.value
    ? findPluginTreeNode(plugin.value.root, selectedNodeId.value)
    : null,
);
const selectedFile = computed(() =>
  selectedNode.value?.kind === "file" ? selectedNode.value : null,
);
const selectedType = computed(() =>
  selectedFile.value ? pluginFileType(selectedFile.value.name) : null,
);
const selectedPath = computed(() =>
  plugin.value && selectedNode.value
    ? pluginNodePath(plugin.value.root, selectedNode.value.id).join("/")
    : "",
);
const activeParentFolder = computed(() => {
  if (!plugin.value) return null;
  return selectedNode.value
    ? findPluginTreeParent(plugin.value.root, selectedNode.value.id)
    : plugin.value.root;
});
const treeRows = computed(() => {
  if (!plugin.value) return [];
  const keyword = search.value.trim().toLocaleLowerCase();
  return flattenTree(plugin.value.root, 0, keyword);
});
const formattedReadOnlyContent = computed(() => {
  const content = selectedFile.value?.content;
  if (typeof content === "string") return content;
  return content == null ? "" : JSON.stringify(content, null, 2);
});
const mediaSource = computed(() => pluginMediaSource(selectedFile.value?.content));
const mediaKind = computed(() =>
  pluginMediaType(selectedFile.value?.content, mediaSource.value),
);

onMounted(async () => {
  await pluginStore.initialize();
  pluginStore.openPlugin(props.resourceId);
  selectDefaultNode();
  try {
    unlistenNativeFileDrop = await getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "over") {
        externalFileDragActive.value = true;
        return;
      }
      externalFileDragActive.value = false;
      if (event.payload.type === "drop") {
        void importNativePaths(event.payload.paths);
      }
    });
  } catch {
    // Browser File drag-and-drop remains available when the native listener fails.
  }
});

onBeforeUnmount(() => {
  if (contentSaveTimer) clearTimeout(contentSaveTimer);
  unlistenNativeFileDrop?.();
});

watch(
  () => props.resourceId,
  (resourceId) => {
    pluginStore.openPlugin(resourceId);
    selectDefaultNode();
  },
);

watch(
  () => selectedFile.value?.id,
  loadContentDraft,
  { immediate: true },
);

watch(
  () => selectedFile.value?.content,
  () => {
    if (!contentSaveTimer) loadContentDraft();
  },
  { deep: true },
);

function selectDefaultNode() {
  const current = plugin.value;
  if (!current) return;
  const info = findPluginNodeByPath(current.root, pluginConventions.info);
  selectedNodeId.value = info?.id ?? current.root.children[0]?.id ?? current.root.id;
  treeVisibleOnMobile.value = false;
}

function flattenTree(
  folder: PluginFolder,
  depth: number,
  keyword: string,
): TreeRow[] {
  const rows: TreeRow[] = [];
  for (const child of sortPluginTreeNodes(folder.children)) {
    if (keyword && !nodeMatches(child, keyword)) continue;
    rows.push({ node: child, parentId: folder.id, depth });
    if (
      child.kind === "folder"
      && (!child.collapsed || keyword)
    ) {
      rows.push(...flattenTree(child, depth + 1, keyword));
    }
  }
  return rows;
}

function nodeMatches(node: PluginTreeNode, keyword: string): boolean {
  if (node.name.toLocaleLowerCase().includes(keyword)) return true;
  return node.kind === "folder"
    && node.children.some((child) => nodeMatches(child, keyword));
}

function selectNode(node: PluginTreeNode) {
  if (node.kind === "folder") {
    void pluginStore.updateNode(plugin.value!.id, node.id, {
      collapsed: !node.collapsed,
    });
    return;
  }
  selectedNodeId.value = node.id;
  showProperties.value = false;
  if (isMobileLayout.value) treeVisibleOnMobile.value = false;
}

function loadContentDraft() {
  if (contentSaveTimer) {
    clearTimeout(contentSaveTimer);
    contentSaveTimer = null;
  }
  contentError.value = "";
  const file = selectedFile.value;
  if (!file) {
    contentDraft.value = "";
    return;
  }
  contentDraft.value = typeof file.content === "string"
    ? file.content
    : JSON.stringify(file.content, null, 2);
}

function scheduleContentSave(value: string) {
  contentDraft.value = value;
  contentError.value = "";
  if (contentSaveTimer) clearTimeout(contentSaveTimer);
  contentSaveTimer = setTimeout(() => {
    contentSaveTimer = null;
    void persistContent();
  }, 500);
}

function scheduleInteractiveDocumentSave(value: InteractiveDocumentData) {
  scheduleContentSave(JSON.stringify(value, null, 2));
}

async function persistContent() {
  const currentPlugin = plugin.value;
  const file = selectedFile.value;
  if (!currentPlugin || !file || currentPlugin.builtIn) return;
  let content: unknown = contentDraft.value;
  if (
    selectedType.value === "json"
    || selectedType.value === "interactive-document"
  ) {
    try {
      content = JSON.parse(contentDraft.value || "null");
    } catch {
      contentError.value = "JSON 语法有误，尚未保存";
      return;
    }
  }
  await pluginStore.updateNode(currentPlugin.id, file.id, { content });
}

async function persistPluginBasics() {
  const current = plugin.value;
  if (!current || current.builtIn) return;
  await pluginStore.updatePlugin(current.id, {
    name: current.name.trim() || "未命名插件",
    icon: current.icon,
    shortDescription: current.shortDescription,
  });
}

async function persistNodeName() {
  const current = plugin.value;
  const node = selectedNode.value;
  if (!current || !node || current.builtIn) return;
  await pluginStore.updateNode(current.id, node.id, { name: node.name });
  loadContentDraft();
}

async function persistNodeIcon() {
  const current = plugin.value;
  const node = selectedNode.value;
  if (!current || !node || current.builtIn) return;
  await pluginStore.updateNode(current.id, node.id, { icon: node.icon });
}

async function createFile(
  type: NewPluginFileType,
  parent = activeParentFolder.value,
) {
  if (!plugin.value || !parent) return;
  const template = newFileTemplate(type);
  const file = await pluginStore.createFile(plugin.value.id, parent.id, template);
  if (file) {
    selectedNodeId.value = file.id;
    if (isMobileLayout.value) treeVisibleOnMobile.value = false;
  }
}

function newFileTemplate(type: NewPluginFileType) {
  if (type === "agents") {
    return {
      name: "AGENTS.md",
      content: "# Plugin Instructions\n\n",
    };
  }
  if (type === "interactive-document") {
    return {
      name: "untitled.imd",
      content: {
        id: crypto.randomUUID(),
        name: "新交互式文档",
        description: "",
        blocks: [],
      },
    };
  }
  if (type === "javascript") {
    return { name: "untitled.js", content: "" };
  }
  if (type === "json") {
    return { name: "untitled.json", content: {} };
  }
  if (type === "media") {
    return {
      name: "untitled.png",
      content: createPluginMediaContent(""),
    };
  }
  if (type === "component") {
    return {
      name: "untitled.vue",
      content: "<template>\n  <div />\n</template>\n",
    };
  }
  if (type === "text") {
    return { name: "untitled.txt", content: "" };
  }
  return { name: "untitled.md", content: "" };
}

async function createFolder(parent = activeParentFolder.value) {
  if (!plugin.value || !parent) return;
  await pluginStore.createFolder(plugin.value.id, parent.id);
}

function chooseImport(parent = activeParentFolder.value) {
  if (!parent) return;
  importTargetFolderId.value = parent.id;
  importInput.value?.click();
}

async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !plugin.value || !importTargetFolderId.value) return;
  const content = await browserFileContent(file);
  const created = await pluginStore.importFile(
    plugin.value.id,
    importTargetFolderId.value,
    file.name,
    content,
  );
  if (created) {
    selectedNodeId.value = created.id;
    if (isMobileLayout.value) treeVisibleOnMobile.value = false;
  }
}

async function handleBrowserFileDrop(event: DragEvent) {
  externalFileDragActive.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (!files.length || !plugin.value || plugin.value.builtIn) return;
  const parent = activeParentFolder.value ?? plugin.value.root;
  for (const file of files) {
    const created = await pluginStore.importFile(
      plugin.value.id,
      parent.id,
      file.name,
      await browserFileContent(file),
    );
    if (created) selectedNodeId.value = created.id;
  }
}

function handleBrowserDragOver(event: DragEvent) {
  if (
    !draggingNodeId.value
    && Array.from(event.dataTransfer?.types ?? []).includes("Files")
  ) {
    externalFileDragActive.value = true;
  }
}

function handleBrowserDragLeave(event: DragEvent) {
  const current = event.currentTarget as HTMLElement;
  const related = event.relatedTarget;
  if (!(related instanceof Node) || !current.contains(related)) {
    externalFileDragActive.value = false;
  }
}

async function importNativePaths(paths: string[]) {
  if (!paths.length || !plugin.value || plugin.value.builtIn) return;
  const parent = activeParentFolder.value ?? plugin.value.root;
  let imported = 0;
  for (const path of paths) {
    try {
      const name = path.split(/[\\/]/).filter(Boolean).pop() ?? "untitled.txt";
      const bytes = await readFile(path);
      const created = await pluginStore.importFile(
        plugin.value.id,
        parent.id,
        name,
        nativeFileContent(name, bytes),
      );
      if (created) {
        imported += 1;
        selectedNodeId.value = created.id;
      }
    } catch {
      // Tauri may reject paths outside the configured fs scope.
    }
  }
  if (!imported) {
    push.warning("未能读取拖入文件；可使用文件树顶部的导入按钮。");
  }
}

async function browserFileContent(file: globalThis.File) {
  if (pluginFileType(file.name) === "media") {
    return createPluginMediaContent(await readFileAsDataUrl(file));
  }
  return parseStructuredFileContent(file.name, await file.text());
}

function nativeFileContent(name: string, bytes: Uint8Array) {
  if (pluginFileType(name) === "media") {
    return createPluginMediaContent(bytesToDataUrl(bytes, mediaMimeType(name)));
  }
  return parseStructuredFileContent(name, new TextDecoder().decode(bytes));
}

function parseStructuredFileContent(name: string, source: string) {
  const type = pluginFileType(name);
  if (type !== "json" && type !== "interactive-document") return source;
  try {
    return JSON.parse(source) as unknown;
  } catch {
    return source;
  }
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function mediaMimeType(name: string) {
  const extension = name.split(".").pop()?.toLocaleLowerCase();
  const types: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    ogg: "video/ogg",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
  };
  return types[extension ?? ""] ?? "application/octet-stream";
}

function readFileAsDataUrl(file: globalThis.File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function updateMediaSource(value: string) {
  contentDraft.value = value;
  if (!plugin.value || !selectedFile.value || plugin.value.builtIn) return;
  await pluginStore.updateNode(plugin.value.id, selectedFile.value.id, {
    content: createPluginMediaContent(value.trim()),
  });
}

async function removeSelectedNode() {
  const current = plugin.value;
  const node = selectedNode.value;
  if (!current || !node || current.builtIn || node.id === current.root.id) return;
  await pluginStore.deleteNode(current.id, node.id);
  selectDefaultNode();
}

async function removeNode(nodeId: string) {
  const current = plugin.value;
  if (!current || current.builtIn || nodeId === current.root.id) return;
  await pluginStore.deleteNode(current.id, nodeId);
  if (selectedNodeId.value === nodeId) selectDefaultNode();
}

async function dropOnRow(row: TreeRow) {
  if (!plugin.value || !draggingNodeId.value) return;
  const targetFolderId = row.node.kind === "folder"
    ? row.node.id
    : row.parentId;
  await pluginStore.moveNode(
    plugin.value.id,
    draggingNodeId.value,
    targetFolderId,
    row.node.kind === "file" ? row.node.id : undefined,
  );
  draggingNodeId.value = "";
}

function nodeIcon(node: PluginTreeNode) {
  if (node.kind === "folder") return node.collapsed ? Folder : FolderOpen;
  switch (pluginFileType(node.name)) {
    case "markdown":
      return FileText;
    case "interactive-document":
    case "json":
      return Braces;
    case "javascript":
    case "component":
      return Code2;
    case "media":
      return Image;
    default:
      return File;
  }
}

function isInteractiveDocumentContent(
  value: unknown,
): value is InteractiveDocumentData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<InteractiveDocumentData>;
  return (
    typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && Array.isArray(candidate.blocks)
  );
}
</script>

<template>
  <div
    v-if="plugin"
    class="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
    @dragover.prevent="handleBrowserDragOver"
    @dragleave="handleBrowserDragLeave"
    @drop.prevent="handleBrowserFileDrop"
  >
    <header class="flex min-h-16 items-center gap-3 border-b px-5 mobile:min-h-14 mobile:px-3">
      <img
        v-if="plugin.icon"
        :src="plugin.icon"
        alt=""
        class="size-9 rounded-md object-cover"
      />
      <div class="min-w-0 flex-1">
        <input
          v-model="plugin.name"
          :disabled="plugin.builtIn"
          class="block h-6 w-full bg-transparent p-0 text-base font-semibold outline-none disabled:cursor-default"
          placeholder="插件名称"
          @change="persistPluginBasics"
        />
        <input
          v-model="plugin.shortDescription"
          :disabled="plugin.builtIn"
          class="block h-5 w-full bg-transparent p-0 text-xs text-muted-foreground outline-none disabled:cursor-default"
          placeholder=""
          @change="persistPluginBasics"
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button size="icon" variant="ghost" class="size-8" title="插件菜单">
            <MoreHorizontal class="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-40">
          <DropdownMenuItem
            :disabled="plugin.packageId === null || plugin.builtIn"
            @click="pluginStore.updatePlugin(plugin.id, { main: !plugin.main })"
          >
            <Star class="mr-2 size-4" />
            {{ plugin.main ? "取消主要" : "设为主要" }}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            :disabled="plugin.builtIn"
            class="text-destructive focus:text-destructive"
            @click="pluginStore.deletePlugin(plugin.id)"
          >
            <Trash2 class="mr-2 size-4" />
            删除插件
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>

    <div class="grid min-h-0 flex-1 grid-cols-[17rem_minmax(0,1fr)] mobile:block">
      <aside
        v-show="!isMobileLayout || treeVisibleOnMobile"
        class="flex min-h-0 flex-col border-r mobile:h-full mobile:border-r-0"
      >
        <div class="flex h-12 items-center gap-1.5 border-b px-2">
          <div class="relative min-w-0 flex-1">
            <Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              v-model="search"
              class="h-8 w-full bg-transparent pl-8 pr-2 text-sm outline-none placeholder:text-muted-foreground focus:bg-muted/40"
              placeholder="搜索文件"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                size="icon"
                variant="ghost"
                class="size-8"
                title="新建文件"
                :disabled="plugin.builtIn"
              >
                <FilePlus2 class="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" class="w-48">
              <DropdownMenuItem
                v-for="fileType in newFileTypes"
                :key="fileType.id"
                @click="createFile(fileType.id)"
              >
                <span class="min-w-0 flex-1">{{ fileType.label }}</span>
                <span class="font-mono text-[11px] text-muted-foreground">
                  {{ fileType.extension }}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="icon"
            variant="ghost"
            class="size-8"
            title="新建文件夹"
            :disabled="plugin.builtIn"
            @click="createFolder()"
          >
            <FolderPlus class="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            class="size-8"
            title="导入文件"
            :disabled="plugin.builtIn"
            @click="chooseImport()"
          >
            <FileDown class="size-4" />
          </Button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
          <div
            v-for="row in treeRows"
            :key="row.node.id"
            :draggable="!plugin.builtIn"
            class="group relative mb-0.5 flex h-8 items-center rounded-md transition-colors hover:bg-accent/55"
            :class="[
              selectedNodeId === row.node.id && 'bg-accent text-accent-foreground',
              draggingNodeId === row.node.id && 'opacity-45',
            ]"
            @dragstart="draggingNodeId = row.node.id"
            @dragend="draggingNodeId = ''"
            @dragover.prevent
            @drop.stop.prevent="dropOnRow(row)"
          >
            <button
              type="button"
              class="flex h-full min-w-0 flex-1 items-center gap-1.5 pr-1 text-left"
              :style="{ paddingLeft: `${row.depth * 16 + 6}px` }"
              @click="selectNode(row.node)"
            >
              <span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                <ChevronRight
                  v-if="row.node.kind === 'folder' && row.node.collapsed"
                  class="size-3.5"
                />
                <ChevronDown
                  v-else-if="row.node.kind === 'folder'"
                  class="size-3.5"
                />
              </span>
              <img
                v-if="row.node.icon"
                :src="row.node.icon"
                alt=""
                class="size-4 shrink-0 rounded-sm object-cover"
              />
              <component
                :is="nodeIcon(row.node)"
                v-else
                class="size-4 shrink-0 text-muted-foreground"
              />
              <span class="min-w-0 flex-1 truncate text-[13px]">
                {{ row.node.name }}
              </span>
              <span
                v-if="row.node.inserted"
                class="size-1.5 shrink-0 rounded-full bg-emerald-500"
                title="已注入"
              />
            </button>

            <div
              class="mobile-touch-actions opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
              @click.stop
            >
              <PluginResourceInjectionMenu
                :key="`tree-injection:${row.node.id}`"
                :plugin-id="plugin.id"
                :node="row.node"
                :disabled="plugin.builtIn"
              />
            </div>

            <DropdownMenu v-if="!plugin.builtIn">
              <DropdownMenuTrigger as-child>
                <Button
                  size="icon"
                  variant="ghost"
                  class="mobile-touch-actions mr-0.5 size-7 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  title="文件菜单"
                  @click.stop
                >
                  <MoreHorizontal class="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" class="w-40">
                <template v-if="row.node.kind === 'folder'">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FilePlus2 class="mr-2 size-4" />
                      新建文件
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent class="w-48">
                      <DropdownMenuItem
                        v-for="fileType in newFileTypes"
                        :key="fileType.id"
                        @click="createFile(fileType.id, row.node)"
                      >
                        <span class="min-w-0 flex-1">{{ fileType.label }}</span>
                        <span class="font-mono text-[11px] text-muted-foreground">
                          {{ fileType.extension }}
                        </span>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem @click="createFolder(row.node)">
                    <FolderPlus class="mr-2 size-4" />
                    新建文件夹
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="chooseImport(row.node)">
                    <FileDown class="mr-2 size-4" />
                    导入文件
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </template>
                <DropdownMenuItem
                  class="text-destructive focus:text-destructive"
                  @click="removeNode(row.node.id)"
                >
                  <Trash2 class="mr-2 size-4" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <p v-if="treeRows.length === 0" class="px-3 py-8 text-center text-xs text-muted-foreground">
            没有匹配的文件
          </p>
        </div>
      </aside>

      <main
        v-show="!isMobileLayout || !treeVisibleOnMobile"
        class="flex min-h-0 min-w-0 flex-col mobile:h-full"
      >
        <div v-if="selectedFile" class="flex min-h-12 items-center gap-2 border-b px-3">
          <Button
            v-if="isMobileLayout"
            size="icon"
            variant="ghost"
            class="size-8"
            title="返回文件树"
            @click="treeVisibleOnMobile = true"
          >
            <ArrowLeft class="size-4" />
          </Button>
          <img
            v-if="selectedFile.icon"
            :src="selectedFile.icon"
            alt=""
            class="size-5 rounded-sm object-cover"
          />
          <component
            :is="nodeIcon(selectedFile)"
            v-else
            class="size-4 shrink-0 text-muted-foreground"
          />
          <input
            v-model="selectedFile.name"
            :disabled="plugin.builtIn"
            class="min-w-0 flex-1 bg-transparent p-0 text-sm font-medium outline-none disabled:cursor-default"
            @change="persistNodeName"
          />
          <span
            class="hidden text-[11px] text-muted-foreground sm:inline"
          >
            {{ selectedType }}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button size="icon" variant="ghost" class="size-8" title="文件属性">
                <MoreHorizontal class="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-44">
              <DropdownMenuItem @click="showProperties = !showProperties">
                {{ showProperties ? "收起属性" : "编辑属性" }}
              </DropdownMenuItem>
              <DropdownMenuSeparator v-if="!plugin.builtIn" />
              <DropdownMenuItem
                v-if="!plugin.builtIn"
                class="text-destructive focus:text-destructive"
                @click="removeSelectedNode"
              >
                <Trash2 class="mr-2 size-4" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div
          v-if="selectedFile && showProperties"
          class="grid min-h-11 grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-center gap-4 border-b px-4 mobile:grid-cols-1 mobile:gap-1 mobile:py-2"
        >
          <span class="truncate font-mono text-[11px] text-muted-foreground">
            {{ selectedPath || "/" }} · {{ selectedFile.id }}
          </span>
          <label class="flex min-w-0 items-center gap-2">
            <span class="shrink-0 text-xs text-muted-foreground">图标</span>
            <input
              v-model="selectedFile.icon"
              :disabled="plugin.builtIn"
              class="h-7 min-w-0 flex-1 bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground"
              placeholder="URL，可留空"
              @change="persistNodeIcon"
            />
          </label>
        </div>

        <div v-if="selectedFile" class="min-h-0 flex-1 overflow-hidden">
          <div
            v-if="selectedType === 'markdown'"
            class="plugin-file-markdown h-full overflow-y-auto px-8 py-7 mobile:px-4 mobile:py-4"
            @click.self="($event.currentTarget as HTMLElement).querySelector<HTMLElement>('.ProseMirror')?.focus()"
          >
            <ConversationMarkdown
              v-if="plugin.builtIn"
              :model-value="formattedReadOnlyContent"
            />
            <ConversationComposerEditor
              v-else
              :model-value="contentDraft"
              enable-block-edit
              :enable-ai="false"
              placeholder=""
              @update:model-value="scheduleContentSave"
            />
          </div>

          <div
            v-else-if="selectedType === 'javascript' || selectedType === 'component'"
            class="h-full"
          >
            <JavaScriptCodeMirrorEditor
              :key="`${selectedFile.id}:${selectedType}`"
              :model-value="contentDraft"
              frameless
              :readonly="plugin.builtIn"
              @update:model-value="scheduleContentSave"
            />
          </div>

          <InteractiveDocumentWorkspacePage
            v-else-if="selectedType === 'interactive-document' && isInteractiveDocumentContent(selectedFile.content)"
            :key="selectedFile.id"
            :model-value="selectedFile.content"
            class="h-full"
            @update:model-value="scheduleInteractiveDocumentSave"
          />

          <div
            v-else-if="selectedType === 'json' || selectedType === 'interactive-document'"
            class="relative h-full"
          >
            <JavaScriptCodeMirrorEditor
              :key="`${selectedFile.id}:${selectedType}`"
              :model-value="contentDraft"
              language="json"
              frameless
              :readonly="plugin.builtIn"
              @update:model-value="scheduleContentSave"
            />
            <span
              v-if="contentError"
              class="absolute bottom-3 right-4 rounded bg-destructive px-2 py-1 text-xs text-destructive-foreground"
            >
              {{ contentError }}
            </span>
          </div>

          <div
            v-else-if="selectedType === 'media'"
            class="flex h-full min-h-0 flex-col"
          >
            <div class="flex h-12 items-center border-b px-4">
              <input
                :value="mediaSource"
                :disabled="plugin.builtIn"
                class="h-8 w-full bg-transparent px-1 font-mono text-xs outline-none disabled:cursor-default"
                placeholder="图片或视频 URL"
                @change="updateMediaSource(($event.target as HTMLInputElement).value)"
              />
            </div>
            <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/15 p-6">
              <video
                v-if="mediaSource && mediaKind === 'video'"
                :src="mediaSource"
                controls
                class="max-h-full max-w-full"
              />
              <img
                v-else-if="mediaSource"
                :src="mediaSource"
                alt=""
                class="max-h-full max-w-full object-contain"
              />
              <p v-else class="text-sm text-muted-foreground">尚未指定媒体</p>
            </div>
          </div>

          <textarea
            v-else
            :value="contentDraft"
            :disabled="plugin.builtIn"
            class="h-full w-full resize-none bg-transparent p-5 font-mono text-sm leading-6 outline-none disabled:cursor-default"
            @input="scheduleContentSave(($event.target as HTMLTextAreaElement).value)"
          />
        </div>

      </main>
    </div>

    <input ref="importInput" type="file" class="hidden" @change="importFile" />
    <div
      v-if="externalFileDragActive && !plugin.builtIn"
      class="pointer-events-none absolute inset-3 z-50 flex items-center justify-center rounded-lg border border-dashed border-primary/60 bg-background/90"
    >
      <div class="flex items-center gap-2 text-sm font-medium">
        <FileDown class="size-4 text-primary" />
        拖放文件以添加到当前目录
      </div>
    </div>
  </div>
</template>

<style>
.plugin-file-markdown :where(.conversation-composer-editor, .milkdown, .editor, .ProseMirror) {
  min-height: calc(100vh - 12rem) !important;
  max-height: none !important;
}

.plugin-file-markdown .conversation-composer-editor--block-edit :where(.milkdown, .editor) {
  overflow: visible !important;
}
</style>
