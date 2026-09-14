export type ResourcePath = string;

/** Directories are objects; every file is its exact authored string. */
export interface ResourceTree {
	[name: string]: ResourceNode;
}

export type ResourceNode = ResourceTree | string;

export interface FolderMeta {
	selectionMode: "none" | "single" | "multiple";
	/** Optional source-local global-slot path for a local slot folder. */
	parent?: ResourcePath;
}

export interface FileMeta {
	resourceSelected: boolean;
	/** Stable source-local path of a slot below localSlot/. */
	slot?: ResourcePath;
	priority: number;
	condition?: string;
	/** Defaults to enabled; false keeps the authored condition without applying it. */
	conditionEnabled?: boolean;
}

export type ResourceMeta = FolderMeta | FileMeta;
type MetaMap = Record<ResourcePath, ResourceMeta>;

/** Original source or replayed in-memory projection, without version history. */
export interface PluginData {
	id: string;
	tree: ResourceTree;
	meta: MetaMap;
}

/** A saved projection from the original Plugin source. It stays mutable until a chat uses it. */
export interface PluginVersion {
	id: string;
	parentId: string | null;
	createdAt: string;
	/** Compacted cumulative Pulses replayed directly over the original source. */
	pulses: Pulse[];
}

/** The on-disk Plugin record: immutable original content plus saved versions. */
export interface PluginDocument extends PluginData {
	versions: PluginVersion[];
}

/** A single replayable filesystem primitive. */
type Atom =
	| { kind: "file.write"; path: ResourcePath; content: string }
	| { kind: "file.replace"; path: ResourcePath; find: string; replace: string }
	| { kind: "file.meta.patch"; path: ResourcePath; patch: Partial<FileMeta> }
	| {
			kind: "folder.meta.patch";
			path: ResourcePath;
			patch: Partial<FolderMeta>;
	  }
	| { kind: "folder.mkdir"; path: ResourcePath }
	| { kind: "node.remove"; path: ResourcePath }
	| { kind: "node.move"; from: ResourcePath; to: ResourcePath }
	| { kind: "node.copy"; from: ResourcePath; to: ResourcePath };

/** A Pulse is intentionally one primitive; a message version owns Pulse[]. */
export type Pulse = Atom;
export type ReplayGroups = Pulse[][];

export type PluginResourceType =
	| "markdown"
	| "chat"
	| "javascript"
	| "json"
	| "media"
	| "component"
	| "text";

export function resourceType(path: string): PluginResourceType {
	const normalized = path.trim().toLowerCase();
	if (normalized.endsWith(".chat.json")) return "chat";
	if (/\.(md|markdown)$/i.test(normalized)) return "markdown";
	if (/\.(js|mjs|cjs|ts)$/i.test(normalized)) return "javascript";
	if (/\.json$/i.test(normalized)) return "json";
	if (/\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|ogg|mov|m4v)$/i.test(normalized))
		return "media";
	if (/\.(vue|jsx|tsx)$/i.test(normalized)) return "component";
	return "text";
}

export function defaultFileMeta(): FileMeta {
	return { resourceSelected: true, priority: 100 };
}

export function defaultFolderMeta(): FolderMeta {
	return { selectionMode: "none" };
}
