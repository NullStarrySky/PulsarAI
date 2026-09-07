import { useDebounceFn } from "@vueuse/core";
import {
	computed,
	inject,
	onBeforeUnmount,
	provide,
	reactive,
	ref,
	toRaw,
	toValue,
	watch,
	type InjectionKey,
	type MaybeRefOrGetter,
} from "vue";
import { useWorld, type WorldScope } from "../tree/world-store";
import type { WorldFileNode, WorldFolderNode } from "../tree/world-types";

/** The conversation host provides this once; plugin views never construct another World. */
export const PluginWorldScopeKey: InjectionKey<MaybeRefOrGetter<WorldScope>> =
	Symbol("PluginWorldScope");

export function providePluginWorldScope(scope: MaybeRefOrGetter<WorldScope>) {
	provide(PluginWorldScopeKey, scope);
}

export function usePluginWorld() {
	const scope = inject(PluginWorldScopeKey, null);
	if (!scope) throw new Error("Plugin Vue 组件只能在 Conversation World scope 中运行。");
	return useWorld(scope);
}

export function useFile(path: MaybeRefOrGetter<string>) {
	const world = usePluginWorld();
	const resource = computed(() =>
		world.resources.value.find((item) => item.path === toValue(path)) ?? null,
	);
	const file = computed(() => resource.value?.file ?? null);
	return {
		world,
		path: computed(() => toValue(path)),
		resource,
		file,
		exists: computed(() => Boolean(file.value)),
		read: () => world.read(toValue(path)),
		write: (content: unknown) => world.write(toValue(path), content),
		update: (patch: Partial<WorldFileNode>) => world.updateFile(toValue(path), patch),
		remove: () => world.remove(toValue(path)),
	};
}

export function useFolder(path: MaybeRefOrGetter<string>) {
	const world = usePluginWorld();
	const folder = computed(() => {
		try {
			const node = world.resolve(toValue(path)).node;
			return node.type === "folder" ? node : null;
		} catch {
			return null;
		}
	});
	return {
		world,
		path: computed(() => toValue(path)),
		folder,
		children: computed(() => world.ls(toValue(path))),
		exists: computed(() => Boolean(folder.value)),
		mkdir: (name: string) => world.createFolder(toValue(path), name),
		createFile: (name: string, content?: unknown) => world.createFile(toValue(path), name, content),
		update: (patch: Partial<WorldFolderNode>) => world.updateFolder(toValue(path), patch),
		remove: () => world.remove(toValue(path)),
	};
}

export function useSlot(path: MaybeRefOrGetter<string>) {
	const world = usePluginWorld();
	const slot = computed(() =>
		world.slots.value.find((item) => item.path === toValue(path)) ?? null,
	);
	return {
		world,
		path: computed(() => toValue(path)),
		slot,
		resources: computed(() => slot.value?.resources ?? []),
		allResources: computed(() => slot.value?.allResources ?? []),
	};
}

type FileContent = string | Record<string, unknown> | unknown[] | null;

function copyContent(value: unknown): FileContent {
	return typeof value === "string" ? value : structuredClone(value ?? null) as FileContent;
}

function equalContent(left: unknown, right: unknown) {
	return JSON.stringify(toRaw(left)) === JSON.stringify(toRaw(right));
}

/**
 * A draft is intentionally local. Persistence still routes through one full
 * `world.write`, so it remains a normal Pulse and cannot bypass replay rules.
 */
export function useFileContent(path: MaybeRefOrGetter<string>, delay = 350) {
	const { world, file } = useFile(path);
	const value = ref<FileContent>("");
	const base = ref<FileContent>("");
	const dirty = ref(false);
	const saving = ref(false);
	const error = ref<unknown>(null);
	const conflict = ref(false);
	let applying = false;
	let queue = Promise.resolve();

	function replace(content: unknown) {
		applying = true;
		const next = copyContent(content);
		base.value = copyContent(content);
		value.value = typeof next === "string" ? next : reactive(next as object) as FileContent;
		dirty.value = false;
		conflict.value = false;
		applying = false;
	}

	function current() {
		return structuredClone(toRaw(value.value));
	}

	async function save(destination = toValue(path)) {
		if (!dirty.value || !file.value) return;
		const snapshot = current();
		queue = queue.then(async () => {
			saving.value = true;
			error.value = null;
			try {
				await world.write(destination, snapshot);
				base.value = copyContent(snapshot);
				dirty.value = !equalContent(value.value, snapshot);
				conflict.value = false;
			} catch (cause) {
				error.value = cause;
				throw cause;
			} finally {
				saving.value = false;
			}
		});
		return queue.catch(() => undefined);
	}

	const schedule = useDebounceFn(() => void save(), delay);

	watch(
		file,
		(next) => {
			if (!next) return;
			if (dirty.value) {
				if (!equalContent(next.content, base.value)) conflict.value = true;
				return;
			}
			replace(next.content);
		},
		{ immediate: true, deep: false },
	);
	watch(
		value,
		(next) => {
			if (applying) return;
			dirty.value = !equalContent(next, base.value);
			if (dirty.value) schedule();
		},
		{ deep: true },
	);

	async function flush(destination = toValue(path)) {
		schedule.cancel();
		await save(destination);
	}
	function reset() {
		schedule.cancel();
		replace(base.value);
	}

	watch(() => toValue(path), (_next, previous) => { void flush(previous); });
	onBeforeUnmount(() => { void flush(); });
	return { value, dirty, saving, error, conflict, flush, reset };
}
