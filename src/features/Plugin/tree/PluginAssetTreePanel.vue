<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  Braces,
  ClipboardPaste,
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
import { useWorld } from "@/features/Plugin/tree/world-store";
import { pluginWorldPath, worldReference } from "@/features/Plugin/tree/world-path";
import { pluginSlotSchema, type PluginSlot } from "@/features/Plugin/editors/slot/plugin-slot";
import { createPluginResourceContent } from "@/features/Plugin/editors/resource-defaults";
import { createPluginMediaContent } from "@/features/Plugin/editors/media/plugin-media";
import PluginAssetTreeBranch from "@/features/Plugin/tree/PluginAssetTreeBranch.vue";
import { slotIconComponent, slotIconOptions } from "@/features/Plugin/tree/slot-icons";
import type { SlotQuery } from "@/features/Plugin/tree/slot-store";
import {
  pluginFileType,
  findPluginNodeByPath,
  findPluginTreeNode,
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
  label: string;
  worldPath: string;
  virtual?: "self" | "global" | "slot";
  expandable?: boolean;
  slot?: SlotQuery;
  togglePaths?: string[];
  enabled?: boolean;
  sourceLabel?: string;
}

interface TreeBranch {
  row: TreeRow;
  children: TreeBranch[];
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
  packageId: string;
  conversationId?: string;
}>();

const emit = defineEmits<{
  select: [value: { plugin: Plugin; file: PluginFile; path: string }];
  close: [];
}>();

const pluginStore = usePluginStore();
const world = useWorld(computed(() => ({
  conversationId: props.conversationId,
  packageId: props.packageId,
})));
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
const activeTab = ref("assets");
const tabDirection = ref(1);
const slotEditorOpen = ref(false);
const slotEditorId = ref<string | null>(null);
const slotDraft = ref<PluginSlot>({ id: "", title: "", description: "", contentSuffixes: [], selectionMode: "none" });
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

const packagePlugins = world.plugins;
const localPlugin = computed(() => packagePlugins.value.find(
  (plugin) => plugin.packageId === props.packageId,
) ?? null);
const globalPlugins = computed(() => packagePlugins.value.filter(
  (plugin) => plugin.packageId === null,
));
const tabOptions = [
  { value: "assets", label: "资产" },
  { value: "slots", label: "插槽" },
  { value: "sources", label: "来源" },
];
const treeTransition = computed(() => tabDirection.value > 0 ? "tree-tab-forward" : "tree-tab-backward");

watch(activeTab, (next, previous) => {
  tabDirection.value = tabOptions.findIndex((option) => option.value === next)
    >= tabOptions.findIndex((option) => option.value === previous) ? 1 : -1;
});

function keyFor(pluginId: string, nodeId: string) {
  return `${pluginId}:${nodeId}`;
}

function rootKeyFor(pluginId: string) {
  return `${pluginId}:`;
}

const assetTreeRows = computed(() => {
  const rows: TreeRow[] = [];
  const local = localPlugin.value;
  if (!local) return rows;
  const selfKey = "world:self";
  rows.push({ key: selfKey, plugin: local, node: null, depth: 0, path: "", worldPath: "self", label: "self", root: true, virtual: "self" });
  appendChildren(rows, local, "", 1);
  const globalKey = "world:global";
  rows.push({ key: globalKey, plugin: local, node: null, depth: 0, path: "", worldPath: "global", label: "global", root: true, virtual: "global" });
  for (const plugin of globalPlugins.value) {
    const rootKey = rootKeyFor(plugin.id);
    rows.push({ key: rootKey, plugin, node: null, depth: 1, path: "", worldPath: pluginWorldPath(plugin, "", props.packageId), label: plugin.name, root: true });
    appendChildren(rows, plugin, "", 2);
  }
  return rows;
});

function rowIsFolder(row: TreeRow) {
  return Boolean(row.root || row.expandable || row.node?.kind === "folder");
}

