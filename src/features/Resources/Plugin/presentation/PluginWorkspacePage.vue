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
  SlidersHorizontal,
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useResponsiveStore } from "@/features/Misc/application/responsive-store";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import ConversationComposerEditor from "@/features/Resources/Conversation/presentation/ConversationComposerEditor.vue";
import JavaScriptCodeMirrorEditor from "@/features/Resources/Preset/presentation/JavaScriptCodeMirrorEditor.vue";
import {
  serializePluginDataDefinition,
} from "@/features/Resources/Plugin/domain/plugin-data";
import {
  parsePluginManifestReference,
} from "@/features/Resources/Plugin/domain/plugin-manifest";
import {
  createPluginReferenceResolver,
  type PluginContainerResourceQuery,
} from "@/features/Resources/Plugin/application/plugin-reference-resolver";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import PluginContainerDefinitionsEditor from "@/features/Resources/Plugin/presentation/PluginContainerDefinitionsEditor.vue";
import PluginManifestEditor from "@/features/Resources/Plugin/presentation/PluginManifestEditor.vue";
import PluginRegexEditor from "@/features/Resources/Plugin/presentation/PluginRegexEditor.vue";
import PluginVuePreview from "@/features/Resources/Plugin/presentation/PluginVuePreview.vue";
import {
  findPluginNodeByPath,
  findPluginTreeNode,
  findPluginTreeParent,
  flattenPluginFiles,
  pluginConventions,
  pluginFileType,
  pluginNodePath,
  sortPluginTreeNodes,
  type Plugin,
  type PluginFolder,
  type PluginTreeNode,
} from "@/features/Resources/Plugin/domain/plugin-types";
import type {
  WorkspaceTab,
} from "@/features/UI/application/layout-store";
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
  | "data"
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
  { id: "data", label: "数据定义", extension: ".data" },
  { id: "javascript", label: "JavaScript", extension: ".js" },
  { id: "json", label: "JSON", extension: ".json" },
  { id: "media", label: "媒体", extension: ".png" },
  { id: "component", label: "组件", extension: ".vue" },
  { id: "text", label: "纯文本", extension: ".txt" },
];

const props = defineProps<{
  resourceId: string;
  packageId?: string;
  tab?: WorkspaceTab;
}>();

