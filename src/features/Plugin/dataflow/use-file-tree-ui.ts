import { type ComputedRef, computed, ref, toValue } from "vue";
import type {
	FileTreeAction,
	FileTreeActions,
	FileTreeNode,
} from "@/components/common/file-tree";
import { basename, isResourceTree, parentPath } from "./pulse";
import type {
	FolderMeta,
	ResourceMeta,
	ResourceNode,
	ResourcePath,
} from "./types";
import type { FileApiOptions } from "./use-file-api";
import { useOpenedFile } from "./use-opened-file";
import { useSlot } from "./use-slot";

type TabId = "local" | "global" | "slots";
type NodeKind = "file" | "folder";
type ChildRenderMode = "tree" | "slot" | "resource";

export interface FileTreeUiMeta {
	path: ResourcePath;
	tab: TabId;
	isRoot?: boolean;
	resourceMeta?: ResourceMeta;
	selectionMode?: FolderMeta["selectionMode"];
}

export interface FileTreeTab {
	id: TabId;
	metadata: { label: string; icon: string };
	tree: ComputedRef<FileTreeNode[]>;
	actionFn: (
		type: NodeKind,
		name: string,
		meta: FileTreeUiMeta,
	) => FileTreeActions | undefined;
	iconFn: (type: NodeKind, name: string, meta: FileTreeUiMeta) => string;
	childType: (
		type: NodeKind,
		name: string,
		meta: FileTreeUiMeta,
	) => ChildRenderMode;
}

interface ClipboardItem {
	type: "cut" | "copy";
	path: ResourcePath;
	nodeType: NodeKind;
}

const fileKinds = [
	{ id: "markdown", name: "Markdown", extension: ".md", icon: "file-text" },
	{ id: "chat", name: "聊天", extension: ".chat.json", icon: "message-square" },
	{ id: "data", name: "数据", extension: ".data.json", icon: "database" },
	{ id: "javascript", name: "JavaScript", extension: ".js", icon: "code" },
	{ id: "json", name: "JSON", extension: ".json", icon: "braces" },
	{ id: "component", name: "Vue 组件", extension: ".vue", icon: "component" },
	{ id: "media", name: "媒体", extension: ".png", icon: "image" },
	{ id: "text", name: "文本", extension: ".txt", icon: "file-text" },
];

function resourceIcon(name: string) {
	const normalized = name.toLowerCase();
	if (normalized.endsWith(".chat.json")) return "message-square";
	if (normalized.endsWith(".data.json")) return "database";
	if (/\.(md|markdown)$/i.test(normalized)) return "file-text";
	if (/\.(js|mjs|cjs|ts)$/i.test(normalized)) return "code";
	if (/\.json$/i.test(normalized)) return "braces";
	if (/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(normalized)) return "image";
	if (/\.(mp4|webm|ogg|mov|m4v)$/i.test(normalized)) return "film";
	if (/\.(vue|jsx|tsx)$/i.test(normalized)) return "component";
	return "file";
}

function join(parent: ResourcePath, name: string) {
	return parent === "/" ? `/${name}` : `${parent}/${name}`;
}

function uniqueDestination(
	exists: (path: ResourcePath) => boolean,
	parent: ResourcePath,
	name: string,
) {
	let candidate = join(parent, name);
	if (!exists(candidate)) return candidate;
	const dot = name.lastIndexOf(".");
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const suffix = dot > 0 ? name.slice(dot) : "";
	for (let index = 2; exists(candidate); index += 1)
		candidate = join(parent, `${stem}-${index}${suffix}`);
	return candidate;
}

/**
 * UI projection only: it never persists a second tree. All actions become
 * File API Pulses through `useOpenedFile` and `useSlot`.
 */
