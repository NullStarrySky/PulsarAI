<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { readFile } from "@tauri-apps/plugin-fs";
import { push } from "notivue";
import {
  ArrowLeft,
  Boxes,
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
  Eye,
  Image,
  Minus,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Search,
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
import { useLayoutStore } from "@/features/UI/application/layout-store";
import ConversationMarkdown from "@/features/Resources/Conversation/presentation/ConversationMarkdown.vue";
import JavaScriptCodeMirrorEditor from "@/features/Resources/Preset/presentation/JavaScriptCodeMirrorEditor.vue";
import InteractiveDocumentWorkspacePage from "@/features/Resources/InteractiveDoc/presentation/InteractiveDocumentWorkspacePage.vue";
import {
  createEmptyInteractiveDocumentSource,
} from "@/features/Resources/InteractiveDoc/domain/interactive-document";
import {
  createPluginReferenceResolver,
} from "@/features/Resources/Plugin/application/plugin-reference-resolver";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import PluginContainerDefinitionsEditor from "@/features/Resources/Plugin/presentation/PluginContainerDefinitionsEditor.vue";
import PluginVuePreview from "@/features/Resources/Plugin/presentation/PluginVuePreview.vue";
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
const layout = useLayoutStore();
const responsive = useResponsiveStore();
const { isMobileLayout } = storeToRefs(responsive);
const search = ref("");
const selectedNodeId = ref("");
const treeCollapsed = ref(false);
const treeVisibleOnMobile = ref(true);
const showProperties = ref(false);
const contentDraft = ref("");
const contentError = ref("");
const fileViewMode = ref<"source" | "preview">("source");
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
const selectedIsVue = computed(
  () => selectedFile.value?.name.toLocaleLowerCase().endsWith(".vue") === true,
);
const selectedPath = computed(() =>
  plugin.value && selectedNode.value
    ? pluginNodePath(plugin.value.root, selectedNode.value.id).join("/")
    : "",
);
const selectedIsContainerDefinitions = computed(
  () =>
    selectedPath.value.toLocaleLowerCase()
      === pluginConventions.containers.toLocaleLowerCase(),
);
const selectedIsManifest = computed(
  () =>
    selectedPath.value.toLocaleLowerCase()
      === pluginConventions.manifest.toLocaleLowerCase(),
);
const selectedIsOverride = computed(
  () =>
    selectedPath.value.toLocaleLowerCase()
      === pluginConventions.override.toLocaleLowerCase(),
);
const selectedIsFixedConvention = computed(
  () =>
    selectedIsContainerDefinitions.value
    || selectedIsManifest.value
    || selectedIsOverride.value,
);
const selectedTypeLabel = computed(() =>
  selectedIsContainerDefinitions.value
    ? "container definitions"
    : selectedIsManifest.value
      ? "plugin manifest"
      : selectedIsOverride.value
        ? "conversation renderer override"
        : selectedType.value,
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
const mediaSource = computed(() => pluginMediaSource(selectedFile.value?.content));
const mediaKind = computed(() =>
  pluginMediaType(selectedFile.value?.content, mediaSource.value),
);
const interactiveDocumentPreviewContext = computed(() => {
  const currentPlugin = plugin.value;
  const file = selectedFile.value;
  if (
    !currentPlugin
    || !file
    || !["interactive-document", "markdown"].includes(selectedType.value ?? "")
  ) {
    return null;
  }
  const visiblePlugins = currentPlugin.packageId
    ? pluginStore.enabledPluginsForPackage(currentPlugin.packageId)
    : pluginStore.globalPlugins.filter((item) => item.enabled);
  const previewPlugins = visiblePlugins.some(
    (item) => item.id === currentPlugin.id,
  )
    ? visiblePlugins
    : [{ ...currentPlugin, enabled: true }, ...visiblePlugins];
  const resolver = createPluginReferenceResolver(previewPlugins, {
    environment: {
      chat: [],
      CHAT: [],
      CAPABILITIES_PROMPT: "[CAPABILITIES_PROMPT]",
      PROJECT_AGENT_PROMPT: "[PROJECT_AGENT_PROMPT]",
    },
    sourceOverrides: {
      [file.id]: contentDraft.value,
    },
  });
  return {
    resolveReference: (target: string) =>
      resolver.resolveFromResource(file.id, target),
    diagnostics: resolver.diagnostics.map((item) => item.message),
    suggestions: resolver.referenceSuggestionsFromResource(file.id),
  };
});
const interactiveDocumentReferenceResolver = computed(
  () => interactiveDocumentPreviewContext.value?.resolveReference,
);
const interactiveDocumentReferenceDiagnostics = computed(
  () => interactiveDocumentPreviewContext.value?.diagnostics ?? [],
);
const interactiveDocumentReferenceSuggestions = computed(() => {
  return interactiveDocumentPreviewContext.value?.suggestions ?? [];
});

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
  [selectedPath, () => plugin.value?.id],
  ([path, pluginId]) => {
    if (!pluginId) return;
    layout.updateResourceTabParams("plugin", pluginId, {
      projectPath: `/plugins/${pluginId}${path ? `/${path}` : ""}`,
    });
  },
  { immediate: true },
);

watch(
  () => selectedFile.value?.id,
  () => {
    loadContentDraft();
    fileViewMode.value =
      selectedType.value === "markdown" ? "preview" : "source";
  },
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

async function persistContent() {
  const currentPlugin = plugin.value;
  const file = selectedFile.value;
  if (!currentPlugin || !file) return;
  let content: unknown = contentDraft.value;
  if (
    selectedType.value === "json"
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

async function persistNodeName() {
  const current = plugin.value;
  const node = selectedNode.value;
  if (!current || !node) return;
  await pluginStore.updateNode(current.id, node.id, { name: node.name });
  loadContentDraft();
}

async function persistNodeIcon() {
  const current = plugin.value;
  const node = selectedNode.value;
  if (!current || !node) return;
  await pluginStore.updateNode(current.id, node.id, { icon: node.icon });
}

async function updateSelectedPriority(delta: number) {
  const current = plugin.value;
  const file = selectedFile.value;
  if (!current || !file) return;
  await pluginStore.updateNode(current.id, file.id, {
    priority: file.priority + delta,
  });
}

async function persistSelectedMemberships() {
  const current = plugin.value;
  const file = selectedFile.value;
  if (!current || !file) return;
  await pluginStore.updateNode(current.id, file.id, {
    memberships: file.memberships
      .filter((item) => item.container.trim())
      .map((item) => ({
        container: item.container.trim(),
        alias: item.alias.trim(),
      })),
  });
}

async function addSelectedMembership() {
  const file = selectedFile.value;
  if (!file) return;
  file.memberships.push({
    container: "container:plugin/会话上下文",
    alias: "",
  });
  await persistSelectedMemberships();
}

async function removeSelectedMembership(index: number) {
  const file = selectedFile.value;
  if (!file) return;
  file.memberships.splice(index, 1);
  await persistSelectedMemberships();
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
      content: createEmptyInteractiveDocumentSource(),
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
  if (!files.length || !plugin.value) return;
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
  if (!paths.length || !plugin.value) return;
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
  if (!plugin.value || !selectedFile.value) return;
  await pluginStore.updateNode(plugin.value.id, selectedFile.value.id, {
    content: createPluginMediaContent(value.trim()),
  });
}

async function removeSelectedNode() {
  const current = plugin.value;
  const node = selectedNode.value;
  if (!current || !node || node.id === current.root.id) return;
  await pluginStore.deleteNode(current.id, node.id);
  selectDefaultNode();
}

async function removeNode(nodeId: string) {
  const current = plugin.value;
  if (!current || nodeId === current.root.id) return;
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

function isContainerDefinitionsNode(node: PluginTreeNode) {
  return Boolean(
    plugin.value
    && pluginNodePath(plugin.value.root, node.id).join("/").toLocaleLowerCase()
      === pluginConventions.containers.toLocaleLowerCase(),
  );
}

function isFixedConventionNode(node: PluginTreeNode) {
  if (!plugin.value) return false;
  const path = pluginNodePath(plugin.value.root, node.id)
    .join("/")
    .toLocaleLowerCase();
  return [
    pluginConventions.manifest,
    pluginConventions.containers,
    pluginConventions.override,
    pluginConventions.componentsFolder,
  ].some((name) => path === name.toLocaleLowerCase());
}

function nodeIcon(node: PluginTreeNode) {
  if (node.kind === "folder") return node.collapsed ? Folder : FolderOpen;
  if (isContainerDefinitionsNode(node)) return Boxes;
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

function openTreeRowMenu(event: MouseEvent) {
  const row = event.currentTarget as HTMLElement | null;
  row?.querySelector<HTMLButtonElement>("[data-tree-row-menu-trigger]")?.click();
}

function showNodeProperties(node: PluginTreeNode) {
  selectNode(node);
  if (node.kind === "file") showProperties.value = true;
}

async function restoreBuiltInPlugin() {
  const current = plugin.value;
  if (!current?.builtIn) return;
  await pluginStore.restoreBuiltInPlugin(current.id);
  selectDefaultNode();
  push.success("已还原内置插件");
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
    <div
      class="grid min-h-0 flex-1 transition-[grid-template-columns] duration-200 mobile:block"
      :class="
        treeCollapsed
          ? 'grid-cols-[0_minmax(0,1fr)]'
          : 'grid-cols-[17rem_minmax(0,1fr)]'
      "
    >
      <aside
        v-show="!isMobileLayout || treeVisibleOnMobile"
        class="flex min-h-0 min-w-0 flex-col overflow-hidden border-r mobile:h-full mobile:border-r-0"
        :class="treeCollapsed && !isMobileLayout && 'invisible pointer-events-none'"
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
            @click="createFolder()"
          >
            <FolderPlus class="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            class="size-8"
            title="导入文件"
            @click="chooseImport()"
          >
            <FileDown class="size-4" />
          </Button>
          <Button
            v-if="plugin.builtIn"
            size="icon"
            variant="ghost"
            class="size-8"
            title="还原内置插件"
            @click="restoreBuiltInPlugin"
          >
            <RotateCcw class="size-4" />
          </Button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
          <div
            v-for="row in treeRows"
            :key="row.node.id"
            :draggable="!isFixedConventionNode(row.node)"
            class="group relative mb-0.5 flex h-8 items-center rounded-md transition-colors hover:bg-accent/55"
            :class="[
              selectedNodeId === row.node.id && 'bg-accent text-accent-foreground',
              draggingNodeId === row.node.id && 'opacity-45',
            ]"
            @dragstart="draggingNodeId = row.node.id"
            @dragend="draggingNodeId = ''"
            @dragover.prevent
            @drop.stop.prevent="dropOnRow(row)"
            @contextmenu.prevent.stop="openTreeRowMenu"
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
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  data-tree-row-menu-trigger
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
                <DropdownMenuItem
                  v-if="row.node.kind === 'file'"
                  @click="showNodeProperties(row.node)"
                >
                  文件属性
                </DropdownMenuItem>
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
                  v-if="!isFixedConventionNode(row.node)"
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
        <div
          v-if="selectedFile || !isMobileLayout"
          class="flex min-h-12 items-center gap-2 border-b px-3"
        >
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
          <Button
            v-else
            size="icon"
            variant="ghost"
            class="size-8"
            :title="treeCollapsed ? '展开文件栏' : '折叠文件栏'"
            :aria-label="treeCollapsed ? '展开文件栏' : '折叠文件栏'"
            :aria-expanded="!treeCollapsed"
            @click="treeCollapsed = !treeCollapsed"
          >
            <PanelLeftOpen v-if="treeCollapsed" class="size-4" />
            <PanelLeftClose v-else class="size-4" />
          </Button>
          <img
            v-if="selectedFile?.icon"
            :src="selectedFile.icon"
            alt=""
            class="size-5 rounded-sm object-cover"
          />
          <component
            :is="selectedFile ? nodeIcon(selectedFile) : File"
            v-else-if="selectedFile"
            class="size-4 shrink-0 text-muted-foreground"
          />
          <input
            v-if="selectedFile"
            v-model="selectedFile.name"
            :disabled="selectedIsFixedConvention"
            class="min-w-0 flex-1 bg-transparent p-0 text-sm font-medium outline-none disabled:cursor-default"
            @change="persistNodeName"
          />
          <span
            v-if="selectedFile"
            class="hidden text-[11px] text-muted-foreground sm:inline"
          >
            {{ selectedTypeLabel }}
          </span>
          <div
            v-if="selectedType === 'markdown' || selectedIsVue"
            class="flex items-center rounded-md border bg-muted/30 p-0.5"
          >
            <Button
              size="icon"
              variant="ghost"
              class="size-7"
              :class="fileViewMode === 'source' && 'bg-background shadow-sm'"
              title="显示原始内容"
              @click="fileViewMode = 'source'"
            >
              <Code2 class="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              class="size-7"
              :class="fileViewMode === 'preview' && 'bg-background shadow-sm'"
              title="预览"
              @click="fileViewMode = 'preview'"
            >
              <Eye class="size-3.5" />
            </Button>
          </div>
          <DropdownMenu v-if="selectedFile">
            <DropdownMenuTrigger as-child>
              <Button size="icon" variant="ghost" class="size-8" title="文件属性">
                <MoreHorizontal class="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-44">
              <DropdownMenuItem @click="showProperties = !showProperties">
                {{ showProperties ? "收起属性" : "编辑属性" }}
              </DropdownMenuItem>
              <DropdownMenuSeparator
                v-if="!selectedIsFixedConvention"
              />
              <DropdownMenuItem
                v-if="!selectedIsFixedConvention"
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
          class="grid min-h-11 grid-cols-[minmax(0,1fr)_auto_minmax(0,1.5fr)] items-center gap-4 border-b px-4 py-2 mobile:grid-cols-1 mobile:gap-2"
        >
          <span class="truncate font-mono text-[11px] text-muted-foreground">
            {{ selectedPath || "/" }} · {{ selectedFile.id }}
          </span>
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">优先级</span>
            <div class="inline-flex items-center rounded-md border">
              <Button
                size="icon"
                variant="ghost"
                class="size-7 rounded-r-none"
                title="降低优先级"
                @click="updateSelectedPriority(-1)"
              >
                <Minus class="size-3.5" />
              </Button>
              <span class="min-w-11 border-x px-2 text-center font-mono text-xs">
                {{ selectedFile.priority }}
              </span>
              <Button
                size="icon"
                variant="ghost"
                class="size-7 rounded-l-none"
                title="提高优先级"
                @click="updateSelectedPriority(1)"
              >
                <Plus class="size-3.5" />
              </Button>
            </div>
          </div>
          <label class="flex min-w-0 items-center gap-2">
            <span class="shrink-0 text-xs text-muted-foreground">图标</span>
            <input
              v-model="selectedFile.icon"
              class="h-7 min-w-0 flex-1 bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground"
              placeholder="URL，可留空"
              @change="persistNodeIcon"
            />
          </label>
          <div class="col-span-full border-t pt-2 mobile:col-span-1">
            <div class="mb-1.5 flex items-center justify-between">
              <span class="text-xs font-medium">容器成员关系（资源元数据）</span>
              <Button size="sm" variant="ghost" class="h-7 text-xs" @click="addSelectedMembership">
                <Plus class="mr-1 size-3.5" />
                加入容器
              </Button>
            </div>
            <div
              v-for="(membership, index) in selectedFile.memberships"
              :key="index"
              class="mb-1 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-2"
            >
              <input
                v-model="membership.container"
                class="h-8 rounded-md border bg-background px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
                placeholder="container:plugin/会话上下文"
                @change="persistSelectedMemberships"
              />
              <input
                v-model="membership.alias"
                class="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                placeholder="别名（可选）"
                @change="persistSelectedMemberships"
              />
              <Button size="icon" variant="ghost" class="size-8" title="移除成员关系" @click="removeSelectedMembership(index)">
                <Trash2 class="size-3.5" />
              </Button>
            </div>
            <p v-if="!selectedFile.memberships.length" class="text-xs text-muted-foreground">
              此资源暂未加入容器。元数据不会显示在文件正文或 Markdown 预览中。
            </p>
          </div>
        </div>

        <div v-if="selectedFile" class="min-h-0 flex-1 overflow-hidden">
          <PluginContainerDefinitionsEditor
            v-if="selectedIsContainerDefinitions"
            :key="selectedFile.id"
            :model-value="contentDraft"
            @update:model-value="scheduleContentSave"
          />

          <div
            v-else-if="selectedIsManifest"
            class="relative flex h-full min-h-0 flex-col"
          >
            <div class="border-b px-4 py-3">
              <div class="text-sm font-medium">插件配置</div>
              <p class="mt-0.5 text-xs text-muted-foreground">
                配置结构暂未开放；当前文件保持为空对象。
              </p>
            </div>
            <div class="min-h-0 flex-1">
              <JavaScriptCodeMirrorEditor
                :key="selectedFile.id"
                :model-value="contentDraft"
                language="json"
                frameless
                @update:model-value="scheduleContentSave"
              />
            </div>
            <span
              v-if="contentError"
              class="absolute bottom-3 right-4 rounded bg-destructive px-2 py-1 text-xs text-destructive-foreground"
            >
              {{ contentError }}
            </span>
          </div>

          <div
            v-else-if="selectedIsOverride"
            class="flex h-full min-h-0 flex-col"
          >
            <div class="border-b px-4 py-3">
              <div class="text-sm font-medium">默认对话渲染器覆盖</div>
              <p class="mt-0.5 text-xs text-muted-foreground">
                根级 Override.vue 用于替换默认对话内容区域；可复用 components/ 中的组件。
              </p>
            </div>
            <div class="min-h-0 flex-1">
              <PluginVuePreview
                v-if="fileViewMode === 'preview' && plugin"
                :plugin="plugin"
                :file="selectedFile"
                :source="contentDraft"
              />
              <JavaScriptCodeMirrorEditor
                v-else
                :key="selectedFile.id"
                :model-value="contentDraft"
                language="vue"
                frameless
                @update:model-value="scheduleContentSave"
              />
            </div>
          </div>

          <div
            v-else-if="selectedType === 'markdown'"
            class="h-full min-h-0"
          >
            <div
              v-if="fileViewMode === 'preview'"
              class="h-full overflow-y-auto bg-muted/35 px-6 py-8 mobile:px-3 mobile:py-4"
            >
              <article class="plugin-document mx-auto max-w-3xl rounded-xl border bg-background px-12 py-10 shadow-sm mobile:px-5 mobile:py-6">
                <ConversationMarkdown
                  :model-value="contentDraft"
                  enable-reference-syntax
                />
              </article>
            </div>
            <JavaScriptCodeMirrorEditor
              v-else
              :key="`${selectedFile.id}:markdown-source`"
              :model-value="contentDraft"
              language="markdown"
              :reference-suggestions="interactiveDocumentReferenceSuggestions"
              frameless
              @update:model-value="scheduleContentSave"
            />
          </div>

          <div
            v-else-if="selectedType === 'javascript'"
            class="h-full"
          >
            <JavaScriptCodeMirrorEditor
              :key="`${selectedFile.id}:${selectedType}`"
              :model-value="contentDraft"
              frameless
              @update:model-value="scheduleContentSave"
            />
          </div>

          <div
            v-else-if="selectedType === 'component'"
            class="h-full"
          >
            <PluginVuePreview
              v-if="fileViewMode === 'preview' && selectedIsVue && plugin"
              :plugin="plugin"
              :file="selectedFile"
              :source="contentDraft"
            />
            <JavaScriptCodeMirrorEditor
              v-else
              :key="`${selectedFile.id}:component-source`"
              :model-value="contentDraft"
              language="vue"
              frameless
              @update:model-value="scheduleContentSave"
            />
          </div>

          <InteractiveDocumentWorkspacePage
            v-else-if="selectedType === 'interactive-document'"
            :key="selectedFile.id"
            :model-value="contentDraft"
            :resolve-reference="interactiveDocumentReferenceResolver"
            :reference-diagnostics="interactiveDocumentReferenceDiagnostics"
            :reference-suggestions="interactiveDocumentReferenceSuggestions"
            class="h-full"
            @update:model-value="scheduleContentSave"
          />

          <div
            v-else-if="selectedType === 'json'"
            class="relative h-full"
          >
            <JavaScriptCodeMirrorEditor
              :key="`${selectedFile.id}:${selectedType}`"
              :model-value="contentDraft"
              language="json"
              frameless
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
            class="h-full w-full resize-none bg-transparent p-5 font-mono text-sm leading-6 outline-none disabled:cursor-default"
            @input="scheduleContentSave(($event.target as HTMLTextAreaElement).value)"
          />
        </div>

      </main>
    </div>

    <input ref="importInput" type="file" class="hidden" @change="importFile" />
    <div
      v-if="externalFileDragActive"
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
.plugin-document .conversation-markdown .ProseMirror {
  font-size: 1rem;
  line-height: 1.75;
}

.plugin-document .conversation-markdown .ProseMirror > :is(h1, h2, h3) {
  letter-spacing: -0.02em;
  line-height: 1.25;
  margin-bottom: 0.65em;
  margin-top: 1.4em;
}
</style>
