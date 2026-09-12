import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { clonePluginData } from "./pulse";
import { defaultFolderMeta, type PluginData, type ResourceMeta } from "./types";

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
		const meta = structuredClone(value) as ResourceMeta;
		if ("slot" in meta && meta.slot) meta.slot = mountedPath(mount, meta.slot);
		if ("parent" in meta && meta.parent)
			meta.parent = meta.parent.startsWith("/slot/")
				? meta.parent
				: mountedPath(mount, meta.parent);
		set(target, mountedPath(mount, path), meta);
	}
}

/** Merges already-replayed sources into the one tree addressed by File API. */
export function mergePluginData(
	localData: PluginData,
	global: GlobalPluginData,
) {
	const merged = clonePluginData(localData);
	if (Object.hasOwn(merged.tree, "global"))
		throw new Error("本地 Plugin 根目录保留 global 名称给全局资源挂载。");
	const globalTree: PluginData["tree"] = {};
	set(merged.tree, "global", globalTree);
	set(merged.meta, "/global", defaultFolderMeta());
	for (const [folder, data] of Object.entries(global)) {
		if (!folder || folder.includes("/"))
			throw new Error(`无效的全局 Plugin 文件夹名称：${folder}`);
		const mount = `/global/${folder}`;
		const source = clonePluginData(data);
		set(globalTree, folder, source.tree);
		set(merged.meta, mount, defaultFolderMeta());
		mountMeta(merged.meta, source, mount);
	}
	return merged;
}

export function useTreeMerge(
	local: MaybeRefOrGetter<PluginData | null>,
	global: MaybeRefOrGetter<GlobalPluginData>,
) {
	return computed(() => {
		const localData = toValue(local);
		return localData ? mergePluginData(localData, toValue(global)) : null;
	});
}
