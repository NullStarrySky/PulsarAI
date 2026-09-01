export type WorldNodeId = string;

export type WorldFileType =
	| "markdown"
	| "chat"
	| "data"
	| "javascript"
	| "json"
	| "media"
	| "component"
	| "text";

export type WorldSlotSelectionMode = "none" | "single" | "multiple";

export interface WorldSlot {
	id: string;
	icon?: string;
	description?: string;
	allowedResourceTypes: WorldFileType[];
	selectionMode: WorldSlotSelectionMode;
}

interface WorldNodeBase {
	id: WorldNodeId;
	/** Display name only. Tree addresses always use stable node IDs. */
	name: string;
	icon?: string;
	description?: string;
	treeOrder: number;
	createDate: string;
	updateDate: string;
}

export interface WorldFolderNode extends WorldNodeBase {
	type: "folder";
	openIcon?: string;
	children: Record<WorldNodeId, WorldNode>;
	/** Present only on empty folders below /self/slot/. */
	selectionMode?: WorldSlotSelectionMode;
	allowedResourceTypes?: WorldFileType[];
}

export interface WorldFileNode extends WorldNodeBase {
	type: "file";
	content: unknown;
	resourceSelected: boolean;
	/** Absolute path of an empty contract folder below /self/slot/. */
	slot?: string;
	priority: number;
	condition?: string;
}

export type WorldNode = WorldFolderNode | WorldFileNode;

export interface WorldDocument {
	id: string;
	root: WorldFolderNode;
	createDate: string;
	updateDate: string;
}

export interface World {
	global: WorldDocument;
	self: WorldDocument;
}

export const globalWorldDocumentId = "global";

function nowWorldDate() {
	return new Date().toISOString();
}

export function createWorldFolder(
	name: string,
	input: Partial<
		Omit<
			WorldFolderNode,
			"id" | "type" | "name" | "children" | "createDate" | "updateDate"
		>
	> & {
		id?: string;
		children?: Record<WorldNodeId, WorldNode>;
	} = {},
): WorldFolderNode {
	const date = nowWorldDate();
	return {
		id: input.id ?? crypto.randomUUID(),
		type: "folder",
		name,
		treeOrder: input.treeOrder ?? 0,
		...(input.icon ? { icon: input.icon } : {}),
		...(input.description ? { description: input.description } : {}),
		...(input.openIcon ? { openIcon: input.openIcon } : {}),
		...(input.selectionMode ? { selectionMode: input.selectionMode } : {}),
		...(input.allowedResourceTypes
			? { allowedResourceTypes: input.allowedResourceTypes }
			: {}),
		children: input.children ?? {},
		createDate: date,
		updateDate: date,
	};
}

export function createWorldFile(
	name: string,
	content: unknown = "",
	input: Partial<
		Omit<
			WorldFileNode,
			"id" | "type" | "name" | "content" | "createDate" | "updateDate"
		>
	> & {
		id?: string;
	} = {},
): WorldFileNode {
	const date = nowWorldDate();
	return {
		id: input.id ?? crypto.randomUUID(),
		type: "file",
		name,
		content,
		treeOrder: input.treeOrder ?? 0,
		resourceSelected: input.resourceSelected ?? true,
		priority: input.priority ?? 100,
		...(input.icon ? { icon: input.icon } : {}),
		...(input.description ? { description: input.description } : {}),
		...(input.slot ? { slot: input.slot } : {}),
		...(input.condition ? { condition: input.condition } : {}),
		createDate: date,
		updateDate: date,
	};
}

export function createWorldDocument(
	id: string,
	rootName: string,
): WorldDocument {
	const date = nowWorldDate();
	return {
		id,
		root: createWorldFolder(rootName, { id: `${id}:root` }),
		createDate: date,
		updateDate: date,
	};
}

export function worldFileType(name: string): WorldFileType {
	const normalized = name.trim().toLowerCase();
	if (normalized.endsWith(".chat.json")) return "chat";
	if (normalized.endsWith(".data.json")) return "data";
	if (/\.(md|markdown)$/i.test(normalized)) return "markdown";
	if (/\.(js|mjs|cjs|ts)$/i.test(normalized)) return "javascript";
	if (/\.json$/i.test(normalized)) return "json";
	if (/\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|ogg|mov|m4v)$/i.test(normalized))
		return "media";
	if (/\.(vue|jsx|tsx)$/i.test(normalized)) return "component";
	return "text";
}
