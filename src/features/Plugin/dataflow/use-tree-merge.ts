import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { clonePluginData } from "./pulse";
import { defaultFolderMeta, type PluginData, type ResourceMeta } from "./types";

export type GlobalPluginData = Record<string, PluginData>;

function set<T>(target: Record<string, T>, key: string, value: T) {
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

/**
 * Creates the one runtime tree addressed by File API. The `global` folder is a
 * virtual mount and therefore reserved in local Plugin source trees.
 */
export function useTreeMerge(
	local: MaybeRefOrGetter<PluginData | null>,
	global: MaybeRefOrGetter<GlobalPluginData>,
) {
	return computed(() => {
		const localData = toValue(local);
		if (!localData) return null;
		const merged = clonePluginData(localData);
		if (Object.hasOwn(merged.tree, "global"))
			throw new Error("本地 Plugin 根目录保留 global 名称给全局资源挂载。");
		const globalTree: PluginData["tree"] = {};
		set(merged.tree, "global", globalTree);
		set(merged.meta, "/global", defaultFolderMeta());
		for (const [pluginId, data] of Object.entries(toValue(global))) {
			if (!pluginId || pluginId.includes("/"))
				throw new Error(`无效的全局 Plugin ID：${pluginId}`);
			const mount = `/global/${pluginId}`;
			const source = clonePluginData(data);
			set(globalTree, pluginId, source.tree);
			set(merged.meta, mount, defaultFolderMeta());
			mountMeta(merged.meta, source, mount);
		}
		return merged;
	});
}
