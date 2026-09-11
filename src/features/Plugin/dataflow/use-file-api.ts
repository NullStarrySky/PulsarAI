import { type MaybeRefOrGetter, toValue } from "vue";
import { listFolder, parentPath, readFile, resolveNode } from "./pulse";
import type {
	FileMeta,
	FolderMeta,
	PluginData,
	Pulse,
	ResourcePath,
} from "./types";

export interface FileApiOptions {
	filetree: MaybeRefOrGetter<PluginData | null>;
	/** Must synchronously make the Pulse observable to filetree before it returns. */
	applyPulse: (pulse: Pulse) => void;
}

export function useFileApi(options: FileApiOptions) {
	function current() {
		const data = toValue(options.filetree);
		if (!data) throw new Error("Plugin 资源尚未加载。");
		return data;
	}
	function apply(pulse: Pulse) {
		options.applyPulse(pulse);
	}
	function exists(path: ResourcePath) {
		try {
			resolveNode(current().tree, path);
			return true;
		} catch {
			return false;
		}
	}
	function ensureParent(path: ResourcePath) {
		const parent = parentPath(path);
		if (parent && parent !== "/" && !exists(parent))
			apply({ kind: "folder.mkdir", path: parent });
	}
	return {
		read: (path: ResourcePath) => readFile(current(), path),
		ls: (path: ResourcePath = "/") => listFolder(current(), path),
		exists,
		write(path: ResourcePath, content: string) {
			ensureParent(path);
			apply({ kind: "file.write", path, content });
		},
		edit(path: ResourcePath, find: string, replace: string) {
			apply({ kind: "file.replace", path, find, replace });
		},
		mkdir(path: ResourcePath) {
			apply({ kind: "folder.mkdir", path });
		},
		remove(path: ResourcePath) {
			apply({ kind: "node.remove", path });
		},
		move(from: ResourcePath, to: ResourcePath) {
			ensureParent(to);
			apply({ kind: "node.move", from, to });
		},
		copy(from: ResourcePath, to: ResourcePath) {
			ensureParent(to);
			apply({ kind: "node.copy", from, to });
		},
		updateFileMeta(path: ResourcePath, patch: Partial<FileMeta>) {
			apply({ kind: "file.meta.patch", path, patch });
		},
		updateFolderMeta(path: ResourcePath, patch: Partial<FolderMeta>) {
			apply({ kind: "folder.meta.patch", path, patch });
		},
	};
}
