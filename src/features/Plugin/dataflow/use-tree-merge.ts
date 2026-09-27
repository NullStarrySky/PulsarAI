import { replayPluginData } from "./recalculate";
import type { PluginData, ReplayGroups } from "./types";

export type GlobalPluginData = Record<string, PluginData>;

function set(target: object, key: string, value: unknown) {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		configurable: true,
		writable: true,
	});
}

function mountedPath(mount: string, path: string) {
	return path === "/" ? mount : `${mount}${path}`;
}

function mountMeta(
	target: PluginData["meta"],
	source: PluginData,
	mount: string,
) {
	for (const [path, value] of Object.entries(source.meta)) {
		set(target, mountedPath(mount, path), value);
		delete source.meta[path];
	}
}

/** Merges already-replayed sources into the one tree addressed by File API. */
export function mergePluginData(
	localData: PluginData,
	global: GlobalPluginData,
) {
	const merged = localData;
	if (Object.hasOwn(merged.tree, "global"))
		throw new Error("本地 Plugin 根目录保留 global 名称给全局资源挂载。");
	const globalTree: PluginData["tree"] = {};
	set(merged.tree, "global", globalTree);
	for (const [folder, data] of Object.entries(global)) {
		if (!folder || folder.includes("/"))
			throw new Error(`无效的全局 Plugin 文件夹名称：${folder}`);
		const mount = `/global/${folder}`;
		set(globalTree, folder, data.tree);
		mountMeta(merged.meta, data, mount);
	}
	return merged;
}

/** Replays and mounts every source, including inactive sources visible to resource UI. */
export function replayAndMergePluginData(
	local: PluginData,
	global: GlobalPluginData,
	groups: ReplayGroups,
) {
	const replayedLocal = replayPluginData(
		local,
		groups.map((group) => group.self),
	);
	const replayedGlobal: GlobalPluginData = {};
	for (const [folder, source] of Object.entries(global))
		Object.defineProperty(replayedGlobal, folder, {
			value: replayPluginData(
				source,
				groups.map((group) =>
					Object.hasOwn(group.global, folder) ? group.global[folder]! : {},
				),
			),
			enumerable: true,
		});
	return mergePluginData(replayedLocal, replayedGlobal);
}