function slotResourceRows(
  rows: TreeRow[],
  slot: SlotQuery,
  depth: number,
) {
  for (const resource of slot.allResources) {
    const plugin = packagePlugins.value.find((item) => item.id === resource.pluginId);
    if (!plugin) continue;
    rows.push({
      key: `slot:${slot.scope}:${slot.pluginId}:${slot.id}:${resource.id}`,
      plugin,
      node: resource.file,
      depth,
      path: resource.path,
      worldPath: resource.worldPath,
      label: resource.name,
      root: false,
      slot,
      togglePaths: [resource.worldPath],
      enabled: !world.isPathDisabled(resource.worldPath),
      sourceLabel: slot.scope === "global" ? resource.pluginName : undefined,
    });
  }
}

const slotTreeRows = computed(() => {
  const rows: TreeRow[] = [];
  const local = localPlugin.value;
  if (!local) return rows;
  const globalSlots = world.containers.value.list("global");

  for (const slot of globalSlots) {
    const key = `world:slot:${slot.id}`;
    rows.push({
      key,
      plugin: local,
      node: null,
      depth: 0,
      path: "",
      worldPath: "/config.json",
      label: slot.title,
      root: false,
      virtual: "slot",
      expandable: true,
      slot,
      togglePaths: slot.allResources.map((resource) => resource.worldPath),
      enabled: slot.resources.length > 0,
    });
    slotResourceRows(rows, slot, 1);
  }
  return rows;
});

const sourceTreeRows = computed(() => {
  const rows: TreeRow[] = [];
  const globalSlots = world.containers.value.list("global");
  for (const plugin of packagePlugins.value) {
    const key = `contribution:${plugin.id}`;
    const mountPath = pluginWorldPath(plugin, "", props.packageId);
    rows.push({
      key,
      plugin,
      node: null,
      depth: 0,
      path: "",
      worldPath: mountPath,
      label: plugin.name,
      root: true,
      togglePaths: [mountPath],
      enabled: !world.isPathDisabled(mountPath),
    });
    const contributed = globalSlots.filter((slot) =>
      slot.allResources.some((resource) => resource.pluginId === plugin.id));
    for (const slot of contributed) {
      const resources = slot.allResources.filter((resource) => resource.pluginId === plugin.id);
      const slotKey = `source:${plugin.id}:${slot.id}`;
      rows.push({
        key: slotKey,
        plugin,
        node: null,
        depth: 1,
        path: "",
        worldPath: mountPath,
        label: slot.title,
        root: false,
        virtual: "slot",
        expandable: true,
        slot: { ...slot, allResources: resources, resources: slot.resources.filter((resource) => resource.pluginId === plugin.id) },
        togglePaths: resources.map((resource) => resource.worldPath),
        enabled: resources.some((resource) => !world.isPathDisabled(resource.worldPath)),
      });
      slotResourceRows(rows, { ...slot, allResources: resources }, 2);
    }
  }
  return rows;
});

const treeRows = computed(() => activeTab.value === "assets"
  ? assetTreeRows.value
  : activeTab.value === "slots"
    ? slotTreeRows.value
    : sourceTreeRows.value);

function nestTreeRows(rows: TreeRow[]) {
  const branches: TreeBranch[] = [];
  const stack: Array<{ depth: number; children: TreeBranch[] }> = [{ depth: -1, children: branches }];
  for (const row of rows) {
    while (stack[stack.length - 1]!.depth >= row.depth) stack.pop();
    const branch: TreeBranch = { row, children: [] };
    stack[stack.length - 1]!.children.push(branch);
    stack.push({ depth: row.depth, children: branch.children });
  }
  return branches;
}

const treeBranches = computed(() => nestTreeRows(treeRows.value));

function isRowExpanded(row: TreeRow) {
  return rowIsFolder(row) && expandedIds.value.has(row.key);
}

function visibleTreeRowCount(branches: TreeBranch[]): number {
  return branches.reduce((count, branch) => count + 1
    + (isRowExpanded(branch.row) ? visibleTreeRowCount(branch.children) : 0), 0);
}

function appendChildren(
  rows: TreeRow[],
  plugin: Plugin,
  folderPath: string,
  depth: number,
) {
  for (const node of pluginChildNodes(plugin, folderPath)) {
    const key = keyFor(plugin.id, node.id);
    rows.push({ key, plugin, node, depth, path: node.path, worldPath: pluginWorldPath(plugin, node.path, props.packageId), label: node.name, root: false });
    if (node.kind === "folder") {
      appendChildren(rows, plugin, node.path, depth + 1);
    }
  }
}

