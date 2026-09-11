import { computed, ref, toValue } from "vue";
import { readFile } from "./pulse";
import { type ResourcePath, resourceType } from "./types";
import { type FileApiOptions, useFileApi } from "./use-file-api";

export interface OpenedFile {
	path: ResourcePath;
	zIndex: number;
	bounceKey: number;
	initialOffset: { x: number; y: number };
}

export interface FileLocateRequest {
	path: ResourcePath;
	timestamp: number;
}

/**
 * Per-file-tree editor state. File content stays in `usePluginData`; opening a
 * file therefore never creates a second editable resource snapshot.
 */
export function useOpenedFile(options: FileApiOptions) {
	const fileApi = useFileApi(options);
	const opened = ref<OpenedFile[]>([]);
	const locateRequest = ref<FileLocateRequest | null>(null);
	let zIndex = 100;
	let cascade = 0;
	function open(path: ResourcePath) {
		fileApi.read(path);
		const existing = opened.value.find((item) => item.path === path);
		if (existing) {
			existing.zIndex = ++zIndex;
			existing.bounceKey += 1;
			return existing;
		}
		const offset = cascade++ % 8;
		const item: OpenedFile = {
			path,
			zIndex: ++zIndex,
			bounceKey: 0,
			initialOffset: { x: offset * 28, y: offset * 28 },
		};
		opened.value.push(item);
		return item;
	}
	function close(path: ResourcePath) {
		opened.value = opened.value.filter((item) => item.path !== path);
	}
	function bringToFront(path: ResourcePath) {
		const item = opened.value.find((candidate) => candidate.path === path);
		if (item) item.zIndex = ++zIndex;
	}
	function locate(path: ResourcePath) {
		fileApi.read(path);
		locateRequest.value = { path, timestamp: Date.now() };
	}
	function file(path: ResourcePath) {
		return computed(() => {
			const data = toValue(options.filetree);
			if (!data) return null;
			try {
				return {
					path,
					content: readFile(data, path),
					meta: data.meta[path],
					type: resourceType(path),
				};
			} catch {
				return null;
			}
		});
	}
	return {
		...fileApi,
		opened,
		locateRequest,
		open,
		close,
		bringToFront,
		locate,
		file,
	};
}
