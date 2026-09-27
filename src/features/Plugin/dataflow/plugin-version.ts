import { computed, type MaybeRefOrGetter, toRaw, toValue, watch } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { replayRecalculate, updateRecalculate } from "./recalculate";
import type { PluginData, PluginDocument, PluginVersion, Pulse } from "./types";
import { refreshCharacter } from "./use-plugin-data";

export function latestPluginVersion(document: PluginDocument) {
	return document.versions.at(-1) ?? null;
}

/** Scoped mutable version handle. Pinned and latest versions share one entrypoint. */
export function usePluginVersion(
	pluginId: MaybeRefOrGetter<string>,
	versionId?: MaybeRefOrGetter<string | undefined>,
) {
	const store = useSyncStore();
	const document = computed(() => store.plugins.get(toValue(pluginId)) ?? null);
	const version = computed(() => {
		const value = document.value;
		if (!value) return null;
		const requested = versionId ? toValue(versionId) : undefined;
		return requested !== undefined
			? (value.versions.find((item) => item.id === requested) ?? null)
			: latestPluginVersion(value);
	});
	watch(
		() =>
			document.value && version.value
				? {
						id: toValue(pluginId),
						version: version.value,
					}
				: null,
		(value) => {
			if (!value) return;
			store.markDirty({ type: "plugin", id: value.id });
			refreshCharacter(value.id);
		},
		{ deep: true, flush: "sync" },
	);
	return version;
}

/** Establish the initial version at creation/import, never during loading. */
export function preparePluginDocument(
	source: PluginData & { versions?: PluginVersion[] },
): PluginDocument {
	return {
		...source,
		versions: source.versions?.length
			? source.versions
			: [
					createPluginVersion(
						{ id: source.id, tree: source.tree, meta: source.meta },
						[],
					),
				],
	};
}

export function replayPluginVersion(
	document: PluginDocument,
	versionId: string,
): PluginData {
	const version = document.versions.find((item) => item.id === versionId);
	if (!version) throw new Error(`Plugin 版本不存在：${versionId}`);
	const original = toRaw(document);
	return replayRecalculate(
		{ id: original.id, tree: original.tree, meta: original.meta },
		version.recal,
	);
}

function versionId() {
	return `${crypto.randomUUID().replaceAll("-", "")}${Date.now()
		.toString(16)
		.padStart(8, "0")}`.slice(-40);
}

/** Creates a new mutable head. Referenced heads are never changed again. */
export function createPluginVersion(
	document: PluginData | PluginDocument,
	pending: readonly Pulse[],
): PluginVersion {
	const previous =
		"versions" in document ? latestPluginVersion(document) : null;
	const createdAt = new Date().toISOString();
	const recal = pending.reduce(
		(delta, pulse) => updateRecalculate(document, delta, pulse),
		previous?.recal ?? {},
	);
	const parentId = previous?.id ?? null;
	return { id: versionId(), parentId, createdAt, recal };
}

/** Update one unreferenced head against the immutable original source. */
export function appendPluginVersion(
	document: PluginData,
	version: PluginVersion,
	pulse: Pulse,
) {
	version.recal = updateRecalculate(document, version.recal, pulse);
	return version;
}
