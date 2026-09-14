import { computed, type MaybeRefOrGetter, toValue } from "vue";
import {
	applyPulse,
	clonePluginData,
	findResources,
	listFolder,
	normalizeResourcePath,
	parentPath,
	parsePluginPath,
	readFile,
	resolveNode,
	searchResources,
	statResource,
	treeResources,
} from "./pulse";
import { unzipResources, zipResources } from "./resource-archive";
import type {
	FileMeta,
	FolderMeta,
	PluginData,
	Pulse,
	ResourceKind,
	ResourcePath,
	ResourceReadLinesResult,
} from "./types";

export interface FileApiOptions {
	filetree: MaybeRefOrGetter<PluginData | null>;
	/** Must synchronously make the Pulse observable to filetree before it returns. */
	applyPulse: (pulse: Pulse) => void;
}

export interface FileApiListOptions {
	limit?: number;
}

export interface FileApiFindOptions extends FileApiListOptions {
	name?: string;
	kind?: ResourceKind;
}

export interface FileApiSearchOptions extends FileApiListOptions {
	context?: number;
	offset?: number;
	caseSensitive?: boolean;
	regex?: boolean;
	wholeWord?: boolean;
	maxDepth?: number;
	extensions?: string[];
}

export interface FileApiTreeOptions extends FileApiListOptions {
	maxDepth?: number;
}

export interface FileApiReadLinesOptions extends FileApiListOptions {
	startLine?: number;
	endLine?: number;
}

export interface FileApiEditOptions {
	all?: boolean;
	expectedMatches?: number;
}

export interface FileApiCreateOptions {
	parents?: boolean;
}

export interface FileApiWriteOptions extends FileApiCreateOptions {
	overwrite?: boolean;
}

export interface FileApiMkdirOptions extends FileApiCreateOptions {
	existOk?: boolean;
}

export interface FileApiRemoveOptions {
	missingOk?: boolean;
}

function positiveInteger(value: number, name: string) {
	if (!Number.isInteger(value) || value < 1)
		throw new Error(`${name}必须是正整数：${value}`);
}

function countMatches(content: string, find: string) {
	let count = 0;
	let index = 0;
	while (true) {
		index = content.indexOf(find, index);
		if (index < 0) return count;
		count += 1;
		index += find.length;
	}
}

