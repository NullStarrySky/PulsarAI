export type ResourcePath = string;

/** Directories are objects; every file is its exact authored string. */
export interface ResourceTree {
	[name: string]: ResourceNode;
}

export type ResourceNode = ResourceTree | string;

export type ResourceKind = "file" | "folder";

/** A serializable resource-tree entry returned by File API queries. */
export interface ResourceEntry {
	path: ResourcePath;
	name: string;
	kind: ResourceKind;
}

export interface FileMeta {
	resourceSelected: boolean;
	/** Logical path declared by the owning source's local.slot.json. */
	slot?: ResourcePath;
	priority: number;
	condition?: ResourceCondition[];
}

export interface ResourceCondition {
	type: string;
	param: Record<string, unknown>;
	link: "and" | "or" | "xor" | null;
}

export interface ResourceFile extends FileMeta {
	path: ResourcePath;
	content: string;
}

export interface ResourceStat extends ResourceEntry {
	meta: FileMeta | null;
}

export interface ResourceListResult {
	entries: ResourceEntry[];
	truncated: boolean;
}

export interface ResourceTreeEntry extends ResourceEntry {
	children?: ResourceTreeEntry[];
}

export interface ResourceTreeResult {
	entries: ResourceTreeEntry[];
	truncated: boolean;
}

export interface ResourceSearchMatch {
	path: ResourcePath;
	line: number;
	text: string;
	before: string[];
	after: string[];
}

export interface ResourceSearchResult {
	matches: ResourceSearchMatch[];
	truncated: boolean;
	nextOffset: number | null;
}

export interface ResourceReadLine {
	line: number;
	text: string;
}

export interface ResourceReadLinesResult {
	lines: ResourceReadLine[];
	truncated: boolean;
}

export type MetaMap = Record<ResourcePath, FileMeta>;

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
	/** Final path delta relative to the immutable original source. */
	recal: Recalculate;
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
	| { kind: "folder.mkdir"; path: ResourcePath }
	| { kind: "node.remove"; path: ResourcePath }
	| { kind: "node.move"; from: ResourcePath; to: ResourcePath }
	| { kind: "node.copy"; from: ResourcePath; to: ResourcePath };

/** A transient file operation; never persisted as an action log. */
export type Pulse = Atom;
/** Plain diff-match-patch tuples, retaining the exact baseline for validation. */
export type Edit = Array<[number, string]>;
export interface MetaEdit {
	set: Partial<FileMeta>;
	unset: Array<keyof FileMeta>;
}
export type Recalculate = Record<
	ResourcePath,
	| { delete: true }
	| {
			kind: "file";
			from: ResourcePath | null;
			edit: Edit | null;
			meta_edit: MetaEdit | null;
	  }
	| { kind: "folder"; from: ResourcePath | null }
>;
export interface RECAL {
	self: Recalculate;
	global: Record<string, Recalculate>;
}
export type ReplayGroups = RECAL[];

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