export function useFileTreeUI(options: FileApiOptions) {
	const opened = useOpenedFile(options);
	const slot = useSlot(options);
	const clipboard = ref<ClipboardItem | null>(null);
	const actionFn: FileTreeTab["actionFn"] = (type, _name, meta) => {
		if (meta.tab === "slots")
			return type === "file"
				? {
						open: {
							id: "open",
							name: "打开",
							icon: "folder-open",
							type: "file",
						},
					}
				: undefined;
		const canChange = !meta.isRoot;
		const canCreate = type === "folder";
		return {
			open: { id: "open", name: "打开", icon: "folder-open", type: "file" },
			"new-file": canCreate
				? {
						id: "new-file",
						name: "新建文件",
						icon: "file-plus-2",
						type: "folder",
						subActions: fileKinds.map((kind) => ({
							id: `add-file:${kind.id}`,
							name: `${kind.name} 文件`,
							icon: kind.icon,
							type: "folder",
						})),
					}
				: undefined,
			"new-folder": canCreate
				? {
						id: "new-folder",
						name: "新建文件夹",
						icon: "folder-plus",
						type: "folder",
					}
				: undefined,
			cut: canChange
				? { id: "cut", name: "剪切", icon: "scissors", separatorBefore: true }
				: undefined,
			copy: canChange ? { id: "copy", name: "复制", icon: "copy" } : undefined,
			paste:
				canCreate && clipboard.value
					? { id: "paste", name: "粘贴", icon: "clipboard-paste" }
					: undefined,
			"copy-path": {
				id: "copy-path",
				name: "复制路径",
				icon: "link",
				separatorBefore: true,
			},
			rename: canChange
				? {
						id: "rename",
						name: "重命名",
						icon: "pencil",
						separatorBefore: true,
						input: { placeholder: "新名称", value: () => _name },
					}
				: undefined,
			delete: canChange
				? { id: "delete", name: "删除", icon: "trash-2" }
				: undefined,
		};
	};
	const iconFn: FileTreeTab["iconFn"] = (type, name, meta) => {
		if (meta.tab === "slots" && type === "folder") return "box";
		return type === "folder" ? "folder" : resourceIcon(name);
	};
	const childType: FileTreeTab["childType"] = (type, _name, meta) => {
		if (meta.tab !== "slots") return "tree";
		return type === "folder" ? "slot" : "resource";
	};
	function treeNode(
		name: string,
		node: ResourceNode,
		path: ResourcePath,
		tab: Exclude<TabId, "slots">,
		isRoot = false,
	): FileTreeNode {
		const data = toValue(options.filetree);
		const meta: FileTreeUiMeta = {
			path,
			tab,
			isRoot,
			...(data?.meta[path] ? { resourceMeta: data.meta[path] } : {}),
			...(data?.meta[path] && "selectionMode" in data.meta[path]
				? { selectionMode: data.meta[path].selectionMode }
				: {}),
		};
		const type: NodeKind = isResourceTree(node) ? "folder" : "file";
		const tree = isResourceTree(node) ? node : null;
		return {
			id: `${tab}:${path}`,
			name,
			type,
			icon: iconFn(type, name, meta),
			...(type === "folder"
				? {
						openIcon: "folder-open",
						selectionMode: meta.selectionMode,
						children: Object.keys(tree ?? {})
							.filter(
								(child) => !(isRoot && tab === "local" && child === "global"),
							)
							.sort((left, right) => left.localeCompare(right))
							.map((child) =>
								treeNode(child, tree![child]!, join(path, child), tab),
							),
					}
				: {}),
			action: actionFn(type, name, meta),
			data: meta,
		};
	}
	const localTree = computed<FileTreeNode[]>(() => {
		const data = toValue(options.filetree);
		if (!data) return [];
		return [treeNode("本地", data.tree, "/", "local", true)];
	});
	const globalTree = computed<FileTreeNode[]>(() => {
		const data = toValue(options.filetree);
		if (!data || !isResourceTree(data.tree.global)) return [];
		return [treeNode("全局", data.tree.global, "/global", "global", true)];
	});
	const slotTree = computed<FileTreeNode[]>(() => {
		const resourceNode = (
			resource: (typeof slot.slots.value)[number]["resources"][number],
			parent: ResourcePath,
		): FileTreeNode => {
			const meta: FileTreeUiMeta = {
				path: resource.path,
				tab: "slots",
				resourceMeta: resource.meta,
			};
			return {
				id: `slots:${parent}:${resource.path}`,
				name: resource.name,
				type: "file",
				icon: iconFn("file", resource.name, meta),
				selectableResource: true,
				resourceSelected: resource.meta.resourceSelected,
				selectionMode: slot.get(parent)?.selectionMode,
				disableRowOpen: true,
				action: actionFn("file", resource.name, meta),
				data: meta,
			};
		};
		const slotNode = (
			entry: (typeof slot.slots.value)[number],
		): FileTreeNode => {
			const meta: FileTreeUiMeta = {
				path: entry.path,
				tab: "slots",
				selectionMode: entry.selectionMode,
			};
			return {
				id: `slots:${entry.path}`,
				name: entry.name,
				type: "folder",
				icon: entry.icon ?? iconFn("folder", entry.name, meta),
				openIcon: entry.icon ?? "box",
				selectionMode: entry.selectionMode,
				children: [
					...entry.children.map(slotNode),
					...entry.resources.map((resource) =>
						resourceNode(resource, entry.path),
					),
				],
				action: actionFn("folder", entry.name, meta),
				data: meta,
			};
		};
		return slot.tree.value.map(slotNode);
	});
	function runAction(
		node: FileTreeNode,
		action: FileTreeAction,
		value?: string,
	) {
		const meta = node.data as FileTreeUiMeta;
		const path = meta.path;
		if (action.id === "open") return opened.open(path);
		if (action.id === "copy-path") return navigator.clipboard.writeText(path);
		if (action.id === "cut" || action.id === "copy") {
			clipboard.value = { type: action.id, path, nodeType: node.type };
			return;
		}
		if (action.id === "delete") return opened.remove(path);
		if (action.id === "rename") {
			const name = value?.trim();
			if (!name || name === node.name || /[\\/]/.test(name)) return;
			return opened.move(path, join(parentPath(path) ?? "/", name));
		}
		if (action.id === "new-folder") {
			const destination = uniqueDestination(opened.exists, path, "folder");
			return opened.mkdir(destination);
		}
		if (action.id === "new-file" || action.id.startsWith("add-file:")) {
			const kind = fileKinds.find((entry) => action.id.endsWith(entry.id));
			const destination = uniqueDestination(
				opened.exists,
				path,
				`untitled${kind?.extension ?? ".txt"}`,
			);
			return opened.write(destination, "");
		}
		if (action.id !== "paste") return;
		const current = clipboard.value;
		if (!current) return;
		const destination = uniqueDestination(
			opened.exists,
			path,
			basename(current.path),
		);
		if (current.type === "cut") {
			clipboard.value = null;
			return opened.move(current.path, destination);
		}
		return opened.copy(current.path, destination);
	}
	function toggleResource(node: FileTreeNode, selected: boolean) {
		const meta = node.data as FileTreeUiMeta;
		if (meta.tab === "slots") {
			if (selected) slot.select(meta.path);
			else slot.unselect(meta.path);
		}
	}
	const tabs: Record<TabId, FileTreeTab> = {
		local: {
			id: "local",
			metadata: { label: "本地", icon: "folder" },
			tree: localTree,
			actionFn,
			iconFn,
			childType,
		},
		global: {
			id: "global",
			metadata: { label: "全局", icon: "globe" },
			tree: globalTree,
			actionFn,
			iconFn,
			childType,
		},
		slots: {
			id: "slots",
			metadata: { label: "插槽", icon: "box" },
			tree: slotTree,
			actionFn,
			iconFn,
			childType,
		},
	};
	return { ...opened, slot, tabs, runAction, toggleResource };
}
