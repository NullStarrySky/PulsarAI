import { normalizeResourcePath } from "../dataflow/pulse";
import {
	defaultFileMeta,
	type FileMeta,
	type PluginData,
	type ResourcePath,
	type ResourceTree,
} from "../dataflow/types";
import {
	generateProceduralAvatarDataUrl,
	generateProceduralCoverDataUrl,
} from "./procedural-cover";

type BuiltinManifest = {
	plugin: { id: string };
	nodes: Record<
		string,
		{
			order?: number;
			insertion?: { slot: ResourcePath; condition?: FileMeta["condition"] };
		}
	>;
};

const builtinManifests = import.meta.glob("../builtIn/*/.pulsar-plugin.json", {
	eager: true,
	query: "?raw",
	import: "default",
}) as Record<string, string>;
const builtinTextFiles = import.meta.glob(
	"../builtIn/*/**/*.{md,json,js,vue,ts,txt,data,yaml,yml}",
	{ eager: true, query: "?raw", import: "default" },
) as Record<string, string>;
const builtinAssets = import.meta.glob("../builtIn/*/**/*", {
	eager: true,
	query: "?url",
	import: "default",
}) as Record<string, string>;

function set(target: object, key: string, value: unknown) {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		configurable: true,
		writable: true,
	});
}

function ensureFolder(data: PluginData, path: ResourcePath) {
	const normalized = normalizeResourcePath(path);
	if (normalized === "/") return data.tree;
	let tree = data.tree;
	for (const name of normalized.slice(1).split("/")) {
		const existing = tree[name];
		if (typeof existing === "string")
			throw new Error(`内置资源目录冲突：${normalized}`);
		if (!existing) {
			const next: ResourceTree = {};
			set(tree, name, next);
			tree = next;
		} else tree = existing;
	}
	return tree;
}

function writeBuiltinFile(
	data: PluginData,
	path: ResourcePath,
	content: string,
	meta: FileMeta,
) {
	const normalized = normalizeResourcePath(path);
	const parent = ensureFolder(
		data,
		normalized.slice(0, normalized.lastIndexOf("/")) || "/",
	);
	set(parent, normalized.slice(normalized.lastIndexOf("/") + 1), content);
	set(data.meta, normalized, meta);
}

function sourceKey(folder: string, path: string) {
	return `../builtIn/${folder}/${path.replace(/^\//, "")}`;
}

function importBuiltinPlugin(
	folder: string,
	manifestSource: string,
): PluginData {
	const manifest = JSON.parse(manifestSource) as BuiltinManifest;
	const data: PluginData = { id: manifest.plugin.id, tree: {}, meta: {} };
	for (const path of Object.keys(manifest.nodes)
		.filter((path) => path !== "/")
		.sort((left, right) => left.localeCompare(right))) {
		const source = sourceKey(folder, path);
		const text = builtinTextFiles[source];
		const asset = builtinAssets[source];
		if (text === undefined && asset === undefined) {
			ensureFolder(data, `/${path}`);
			continue;
		}
		const definition = manifest.nodes[path]!;
		writeBuiltinFile(data, `/${path}`, text ?? asset ?? "", {
			...defaultFileMeta(),
			resourceSelected: manifest.plugin.id !== "builtin-blank-plugin",
			priority: definition.order ?? 100,
			...(definition.insertion
				? {
						slot: definition.insertion.slot,
						condition: definition.insertion.condition,
					}
				: {}),
		});
	}
	return data;
}

/** Built-ins are ordinary source trees; their slot declarations are ordinary JSON files. */
export function importBuiltinPlugins() {
	return Object.fromEntries(
		Object.entries(builtinManifests).map(([key, source]) => {
			const folder = key.split("/").at(-2);
			if (!folder) throw new Error(`无效的内置 Plugin 文件夹：${key}`);
			return [folder, importBuiltinPlugin(folder, source)];
		}),
	);
}

function defaultGlobalSlotSource() {
	const source = builtinTextFiles["../builtIn/default/global.slot.json"];
	if (!source) throw new Error("内置默认 Plugin 缺少 global.slot.json。");
	return source;
}

/** New local Plugins copy the default built-in's file-defined slot contract. */
export function createLocalPluginData(id: string): PluginData {
	const data: PluginData = { id, tree: {}, meta: {} };
	const slots = defaultGlobalSlotSource();
	writeBuiltinFile(data, "/global.slot.json", slots, defaultFileMeta());
	writeBuiltinFile(data, "/local.slot.json", slots, defaultFileMeta());
	writeBuiltinFile(
		data,
		"/definition.package.json",
		JSON.stringify(
			{
				schemaVersion: 1,
				name: "新角色",
				tags: [],
				globalPlugins: ["core", "default"],
			},
			null,
			2,
		),
		defaultFileMeta(),
	);
	writeBuiltinFile(
		data,
		"/avatar.png",
		generateProceduralAvatarDataUrl(id, "新角色"),
		defaultFileMeta(),
	);
	writeBuiltinFile(
		data,
		"/cover.png",
		generateProceduralCoverDataUrl(id, "新角色"),
		defaultFileMeta(),
	);
	writeBuiltinFile(
		data,
		"/config.json",
		JSON.stringify(
			{ temperature: 0.7, maxTokens: 2048, debugMode: false, promptPrefix: "" },
			null,
			2,
		),
		defaultFileMeta(),
	);
	return data;
}