export function useFileApi(options: FileApiOptions) {
	let transactionData: PluginData | null = null;
	let transactionPulses: Pulse[] | null = null;

	function current() {
		if (transactionData) return transactionData;
		const data = toValue(options.filetree);
		if (!data) throw new Error("Plugin 资源尚未加载。");
		return data;
	}
	function applyAll(pulses: Pulse[]) {
		if (transactionData && transactionPulses) {
			const projected = clonePluginData(transactionData);
			for (const pulse of pulses) applyPulse(projected, pulse);
			transactionData = projected;
			transactionPulses.push(...pulses);
			return;
		}
		const projected = clonePluginData(current());
		for (const pulse of pulses) applyPulse(projected, pulse);
		for (const pulse of pulses) options.applyPulse(pulse);
	}
	function apply(pulse: Pulse) {
		applyAll([pulse]);
	}
	function exists(path: ResourcePath) {
		try {
			resolveNode(current().tree, path);
			return true;
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("资源不存在："))
				return false;
			throw error;
		}
	}
	function missingParent(path: ResourcePath) {
		const parent = parentPath(path);
		if (!parent || parent === "/" || exists(parent)) return [];
		return [{ kind: "folder.mkdir", path: parent } as const];
	}
	function destinationPulses(
		path: ResourcePath,
		options: FileApiWriteOptions = {},
	) {
		const normalized = normalizeResourcePath(path);
		const parent = parentPath(normalized);
		if (
			options.parents === false &&
			parent &&
			parent !== "/" &&
			!exists(parent)
		)
			throw new Error(`目标父目录不存在：${parent}`);
		if (!exists(normalized))
			return options.parents === false ? [] : missingParent(normalized);
		if (!options.overwrite) throw new Error(`目标路径已存在：${normalized}`);
		return [{ kind: "node.remove", path: normalized } as const];
	}
	function pathsOverlap(left: ResourcePath, right: ResourcePath) {
		const source = normalizeResourcePath(left);
		const target = normalizeResourcePath(right);
		return (
			source === target ||
			source.startsWith(`${target}/`) ||
			target.startsWith(`${source}/`)
		);
	}
	function requireSameSource(left: ResourcePath, right: ResourcePath) {
		const source = parsePluginPath(left);
		const target = parsePluginPath(right);
		if (
			source.scope !== target.scope ||
			(source.scope === "global" &&
				target.scope === "global" &&
				source.folder !== target.folder)
		)
			throw new Error("移动或复制不能跨 Plugin 来源。");
	}
	function transaction<T>(run: () => T | Promise<T>) {
		if (transactionData) return run();
		transactionData = clonePluginData(current());
		transactionPulses = [];
		const commit = (value: T) => {
			const pulses = transactionPulses!;
			transactionData = null;
			transactionPulses = null;
			for (const pulse of pulses) options.applyPulse(pulse);
			return value;
		};
		const rollback = (error: unknown): never => {
			transactionData = null;
			transactionPulses = null;
			throw error;
		};
		try {
			const result = run();
			return result instanceof Promise ? result.then(commit, rollback) : commit(result);
		} catch (error) {
			return rollback(error);
		}
	}
	function useFileContent(path: MaybeRefOrGetter<ResourcePath>) {
		return computed({
			get: () => readFile(current(), toValue(path)),
			set: (content: string) => {
				const resolved = toValue(path);
				if (content !== readFile(current(), resolved))
					apply({ kind: "file.write", path: resolved, content });
			},
		});
	}
	return {
		useFileContent,
		read: (path: ResourcePath) => readFile(current(), path),
		stat: (path: ResourcePath) => statResource(current(), path),
		list: (path: ResourcePath = "/", options: FileApiListOptions = {}) =>
			listFolder(current(), path, options.limit ?? 100),
		find: (path: ResourcePath = "/", options: FileApiFindOptions = {}) =>
			findResources(
				current(),
				path,
				(entry) =>
					(!options.name || entry.name.includes(options.name)) &&
					(!options.kind || entry.kind === options.kind),
				options.limit ?? 100,
			),
		search: (
			query: string,
			path: ResourcePath = "/",
			options: FileApiSearchOptions = {},
		) =>
			searchResources(
				current(),
				query,
				path,
				options,
			),
		tree: (path: ResourcePath = "/", options: FileApiTreeOptions = {}) =>
			treeResources(current(), path, options),
		readLines(
			path: ResourcePath,
			options: FileApiReadLinesOptions = {},
		): ResourceReadLinesResult {
			const startLine = options.startLine ?? 1;
			const limit = options.limit ?? 100;
			positiveInteger(startLine, "起始行");
			positiveInteger(limit, "行数上限");
			if (options.endLine !== undefined) {
				positiveInteger(options.endLine, "结束行");
				if (options.endLine < startLine)
					throw new Error("结束行不能小于起始行。");
			}
			const lines = readFile(current(), path).split("\n");
			const selected = lines.slice(startLine - 1, options.endLine);
			return {
				lines: selected.slice(0, limit).map((text, index) => ({
					line: startLine + index,
					text,
				})),
				truncated: selected.length > limit,
			};
		},
		exists,
		write(
			path: ResourcePath,
			content: string,
			options: FileApiWriteOptions = {},
		) {
			const existing = exists(path);
			if (existing && options.overwrite === false)
				throw new Error(`目标路径已存在：${normalizeResourcePath(path)}`);
			applyAll([
				...(existing ? [] : destinationPulses(path, options)),
				{ kind: "file.write", path, content },
			]);
		},
		edit(
			path: ResourcePath,
			find: string,
			replace: string,
			options: FileApiEditOptions = {},
		) {
			const content = readFile(current(), path);
			if (!find) throw new Error(`待替换文本不能为空：${path}`);
			const matches = countMatches(content, find);
			if (!matches)
				throw new Error(`文件中未找到待替换文本：${path}`);
			if (options.expectedMatches !== undefined) {
				if (!Number.isInteger(options.expectedMatches) || options.expectedMatches < 0)
					throw new Error(`预期匹配数必须是非负整数：${options.expectedMatches}`);
				if (matches !== options.expectedMatches)
					throw new Error(
						`待替换文本匹配数不符：期望 ${options.expectedMatches}，实际 ${matches}：${path}`,
					);
			}
			// Persist the resulting field value so repeated edits can be compacted.
			apply({
				kind: "file.write",
				path,
				content: options.all
					? content.replaceAll(find, () => replace)
					: content.replace(find, () => replace),
			});
			return { matches: options.all ? matches : 1 };
		},
		mkdir(path: ResourcePath, options: FileApiMkdirOptions = {}) {
			const normalized = normalizeResourcePath(path);
			if (options.existOk === false && exists(normalized))
				throw new Error(`目标路径已存在：${normalized}`);
			const parent = parentPath(normalized);
			if (
				options.parents === false &&
				parent &&
				parent !== "/" &&
				!exists(parent)
			)
				throw new Error(`目标父目录不存在：${parent}`);
			apply({ kind: "folder.mkdir", path });
		},
		remove(path: ResourcePath, options: FileApiRemoveOptions = {}) {
			if (!exists(path)) {
				if (options.missingOk) return;
				throw new Error(`资源不存在：${normalizeResourcePath(path)}`);
			}
			apply({ kind: "node.remove", path });
		},
		move(
			from: ResourcePath,
			to: ResourcePath,
			options: FileApiWriteOptions = {},
		) {
			if (pathsOverlap(from, to))
				throw new Error("移动路径不能相同、互为父子级。");
			requireSameSource(from, to);
			applyAll([
				...destinationPulses(to, options),
				{ kind: "node.move", from, to },
			]);
		},
		copy(
			from: ResourcePath,
			to: ResourcePath,
			options: FileApiWriteOptions = {},
		) {
			if (pathsOverlap(from, to))
				throw new Error("复制路径不能相同、互为父子级。");
			requireSameSource(from, to);
			applyAll([
				...destinationPulses(to, options),
				{ kind: "node.copy", from, to },
			]);
		},
		append(
			path: ResourcePath,
			content: string,
			options: FileApiCreateOptions = {},
		) {
			if (!exists(path)) {
				applyAll([
					...destinationPulses(path, { ...options, overwrite: false }),
					{ kind: "file.write", path, content },
				]);
				return;
			}
			apply({
				kind: "file.write",
				path,
				content: `${readFile(current(), path)}${content}`,
			});
		},
		touch(path: ResourcePath, options: FileApiCreateOptions = {}) {
			if (exists(path)) {
				if (statResource(current(), path).kind !== "file")
					throw new Error(`不能创建文件覆盖文件夹：${path}`);
				return;
			}
			applyAll([
				...destinationPulses(path, { ...options, overwrite: false }),
				{ kind: "file.write", path, content: "" },
			]);
		},
		rmdir(path: ResourcePath, options: FileApiRemoveOptions = {}) {
			if (!exists(path)) {
				if (options.missingOk) return;
				throw new Error(`资源不存在：${normalizeResourcePath(path)}`);
			}
			if (statResource(current(), path).kind !== "folder")
				throw new Error(`不是文件夹：${path}`);
			if (listFolder(current(), path, 1).entries.length)
				throw new Error(`文件夹不为空：${path}`);
			apply({ kind: "node.remove", path });
		},
		zip(path: ResourcePath = "/") {
			return zipResources(current(), path);
		},
		unzip(
			input: Uint8Array | number[],
			path: ResourcePath = "/",
			options: FileApiWriteOptions = {},
		) {
			const destination = normalizeResourcePath(path);
			const resources = unzipResources(input);
			return transaction(() => {
				if (!exists(destination)) {
					if (options.parents === false)
						throw new Error(`ZIP 目标目录不存在：${destination}`);
					apply({ kind: "folder.mkdir", path: destination });
				} else if (statResource(current(), destination).kind !== "folder") {
					throw new Error(`ZIP 目标不是文件夹：${destination}`);
				}
				for (const resource of resources) {
					const targetPath = normalizeResourcePath(
						`${destination}/${resource.path.slice(1)}`,
					);
					const existing = exists(targetPath);
					if (existing && options.overwrite === false)
						throw new Error(`目标路径已存在：${targetPath}`);
					applyAll([
						...(existing ? [] : destinationPulses(targetPath, options)),
						{ kind: "file.write", path: targetPath, content: resource.content },
					]);
				}
				return { files: resources.length };
			});
		},
		updateFileMeta(path: ResourcePath, patch: Partial<FileMeta>) {
			apply({ kind: "file.meta.patch", path, patch });
		},
		updateFolderMeta(path: ResourcePath, patch: Partial<FolderMeta>) {
			apply({ kind: "folder.meta.patch", path, patch });
		},
		transaction,
	};
}
