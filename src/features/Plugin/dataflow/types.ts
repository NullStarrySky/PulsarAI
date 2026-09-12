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
export type MetaMap = Record<ResourcePath, ResourceMeta>;

/** One persisted local Plugin source document. */
export interface PluginData {
	id: string;
	tree: ResourceTree;
	meta: MetaMap;
}

export interface CharacterData {
	id: string;
	name: string;
	description?: string;
	avatarUrl?: string;
	coverUrl?: string;
}

/** Character is a live UI projection of its owning local Plugin. */
export function characterFromPlugin(
	localPluginId: string,
	plugin: PluginData,
): CharacterData {
	const source = plugin.tree["definition.package.json"];
	let definition: Record<string, unknown> = {};
	if (typeof source === "string") {
		try {
			const parsed: unknown = JSON.parse(source);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
				definition = parsed as Record<string, unknown>;
		} catch {
			// A broken authoring document still has a usable fallback projection.
		}
	}
	const text = (value: unknown) =>
		typeof value === "string" ? value : undefined;
	const avatar = plugin.tree["avatar.png"];
	const cover = plugin.tree["cover.png"];
	return {
		id: localPluginId,
		name: text(definition.name)?.trim() || "未命名角色",
		description: text(definition.description),
		avatarUrl: typeof avatar === "string" ? avatar : text(definition.avatar),
		coverUrl: typeof cover === "string" ? cover : text(definition.cover),
	};
}

/** A single replayable filesystem primitive. */
export type Atom =
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
	| "data"
	| "javascript"
	| "json"
	| "media"
	| "component"
	| "text";

export function resourceType(path: string): PluginResourceType {
	const normalized = path.trim().toLowerCase();
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

export function defaultFileMeta(): FileMeta {
	return { resourceSelected: true, priority: 100 };
}

export function defaultFolderMeta(): FolderMeta {
	return { selectionMode: "none" };
}