function folderPathOf(row: TreeRow) {
  return row.root || row.node?.kind === "folder" ? row.node?.path ?? "" : pluginParentPath(row.node?.path ?? "");
}

function toggleRow(row: TreeRow) {
  if (!rowIsFolder(row)) return;
  const next = new Set(expandedIds.value);
  next.has(row.key) ? next.delete(row.key) : next.add(row.key);
  expandedIds.value = next;
  focusedPluginId.value = row.plugin.id;
}

async function activateRow(row: TreeRow) {
  if (row.virtual) {
    toggleRow(row);
    return;
  }
  focusedPluginId.value = row.plugin.id;
  void pluginStore.openPlugin(row.plugin.id);
  if (rowIsFolder(row)) {
    toggleRow(row);
    return;
  }
  if (row.node?.kind !== "file") return;
  selectedKey.value = row.key;
  emit("select", { plugin: row.plugin, file: row.node, path: row.path });
}

function iconFor(row: TreeRow) {
  const slotIcon = slotIconComponent(row.slot?.icon);
  if (slotIcon && (row.virtual === "slot" || row.node?.kind === "file")) return slotIcon;
  if (row.virtual === "slot") return Braces;
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

async function setRowEnabled(row: TreeRow, enabled: boolean) {
  const paths = row.togglePaths ?? [];
  if (!paths.length) return;
  if (activeTab.value === "slots" && row.slot?.scope === "global" && row.virtual === "slot" && enabled) {
    await world.select(row.slot.id, paths.map((path) => worldReference(path)));
    return;
  }
  const disabled = new Set(world.config.value.disabled);
  const knownPaths = world.containers.value.list().flatMap((slot) =>
    slot.allResources.map((resource) => worldReference(resource.worldPath)));
  for (const path of paths.map((path) => worldReference(path))) {
    if (!enabled) {
      disabled.add(path);
      continue;
    }
    for (const item of [...disabled]) {
      if (path !== item && !path.startsWith(`${item}/`)) continue;
      disabled.delete(item);
      for (const knownPath of knownPaths) {
        if (knownPath !== path && (knownPath === item || knownPath.startsWith(`${item}/`))) disabled.add(knownPath);
      }
    }
    disabled.delete(path);
  }
  await world.configure({ ...world.config.value, disabled: [...disabled].sort((left, right) => left.localeCompare(right)) });
}

function expandFolder(plugin: Plugin, folderPath: string) {
  const node = folderPath ? findPluginNodeByPath(plugin, folderPath) : null;
  const key = node
    ? keyFor(plugin.id, node.id)
    : plugin.packageId === props.packageId ? "world:self" : rootKeyFor(plugin.id);
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

function createSlotId() {
  const ids = new Set(world.config.value.slots.map((slot) => slot.id));
  let index = 1;
  let id = `slot-${index}`;
  while (ids.has(id)) id = `slot-${++index}`;
  return id;
}

function openNewSlot() {
  slotEditorId.value = null;
  slotDraft.value = {
    id: createSlotId(),
    title: "新插槽",
    description: "",
    contentSuffixes: [],
    selectionMode: "none",
  };
  slotEditorOpen.value = true;
}

function openSlotEditor(slot: PluginSlot) {
  slotEditorId.value = slot.id;
  slotDraft.value = structuredClone(slot);
  slotEditorOpen.value = true;
}

async function saveSlot() {
  const parsed = pluginSlotSchema.safeParse(slotDraft.value);
  if (!parsed.success) {
    localError.value = "插槽 ID 与标题不能为空。";
    return;
  }
  const next = parsed.data;
  const replacing = slotEditorId.value;
  if (world.config.value.slots.some((slot) => slot.id === next.id && slot.id !== replacing)) {
    localError.value = `插槽 ID 已存在：${next.id}`;
    return;
  }
  const slots = world.config.value.slots.map((slot) => slot.id === replacing ? next : slot);
  if (!replacing) slots.push(next);
  localError.value = "";
  await world.configure({ ...world.config.value, slots });
  slotEditorOpen.value = false;
}

async function removeSlot(slot: PluginSlot) {
  await world.configure({ ...world.config.value, slots: world.config.value.slots.filter((item) => item.id !== slot.id) });
}

async function setSlotSelectionMode(slot: PluginSlot, selectionMode: PluginSlot["selectionMode"]) {
  await world.configure({
    ...world.config.value,
    slots: world.config.value.slots.map((item) => item.id === slot.id ? { ...item, selectionMode } : item),
  });
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
  const template = newFileTemplate(type);
  const name = uniqueNodeName(plugin, folderPath, template.name);
  const path = [folderPath, name].filter(Boolean).join("/");
  const reference = worldReference(pluginWorldPath(plugin, path, props.packageId));
  await world.write(reference, template.content);
  const resolved = world.resolve(reference);
  const file = findPluginNodeByPath(resolved.plugin, resolved.path);
  if (file?.kind !== "file") return;
  expandFolder(plugin, folderPath);
  selectedKey.value = keyFor(plugin.id, file.id);
}

async function createFolder(plugin: Plugin, parentPath: string) {
  const name = uniqueNodeName(plugin, parentPath, "新文件夹");
  const path = [parentPath, name].filter(Boolean).join("/");
  await world.mkdir(worldReference(pluginWorldPath(plugin, path, props.packageId)));
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
    const name = uniqueNodeName(plugin, parentPath, node.name);
    const path = [parentPath, name].filter(Boolean).join("/");
    const reference = worldReference(pluginWorldPath(plugin, path, props.packageId));
    await world.write(reference, structuredClone(node.content));
    await world.updateFile(reference, {
      ...(node.order === undefined ? {} : { order: node.order }),
      ...(node.insertion ? { insertion: structuredClone(node.insertion) } : {}),
    });
    const resolved = world.resolve(reference);
    return findPluginNodeByPath(resolved.plugin, resolved.path);
  }
  const folderPath = [parentPath, uniqueNodeName(plugin, parentPath, node.name)].filter(Boolean).join("/");
  const reference = worldReference(pluginWorldPath(plugin, folderPath, props.packageId));
  await world.mkdir(reference);
  for (const child of node.children ?? []) await pasteClipboardNode(plugin, folderPath, child);
  const resolved = world.resolve(reference);
  return findPluginNodeByPath(resolved.plugin, resolved.path);
}

async function pasteNode(plugin: Plugin, parentPath: string) {
  if (!clipboardNode.value) return;
  const created = await pasteClipboardNode(plugin, parentPath, clipboardNode.value);
  if (!created) return;
  expandFolder(plugin, parentPath);
  push.success(`已粘贴：${created.name}`);
}

async function copyNodePath(row: TreeRow) {
  await navigator.clipboard.writeText(worldReference(row.worldPath));
  push.success("路径已复制");
}

function isFixedConventionRow(row: TreeRow) {
  if (row.root || row.virtual) return true;
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
  const plugin = packagePlugins.value.find((item) => item.id === target.pluginId);
  const node = plugin ? findPluginTreeNode(plugin, target.nodeId) : null;
  if (!plugin || !node) return;
  const targetPath = [pluginParentPath(node.path), name].filter(Boolean).join("/");
  await world.move(
    worldReference(pluginWorldPath(plugin, node.path, props.packageId)),
    worldReference(pluginWorldPath(plugin, targetPath, props.packageId)),
  );
}

function cancelRename() {
  if (renameFocusTimer) clearTimeout(renameFocusTimer);
  renamingKey.value = "";
  renameTarget.value = null;
}

async function removeNode(row: TreeRow) {
  await world.remove(worldReference(row.worldPath));
  if (selectedKey.value === row.key) selectedKey.value = "";
}

async function dropOnRow(row: TreeRow) {
  const dragging = draggingNode.value;
  if (!dragging || row.key === "world:" || row.virtual === "global") return;
  const sourcePlugin = packagePlugins.value.find((item) => item.id === dragging.pluginId);
  const sourceNode = sourcePlugin ? findPluginTreeNode(sourcePlugin, dragging.nodeId) : null;
  if (!sourcePlugin || !sourceNode) return;
  const targetPath = row.root || row.node?.kind === "folder"
    ? row.node?.path ?? ""
    : pluginParentPath(row.node?.path ?? "");
  const destination = [targetPath, sourceNode.name].filter(Boolean).join("/");
  await world.move(
    worldReference(pluginWorldPath(sourcePlugin, sourceNode.path, props.packageId)),
    worldReference(pluginWorldPath(row.plugin, destination, props.packageId)),
  );
  draggingNode.value = null;
  expandFolder(row.plugin, targetPath);
}

function insertionLabel(node: PluginTreeNode | null) {
  if (!node || node.kind !== "file" || !node.insertion?.slot) return "";
  return node.insertion.slot;
}

function rowBadgeLabel(row: TreeRow) {
  if (activeTab.value === "assets") return insertionLabel(row.node);
  return activeTab.value === "slots" ? row.sourceLabel ?? "" : "";
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
      const path = [target.folderPath, uniqueNodeName(plugin, target.folderPath, file.name)].filter(Boolean).join("/");
      const reference = worldReference(pluginWorldPath(plugin, path, props.packageId));
      await world.write(reference, content);
      const resolved = world.resolve(reference);
      const created = findPluginNodeByPath(resolved.plugin, resolved.path);
      if (created?.kind !== "file") continue;
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
    expandedIds.value = new Set(["world:self", "world:global"]);
  } catch (error) {
    localError.value = error instanceof Error ? error.message : "资产数据库初始化失败";
  }
});
const treeViewportHeight = computed(() => Math.min(
  448,
  Math.max(80, visibleTreeRowCount(treeBranches.value) * 32 + 16),
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
    expandedIds.value = new Set(["world:self", "world:global"]);
  }
});
onUnmounted(() => {
  if (renameFocusTimer) clearTimeout(renameFocusTimer);
  stopPanelDrag();
});
</script>