const pluginStore = usePluginStore();
const pluginItems = () => (pluginStore as unknown as { plugins: Plugin[] }).plugins;
const conversation = useConversationStore();
const layout = useLayoutStore();
const responsive = useResponsiveStore();
const { isMobileLayout } = storeToRefs(responsive);
const search = ref("");
const selectedNodeId = ref("");
const treeCollapsed = ref(false);
const treeVisibleOnMobile = ref(true);
const conditionDialogOpen = ref(false);
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
  () => pluginItems().find((item) => item.id === props.resourceId) ?? null,
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
const selectedIsRegex = computed(
  () =>
    selectedPath.value.toLocaleLowerCase()
      === pluginConventions.regex.toLocaleLowerCase(),
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
    || selectedIsRegex.value
    || selectedIsOverride.value,
);
const selectedTypeLabel = computed(() =>
  selectedIsContainerDefinitions.value
    ? "container definitions"
    : selectedIsManifest.value
      ? "plugin manifest"
      : selectedIsRegex.value
        ? "regex container"
        : selectedIsOverride.value
          ? "conversation renderer override"
          : selectedType.value,
);
const selectedContextPlacementConflict = computed(() => {
  const file = selectedFile.value;
  const depth = file?.contextPlacement?.depth;
  if (!file || depth === undefined) return null;
  return (pluginReferenceResolver.value?.plugins ?? []).flatMap((item) =>
    flattenPluginFiles(item.root).map((resource) => ({ plugin: item, resource })),
  ).find(({ resource }) =>
    resource.id !== file.id
    && resource.contextPlacement?.depth === depth
    && resource.name.toLocaleLowerCase() === file.name.toLocaleLowerCase()
  ) ?? null;
});
const availablePositionContainers = computed(() =>
  containerDetails.value.filter(
    (container) =>
      container.scope === "global"
      || container.pluginId === plugin.value?.id,
  ),
);
const selectedInsertionMode = computed<"none" | "position" | "depth">(() => {
  if (selectedFile.value?.contextPlacement) return "depth";
  if (selectedFile.value?.memberships[0]) return "position";
  return "none";
});
const selectedPositionContainerId = computed(() => {
  const target = selectedFile.value?.memberships[0]?.container;
  if (!target) return "";
  return availablePositionContainers.value.find(
    (container) => containerTarget(container.scope, container.name) === target,
  )?.id ?? "";
});
const selectedInsertionCondition = computed(() =>
  selectedInsertionMode.value === "depth"
    ? selectedFile.value?.contextPlacement?.condition
    : selectedFile.value?.memberships[0]?.condition,
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
const pluginReferenceResolver = computed(() => {
  const currentPlugin = plugin.value;
  const file = selectedFile.value;
  if (!currentPlugin) return null;
  const contextPackageId = props.packageId ?? currentPlugin.packageId;
  const packageItem = conversation.packages.find(
    (item) => item.id === contextPackageId,
  );
  const visiblePlugins = contextPackageId
    ? pluginStore.enabledPluginsForPackage(
        contextPackageId,
        packageItem?.enabledGlobalPluginIds,
        packageItem?.mainPluginId,
      )
    : pluginStore.globalPlugins.filter((item) => item.enabled);
  const previewPlugins = visiblePlugins.some(
    (item) => item.id === currentPlugin.id,
  )
    ? visiblePlugins
    : [{ ...currentPlugin, enabled: true }, ...visiblePlugins];
  return createPluginReferenceResolver(previewPlugins, {
    environment: {
      chat: [],
      CHAT: [],
      PROJECT_AGENT_PROMPT: "[PROJECT_AGENT_PROMPT]",
    },
    sourceOverrides: file ? { [file.id]: contentDraft.value } : {},
  });
});
const containerDetails = computed(() =>
  (pluginReferenceResolver.value?.listContainers() ?? []).flatMap((container) => {
    const details = pluginReferenceResolver.value?.getContainer(container.id);
    return details ? [details] : [];
  }),
);
const manifestVisiblePlugins = computed(() =>
  pluginReferenceResolver.value?.plugins ?? (plugin.value ? [plugin.value] : []),
);
const importSuggestions = computed(() => {
  const file = selectedFile.value;
  const resolver = pluginReferenceResolver.value;
  if (
    !file
    || !resolver
    || (selectedType.value !== "markdown" && selectedType.value !== "javascript")
  ) {
    return [];
  }
  return resolver.importSuggestionsFromResource(file.id);
});

onMounted(async () => {
  await Promise.all([pluginStore.initialize(), conversation.initialize()]);
  pluginStore.openPlugin(props.resourceId);
  selectInitialNode();
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
    selectInitialNode();
  },
);
watch(
  () => props.tab?.resourceParams?.nodeId,
  (nodeId) => {
    if (typeof nodeId === "string") selectNodeById(nodeId);
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
    fileViewMode.value = selectedIsContainerDefinitions.value
      || selectedIsRegex.value
      || selectedIsManifest.value
      || selectedType.value === "markdown"
      ? "preview"
      : "source";
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

function selectInitialNode() {
  const requestedNodeId = props.tab?.resourceParams?.nodeId;
  if (
    typeof requestedNodeId === "string"
    && selectNodeById(requestedNodeId)
  ) {
    return;
  }
  selectDefaultNode();
}

function selectNodeById(nodeId: string) {
  const current = plugin.value;
  if (!current) return false;
  const node = findPluginTreeNode(current.root, nodeId);
  if (!node) return false;
  selectedNodeId.value = node.id;
  if (isMobileLayout.value) treeVisibleOnMobile.value = false;
  return true;
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
  layout.updateResourceTabParams("plugin", props.resourceId, {
    nodeId: node.id,
  });
  if (isMobileLayout.value) treeVisibleOnMobile.value = false;
}

function openContainerResource(
  resource: Pick<PluginContainerResourceQuery, "id" | "pluginId" | "path">,
) {
  if (contentSaveTimer) {
    clearTimeout(contentSaveTimer);
    contentSaveTimer = null;
    void persistContent();
  }
  const targetPlugin = pluginItems().find(
    (item) => item.id === resource.pluginId,
  );
  if (!targetPlugin) return;
  if (targetPlugin.id === props.resourceId) {
    if (selectNodeById(resource.id)) {
      layout.updateResourceTabParams("plugin", targetPlugin.id, {
        nodeId: resource.id,
        projectPath: `/plugins/${targetPlugin.id}${resource.path}`,
      });
    }
    return;
  }
  pluginStore.openPlugin(targetPlugin.id);
  layout.openResourceTab({
    resourceType: "plugin",
    resourceId: targetPlugin.id,
    packageId: targetPlugin.packageId ?? props.packageId,
    title: targetPlugin.name,
    resourceParams: {
      nodeId: resource.id,
      projectPath: `/plugins/${targetPlugin.id}${resource.path}`,
    },
  });
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
    selectedType.value === "json" || selectedType.value === "data"
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

async function updateSelectedPriority(delta: number) {
  const current = plugin.value;
  const file = selectedFile.value;
  if (!current || !file) return;
  await pluginStore.updateNode(current.id, file.id, {
    priority: file.priority + delta,
  });
}

function containerTarget(scope: "local" | "global", name: string) {
  return `container:${scope}/${name}`;
}

async function setResourceContextDepth(file: PluginTreeNode, depth: number | null) {
  const current = plugin.value;
  if (!current || file.kind !== "file") return;
  if (depth === null) {
    await pluginStore.updateNode(current.id, file.id, {
      contextPlacement: undefined,
    });
    return;
  }
  const conflict = (pluginReferenceResolver.value?.plugins ?? []).flatMap((item) =>
    flattenPluginFiles(item.root).map((resource) => ({ plugin: item, resource })),
  ).find(({ resource }) =>
    resource.id !== file.id
    && resource.contextPlacement?.depth === depth
    && resource.name.toLocaleLowerCase() === file.name.toLocaleLowerCase()
  );
  if (conflict) {
    push.error(
      `深度容器 ${depth} 已有同名内容：${conflict.plugin.name}/${conflict.resource.name}`,
    );
    return;
  }
  await pluginStore.updateNode(current.id, file.id, {
    contextPlacement: {
      depth,
      ...(file.contextPlacement?.condition
        ? { condition: structuredClone(file.contextPlacement.condition) }
        : {}),
    },
    memberships: [],
  });
}

async function setInsertionMode(value: unknown) {
  const current = plugin.value;
  const file = selectedFile.value;
  if (!current || !file || (value !== "none" && value !== "position" && value !== "depth")) {
    return;
  }
  if (value === "none") {
    await pluginStore.updateNode(current.id, file.id, {
      contextPlacement: undefined,
      memberships: [],
    });
    return;
  }
  if (value === "depth") {
    await pluginStore.updateNode(current.id, file.id, {
      contextPlacement: { depth: 0 },
      memberships: [],
    });
    return;
  }
  const target = availablePositionContainers.value[0];
  await pluginStore.updateNode(current.id, file.id, {
    contextPlacement: undefined,
    memberships: target
      ? [{ container: containerTarget(target.scope, target.name), alias: "" }]
      : [],
  });
  if (!target) push.warning("当前没有可用的本地或全局位置容器。");
}

async function setPositionContainer(containerId: unknown) {
  const current = plugin.value;
  const file = selectedFile.value;
  const target = availablePositionContainers.value.find(
    (container) => container.id === containerId,
  );
  if (!current || !file || !target) return;
  const condition = file.memberships[0]?.condition;
  await pluginStore.updateNode(current.id, file.id, {
    contextPlacement: undefined,
    memberships: [{
      container: containerTarget(target.scope, target.name),
      alias: "",
      ...(condition ? { condition: structuredClone(condition) } : {}),
    }],
  });
}

async function adjustSelectedDepth(delta: number) {
  const file = selectedFile.value;
  if (!file?.contextPlacement) return;
  await setResourceContextDepth(file, Math.max(0, file.contextPlacement.depth + delta));
}

async function setSelectedContextDepth(value: string) {
  const file = selectedFile.value;
  const depth = Number(value);
  if (!file || !Number.isInteger(depth) || depth < 0) {
    push.error("深度 K 必须是非负整数。");
    return;
  }
  await setResourceContextDepth(file, depth);
}

async function updateInsertionConditionReference(value: string) {
  const current = plugin.value;
  const file = selectedFile.value;
  if (!current || !file || selectedInsertionMode.value === "none") return;
  const reference = value.trim();
  let condition = reference
    ? { reference, ...(selectedInsertionCondition.value && Object.prototype.hasOwnProperty.call(selectedInsertionCondition.value, "equals") ? { equals: selectedInsertionCondition.value.equals } : {}) }
    : undefined;
  if (condition) {
    try {
      const parsed = parsePluginManifestReference(reference);
      if (parsed.scope !== "local") throw new Error("注入条件只允许 local 配置引用。");
    } catch (error) {
      push.error(error instanceof Error ? error.message : "配置引用无效。");
      return;
    }
  }
  if (selectedInsertionMode.value === "depth" && file.contextPlacement) {
    await pluginStore.updateNode(current.id, file.id, {
      contextPlacement: {
        depth: file.contextPlacement.depth,
        ...(condition ? { condition } : {}),
      },
    });
    return;
  }
  const membership = file.memberships[0];
  if (!membership) return;
  await pluginStore.updateNode(current.id, file.id, {
    memberships: [{
      container: membership.container,
      alias: membership.alias,
      ...(condition ? { condition } : {}),
    }],
  });
}

async function updateInsertionConditionEquals(value: string) {
  const condition = selectedInsertionCondition.value;
  if (!condition) return;
  let equals: unknown;
  try {
    equals = value.trim() ? JSON.parse(value) : undefined;
  } catch {
    push.error("注入条件的期望值必须是合法 JSON；留空表示判断真值。");
    return;
  }
  const next = {
    reference: condition.reference,
    ...(value.trim() ? { equals: equals as never } : {}),
  };
  const current = plugin.value;
  const file = selectedFile.value;
  if (!current || !file) return;
  if (selectedInsertionMode.value === "depth" && file.contextPlacement) {
    await pluginStore.updateNode(current.id, file.id, {
      contextPlacement: { depth: file.contextPlacement.depth, condition: next },
    });
    return;
  }
  const membership = file.memberships[0];
  if (!membership) return;
  await pluginStore.updateNode(current.id, file.id, {
    memberships: [{ ...membership, condition: next }],
  });
}

function selectedInsertionConditionEquals() {
  const condition = selectedInsertionCondition.value;
  return condition && Object.prototype.hasOwnProperty.call(condition, "equals")
    ? JSON.stringify(condition.equals)
    : "";
}

function insertionLabel(node: PluginTreeNode) {
  if (node.kind !== "file") return "";
  if (node.contextPlacement) return `深度 ${node.contextPlacement.depth}`;
  const target = node.memberships[0]?.container;
  if (!target) return "";
  const match = /^container:(?:local|global)\/(.+)$/.exec(target);
  return match?.[1] ?? target;
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
  if (type === "data") {
    return {
      name: "untitled.data",
      content: serializePluginDataDefinition({
        version: 1,
        isolation: "resource",
        description: "",
        initialValue: {},
        enableUpdater: false,
        wrapperSource: "",
      }),
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
  if (type !== "json" && type !== "data") return source;
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
    pluginConventions.regex,
    pluginConventions.override,
    pluginConventions.componentsFolder,
    pluginConventions.toolsFolder,
  ].some((name) => path === name.toLocaleLowerCase());
}

function nodeIcon(node: PluginTreeNode) {
  if (node.kind === "folder") return node.collapsed ? Folder : FolderOpen;
  if (isContainerDefinitionsNode(node)) return Boxes;
  switch (pluginFileType(node.name)) {
    case "markdown":
      return FileText;
    case "data":
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

function handleTreeRowContextMenu(event: MouseEvent) {
  if (isMobileLayout.value) return;
  openTreeRowMenu(event);
}

function selectTreeRowNode(node: PluginTreeNode) {
  selectNode(node);
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

        <ScrollArea class="min-h-0 flex-1">
          <div class="px-1.5 py-2">
            <div
            v-for="row in treeRows"
            :key="row.node.id"
          >
              <div
                :draggable="!isMobileLayout && !isFixedConventionNode(row.node)"
                class="group relative mb-0.5 flex h-8 items-center rounded-md transition-colors hover:bg-accent/55"
                :class="[
                  selectedNodeId === row.node.id && 'bg-accent text-accent-foreground',
                  draggingNodeId === row.node.id && 'opacity-45',
                ]"
                @dragstart="draggingNodeId = row.node.id"
                @dragend="draggingNodeId = ''"
                @dragover.prevent
                @drop.stop.prevent="dropOnRow(row)"
                @contextmenu.prevent.stop="handleTreeRowContextMenu"
              >
                <button
                  type="button"
                  class="flex h-full min-w-0 flex-1 items-center gap-1.5 pr-1 text-left"
                  :style="{ paddingLeft: `${row.depth * 16 + 6}px` }"
                  @click="selectTreeRowNode(row.node)"
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

                <span
                  v-if="insertionLabel(row.node)"
                  class="max-w-24 shrink-0 truncate px-1 text-[10px] text-muted-foreground"
                  :title="insertionLabel(row.node)"
                >
                  {{ insertionLabel(row.node) }}
                </span>

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
            </div>

            <p v-if="treeRows.length === 0" class="px-3 py-8 text-center text-xs text-muted-foreground">
              没有匹配的文件
            </p>
          </div>
        </ScrollArea>
      </aside>

      <main
        v-show="!isMobileLayout || !treeVisibleOnMobile"
        class="flex min-h-0 min-w-0 flex-col mobile:h-full"
      >
        <div
          v-if="selectedFile || !isMobileLayout"
          class="flex min-h-12 flex-wrap items-center gap-2 border-b px-3 py-2"
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
            v-if="selectedFile"
            class="ml-auto flex min-h-8 min-w-0 items-center gap-1.5 mobile:order-last mobile:ml-0 mobile:w-full mobile:flex-wrap"
          >
            <Select :model-value="selectedInsertionMode" @update:model-value="setInsertionMode">
              <SelectTrigger class="h-8 w-36 text-xs" aria-label="资源插入方式">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">不插入</SelectItem>
                  <SelectItem value="position">插入到位置：</SelectItem>
                  <SelectItem value="depth">插入到深度：</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              v-if="selectedInsertionMode === 'position'"
              :model-value="selectedPositionContainerId"
              @update:model-value="setPositionContainer"
            >
              <SelectTrigger class="h-8 min-w-48 max-w-72 flex-1 text-xs" aria-label="位置容器">
                <SelectValue placeholder="选择本地或全局容器" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem
                    v-for="container in availablePositionContainers"
                    :key="container.id"
                    :value="container.id"
                    :text-value="`${container.name} ${container.description ?? ''}`"
                  >
                    <span class="flex min-w-0 flex-col">
                      <span class="truncate text-xs">
                        {{ container.scope === "local" ? "本地" : "全局" }} · {{ container.name }}
                      </span>
                      <span v-if="container.description" class="truncate text-[11px] text-muted-foreground">
                        {{ container.description }}
                      </span>
                    </span>
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            <div
              v-else-if="selectedInsertionMode === 'depth'"
              class="inline-flex h-8 items-center overflow-hidden rounded-md border bg-background"
            >
              <Button
                size="icon"
                variant="ghost"
                class="size-7 rounded-none"
                title="减小深度"
                :disabled="(selectedFile.contextPlacement?.depth ?? 0) <= 0"
                @click="adjustSelectedDepth(-1)"
              >
                <Minus />
              </Button>
              <Input
                :model-value="selectedFile.contextPlacement?.depth ?? 0"
                type="number"
                min="0"
                step="1"
                class="h-7 w-14 rounded-none border-y-0 px-1 text-center font-mono text-xs shadow-none"
                aria-label="上下文深度 K"
                @change="setSelectedContextDepth(($event.target as HTMLInputElement).value)"
              />
              <Button
                size="icon"
                variant="ghost"
                class="size-7 rounded-none"
                title="增大深度"
                @click="adjustSelectedDepth(1)"
              >
                <Plus />
              </Button>
            </div>

            <span
              v-if="selectedInsertionMode === 'depth' && selectedContextPlacementConflict"
              class="min-w-0 truncate text-[11px] text-destructive"
              :title="`与 ${selectedContextPlacementConflict.plugin.name}/${selectedContextPlacementConflict.resource.name} 冲突`"
            >
              位置冲突
            </span>

            <Button
              v-if="selectedInsertionMode !== 'none'"
              size="sm"
              :variant="selectedInsertionCondition ? 'secondary' : 'outline'"
              class="h-8 px-2 text-xs"
              @click="conditionDialogOpen = true"
            >
              条件
            </Button>

            <DropdownMenu v-if="selectedInsertionMode !== 'none'">
              <DropdownMenuTrigger as-child>
                <Button size="sm" variant="outline" class="h-8 px-2 font-mono text-xs" title="优先级">
                  <SlidersHorizontal data-icon="inline-start" />
                  P{{ selectedFile.priority }}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-40">
                <DropdownMenuItem @click="updateSelectedPriority(1)">
                  <Plus data-icon="inline-start" />
                  提高优先级
                </DropdownMenuItem>
                <DropdownMenuItem @click="updateSelectedPriority(-1)">
                  <Minus data-icon="inline-start" />
                  降低优先级
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div
            v-if="selectedIsVue || selectedIsContainerDefinitions || selectedIsRegex || selectedIsManifest || selectedType === 'markdown'"
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
          <DropdownMenu v-if="selectedFile && !selectedIsFixedConvention">
            <DropdownMenuTrigger as-child>
              <Button size="icon" variant="ghost" class="size-8" title="文件操作">
                <MoreHorizontal class="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-44">
              <DropdownMenuItem
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
          v-if="selectedFile"
          class="min-h-0 flex-1 overflow-hidden bg-muted/30 p-4 mobile:p-2"
        >
          <div class="mx-auto h-full w-full max-w-5xl overflow-hidden rounded-lg border bg-background shadow-sm">
          <PluginContainerDefinitionsEditor
            v-if="selectedIsContainerDefinitions && fileViewMode === 'preview'"
            :key="selectedFile.id"
            :model-value="contentDraft"
            :definition-id="selectedFile.id"
            :container-details="containerDetails"
            @update:model-value="scheduleContentSave"
            @open-resource="openContainerResource"
          />

          <div
            v-else-if="selectedIsContainerDefinitions"
            class="relative h-full"
          >
            <JavaScriptCodeMirrorEditor
              :key="`${selectedFile.id}:containers-source`"
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

          <PluginRegexEditor
            v-else-if="selectedIsRegex && fileViewMode === 'preview'"
            :key="selectedFile.id"
            :model-value="contentDraft"
            @update:model-value="scheduleContentSave"
          />

          <div
            v-else-if="selectedIsRegex"
            class="relative h-full"
          >
            <JavaScriptCodeMirrorEditor
              :key="`${selectedFile.id}:regex-source`"
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

          <PluginManifestEditor
            v-else-if="selectedIsManifest && fileViewMode === 'preview' && plugin"
            :key="selectedFile.id"
            :model-value="contentDraft"
            :plugin="plugin"
            :plugins="manifestVisiblePlugins"
            @update:model-value="scheduleContentSave"
          />

          <div
            v-else-if="selectedIsManifest"
            class="relative flex h-full min-h-0 flex-col"
          >
            <div class="border-b px-4 py-3">
              <div class="text-sm font-medium">插件配置</div>
              <p class="mt-0.5 text-xs text-muted-foreground">
                根节点使用 GroupContent[]；每项通过 component、props 和 value 定义一个设置控件。
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
            v-else-if="selectedType === 'markdown' && fileViewMode === 'preview'"
            class="h-full min-h-0 overflow-y-auto"
          >
            <ConversationComposerEditor
              :key="`${selectedFile.id}:markdown-editor`"
              :model-value="contentDraft"
              enable-block-edit
              enable-top-bar
              :enable-ai="false"
              class="plugin-markdown-editor min-h-full px-6 py-8 mobile:px-3 mobile:py-4"
              @update:model-value="scheduleContentSave"
            />
          </div>

          <JavaScriptCodeMirrorEditor
            v-else-if="selectedType === 'markdown'"
            :key="`${selectedFile.id}:markdown-source`"
            :model-value="contentDraft"
            language="markdown"
            frameless
            :import-suggestions="importSuggestions"
            @update:model-value="scheduleContentSave"
          />

          <div
            v-else-if="selectedType === 'javascript'"
            class="h-full"
          >
            <JavaScriptCodeMirrorEditor
              :key="`${selectedFile.id}:${selectedType}`"
              :model-value="contentDraft"
              language="javascript"
              frameless
              :import-suggestions="importSuggestions"
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

          <div
            v-else-if="selectedType === 'json' || selectedType === 'data'"
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
        </div>

      </main>
    </div>

    <Dialog v-model:open="conditionDialogOpen">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>插入条件</DialogTitle>
          <DialogDescription>
            条件只引用当前插件 manifest.json 中的本地配置；留空表示始终插入。
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <label class="flex flex-col gap-1.5">
            <span class="text-xs font-medium">配置引用</span>
            <Input
              :model-value="selectedInsertionCondition?.reference ?? ''"
              class="font-mono text-xs"
              placeholder="config:local/group/content"
              @change="updateInsertionConditionReference(($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-xs font-medium">期望值</span>
            <Input
              :model-value="selectedInsertionConditionEquals()"
              :disabled="!selectedInsertionCondition?.reference"
              class="font-mono text-xs"
              placeholder="合法 JSON；留空时判断真值"
              @change="updateInsertionConditionEquals(($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
      </DialogContent>
    </Dialog>

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