<template>
  <aside
    class="asset-tree-panel absolute right-3 top-3 z-40 flex w-max min-w-[19rem] max-w-[calc(100vw-1.5rem)] max-h-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover/95 shadow-xl backdrop-blur-md transition-shadow mobile:right-2 mobile:top-2 mobile:max-h-[calc(100%-1rem)]"
    :style="panelPosition ? { transform: `translate3d(${panelPosition.x}px, ${panelPosition.y}px, 0)` } : undefined"
  >
    <div
      class="flex h-12 shrink-0 select-none items-center justify-between border-b border-border/80 px-3 cursor-grab active:cursor-grabbing mobile:h-auto mobile:flex-wrap mobile:gap-1 mobile:py-2"
      @mousedown="startPanelDrag"
    >
      <Segmented v-model="activeTab" :options="tabOptions" class="[&_[data-segmented-option]]:size-7 [&_[data-segmented-option]]:px-0" @mousedown.stop>
        <template #option="{ option }">
          <Folder v-if="option.value === 'assets'" class="size-3.5" />
          <Braces v-else-if="option.value === 'slots'" class="size-3.5" />
          <Package v-else class="size-3.5" />
        </template>
      </Segmented>
      <div class="flex items-center gap-1">
        <DropdownMenu v-if="activeTab === 'assets'">
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon-sm" class="rounded-full" title="新建资源" aria-label="新建资源" :disabled="!localPlugin" @click.stop>
              <FilePlus2 class="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-48">
            <DropdownMenuItem v-for="fileType in newFileTypes" :key="fileType.id" @click="localPlugin && createFile(localPlugin, '', fileType.id)">
              <span class="min-w-0 flex-1">{{ fileType.label }}</span>
              <span class="font-mono text-[10px] text-muted-foreground">{{ fileType.extension }}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem :disabled="!localPlugin" @click="localPlugin && createFolder(localPlugin, '')"><FolderPlus data-icon="inline-start" />新建文件夹</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button v-else-if="activeTab === 'slots'" variant="ghost" size="icon-sm" class="rounded-full" title="新建插槽" aria-label="新建插槽" @click.stop="openNewSlot">
          <FilePlus2 class="size-4" />
        </Button>
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
      <div class="relative w-max min-w-full overflow-hidden p-2">
        <Transition :name="treeTransition">
          <div :key="activeTab" class="space-y-0.5">
            <PluginAssetTreeBranch
              v-for="branch in treeBranches"
              :key="branch.row.key"
              :branch="branch"
              :is-expanded="isRowExpanded"
            >
              <template #default="{ row }">
                <div
              class="group flex min-w-0 items-center"
              :draggable="activeTab === 'assets' && !row.root && !isFixedConventionRow(row)"
              @dragstart="activeTab === 'assets' && (draggingNode = { pluginId: row.plugin.id, nodeId: row.node!.id })"
              @dragend="draggingNode = null"
              @dragover.prevent
              @drop.stop.prevent="dropOnRow(row)"
            >
              <ContextMenu v-if="activeTab === 'slots' && row.virtual === 'slot' && row.slot">
                <ContextMenuTrigger as-child>
                  <button
                    type="button"
                    class="flex h-8 w-max min-w-full items-center gap-1 rounded-md pr-1 text-left text-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    :class="[selectedKey === row.key && 'bg-muted text-foreground', renamingKey === row.key && 'flex-none']"
                    :style="{ paddingLeft: `${Math.min(row.depth, 7) * 14 + 6}px` }"
                    :title="worldReference(row.worldPath)"
                    @click="activateRow(row)"
                  >
                    <span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                      <ChevronRight v-if="rowIsFolder(row)" class="size-3.5 transition-transform duration-200 motion-reduce:transition-none" :class="expandedIds.has(row.key) && 'rotate-90'" />
                    </span>
                    <img v-if="row.node?.icon && !slotIconComponent(row.slot?.icon)" :src="row.node.icon" alt="" class="size-4 shrink-0 rounded-sm object-cover" />
                    <component v-else :is="iconFor(row)" class="size-4 shrink-0 text-muted-foreground" />
                    <Badge v-if="renamingKey !== row.key && rowBadgeLabel(row)" variant="secondary" class="max-w-24 shrink-0 truncate px-1.5 text-[10px] font-normal" :title="rowBadgeLabel(row)">{{ rowBadgeLabel(row) }}</Badge>
                    <span v-if="renamingKey !== row.key" class="whitespace-nowrap" :class="row.root && 'font-medium'">{{ row.label }}</span>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent class="w-48">
                  <ContextMenuItem @click="openSlotEditor(row.slot)"><PenSquare data-icon="inline-start" />编辑属性</ContextMenuItem>
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>选择方式</ContextMenuSubTrigger>
                    <ContextMenuSubContent class="w-36">
                      <ContextMenuItem @click="setSlotSelectionMode(row.slot, 'none')">{{ row.slot.selectionMode === 'none' ? '✓ ' : '' }}无选择</ContextMenuItem>
                      <ContextMenuItem @click="setSlotSelectionMode(row.slot, 'single')">{{ row.slot.selectionMode === 'single' ? '✓ ' : '' }}单选</ContextMenuItem>
                      <ContextMenuItem @click="setSlotSelectionMode(row.slot, 'multiple')">{{ row.slot.selectionMode === 'multiple' ? '✓ ' : '' }}多选</ContextMenuItem>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSeparator />
                  <ContextMenuItem variant="destructive" @click="removeSlot(row.slot)"><Trash2 data-icon="inline-start" />删除插槽</ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              <button
                v-else
                type="button"
                class="flex h-8 w-max min-w-full items-center gap-1 rounded-md pr-1 text-left text-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :class="[selectedKey === row.key && 'bg-muted text-foreground', renamingKey === row.key && 'flex-none']"
                :style="{ paddingLeft: `${Math.min(row.depth, 7) * 14 + 6}px` }"
                :title="worldReference(row.worldPath)"
                @click="activateRow(row)"
              >
                <span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                  <ChevronRight v-if="rowIsFolder(row)" class="size-3.5 transition-transform duration-200 motion-reduce:transition-none" :class="expandedIds.has(row.key) && 'rotate-90'" />
                </span>
                <img v-if="row.node?.icon && !slotIconComponent(row.slot?.icon)" :src="row.node.icon" alt="" class="size-4 shrink-0 rounded-sm object-cover" />
                <component v-else :is="iconFor(row)" class="size-4 shrink-0 text-muted-foreground" />
                <Badge v-if="renamingKey !== row.key && rowBadgeLabel(row)" variant="secondary" class="max-w-24 shrink-0 truncate px-1.5 text-[10px] font-normal" :title="rowBadgeLabel(row)">{{ rowBadgeLabel(row) }}</Badge>
                <span v-if="renamingKey !== row.key" class="whitespace-nowrap" :class="row.root && 'font-medium'">{{ row.label }}</span>
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
              <Switch
                v-if="activeTab !== 'assets' && row.togglePaths?.length"
                :model-value="row.enabled"
                size="sm"
                class="mx-1 shrink-0"
                :aria-label="`${row.label}启用状态`"
                @click.stop
                @update:model-value="setRowEnabled(row, Boolean($event))"
              />
              <DropdownMenu v-if="activeTab === 'assets'">
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon-sm" class="mr-0.5 size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 mobile:opacity-100" title="资源菜单" @click.stop>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" class="w-44">
                  <template v-if="row.key !== 'world:' && row.virtual !== 'global' && rowIsFolder(row)">
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
              </template>
            </PluginAssetTreeBranch>
          </div>
        </Transition>

        <p v-if="pluginStore.loaded && treeRows.length === 0" class="px-2 py-10 text-center text-sm text-muted-foreground">暂无资产</p>
        <p v-if="pluginStore.loadError || localError" class="px-2 py-3 text-xs leading-5 text-destructive">
          {{ localError || pluginStore.loadError }}
        </p>
      </div>
    </ScrollArea>

  <Dialog v-model:open="slotEditorOpen">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ slotEditorId ? '编辑插槽' : '新建插槽' }}</DialogTitle>
        <DialogDescription>定义共享插槽的标识、显示信息和可接受的资源后缀。</DialogDescription>
      </DialogHeader>
      <div class="grid gap-4">
        <label class="grid gap-1.5 text-sm font-medium">ID<Input v-model="slotDraft.id" placeholder="例如 context" /></label>
        <label class="grid gap-1.5 text-sm font-medium">标题<Input v-model="slotDraft.title" placeholder="显示名称" /></label>
        <label class="grid gap-1.5 text-sm font-medium">图标<Select :model-value="slotDraft.icon ?? 'none'" @update:model-value="slotDraft.icon = $event === 'none' ? undefined : String($event)"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">默认资源图标</SelectItem><SelectItem v-for="option in slotIconOptions" :key="option.value" :value="option.value">{{ option.label }}</SelectItem></SelectContent></Select></label>
        <label class="grid gap-1.5 text-sm font-medium">说明<Input v-model="slotDraft.description" placeholder="可选" /></label>
        <label class="grid gap-1.5 text-sm font-medium">允许的后缀<Textarea :model-value="slotDraft.contentSuffixes.join('\n')" class="min-h-20 font-mono text-xs" placeholder="md\nchat.json" @update:model-value="slotDraft.contentSuffixes = String($event ?? '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean)" /></label>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="slotEditorOpen = false">取消</Button>
        <Button @click="saveSlot">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  </aside>

</template>

<style scoped>
.tree-tab-forward-enter-active,
.tree-tab-forward-leave-active,
.tree-tab-backward-enter-active,
.tree-tab-backward-leave-active {
  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 160ms ease;
}

.tree-tab-forward-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.tree-tab-forward-leave-to {
  opacity: 0;
  transform: translateX(-100%);
}

.tree-tab-backward-enter-from {
  opacity: 0;
  transform: translateX(-100%);
}

.tree-tab-backward-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.tree-tab-forward-leave-active,
.tree-tab-backward-leave-active {
  position: absolute;
  inset-inline: 0;
}

@media (prefers-reduced-motion: reduce) {
  .tree-tab-forward-enter-active,
  .tree-tab-forward-leave-active,
  .tree-tab-backward-enter-active,
  .tree-tab-backward-leave-active {
    transition: none;
  }
}

:global(.mobile-layout) .asset-tree-panel {
  min-width: min(19rem, calc(100% - 1rem));
  max-width: calc(100% - 1rem);
}
</style>
