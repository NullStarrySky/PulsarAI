import type { ModelMessage } from "ai";
import { toValue } from "vue";
import { mediaLink } from "@/features/Plugin/media/media-link";
import { proxyFetch } from "@/features/Environment/utils/proxy-fetch";
import {
	resolveSandboxMessagesAsync,
	resolveSandboxTextAsync,
	type SandboxEnvironment,
} from "@/features/Plugin/runtime/sandbox";
import { generateImageToPath } from "@/features/Request/ai-sdk";
import { resolveResourcePath } from "../dataflow/pulse";
import type { PluginData, ResourcePath } from "../dataflow/types";
import { type FileApiOptions, useFileApi } from "../dataflow/use-file-api";
import { useActivePluginData } from "../dataflow/use-plugin-data";
import { useSlot } from "../dataflow/use-slot";
import { importResource } from "../resources/import";
import { PluginLogger } from "./logger";
import { extractYAMLFormatter } from "./yaml-formatter";

export interface PluginEnvironmentOptions extends FileApiOptions {
	sourcePath: ResourcePath;
	context?: SandboxEnvironment;
	logger?: PluginLogger;
}

function isModelMessage(value: unknown): value is ModelMessage {
	return Boolean(
		value && typeof value === "object" && "role" in value && "content" in value,
	);
}

function builtinDocs(id?: string) {
	const docs = import.meta.glob("../builtIn/core/docs/*.md", {
		eager: true,
		query: "?raw",
		import: "default",
	}) as Record<string, string>;
	if (!id)
		return Object.keys(docs).map((path) =>
			path.split("/").at(-1)?.replace(/\.md$/, ""),
		);
	return docs[`../builtIn/core/docs/${id}.md`] ?? null;
}

/**
 * Builds the source-scoped Sandbox facade over a replayed Plugin tree. A child
 * import receives its own `sourcePath`, so `@/`, `./`, and `../` never depend
 * on evaluation order or mutate the parent context.
 */
export function createPluginEnvironment(options: PluginEnvironmentOptions) {
	const files = useFileApi(options);
	const activeFiletree = useActivePluginData(options.filetree);
	const slots = useSlot({ ...options, filetree: activeFiletree });
	const logger = options.logger ?? new PluginLogger();
	const root: SandboxEnvironment = { ...(options.context ?? {}) };
	const importRegistry = new Map<ResourcePath, unknown>();
	const importing = new Set<ResourcePath>();
	const sourcePath = options.sourcePath;
	function data() {
		const value = toValue(options.filetree);
		if (!value) throw new Error("Plugin 资源尚未加载。");
		return value;
	}
	function resolve(from: ResourcePath, request: string) {
		return resolveResourcePath(from, request);
	}
	function importAt(
		request: string | string[],
		from: ResourcePath,
	): unknown | Promise<unknown> {
		if (Array.isArray(request)) {
			const values = request.map((path) => importAt(path, from));
			return values.some((value) => value instanceof Promise)
				? Promise.all(values).then((items) => items.flat())
				: values.flat();
		}
		const path = resolve(from, request);
		if (importRegistry.has(path)) return importRegistry.get(path);
		if (importing.has(path)) throw new Error(`循环导入：${path}`);
		const child = scoped(path);
		logger.append(`导入文件：${path}`, 0, "import", path);
		importing.add(path);
		try {
			const value = importResource(data(), path, child);
			importRegistry.set(path, value);
			return value;
		} finally {
			importing.delete(path);
		}
	}
	async function parseAt(
		request: string | string[],
		from: ResourcePath,
		extra: SandboxEnvironment = {},
	) {
		const environment = { ...scoped(from), ...extra };
		const imported = await importAt(request, from);
		if (typeof imported === "string")
			return resolveSandboxTextAsync(imported, [environment], { logger });
		if (Array.isArray(imported)) {
			if (imported.every(isModelMessage))
				return resolveSandboxMessagesAsync(imported, [environment], { logger });
			return Promise.all(
				imported.map((item) =>
					typeof item === "string"
						? resolveSandboxTextAsync(item, [environment], { logger })
						: item,
				),
			);
		}
		return imported;
	}
	function scoped(from: ResourcePath): SandboxEnvironment {
		const absolute = (path: string) => resolve(from, path);
		const fs = Object.freeze({
			read: (path: string) => files.read(absolute(path)),
			write: (
				path: string,
				content: string,
				options?: { parents?: boolean; overwrite?: boolean },
			) => files.write(absolute(path), content, options),
			edit: (
				path: string,
				find: string,
				replace: string,
				options?: { all?: boolean; expectedMatches?: number },
			) => files.edit(absolute(path), find, replace, options),
			mkdir: (path: string, options?: { parents?: boolean; existOk?: boolean }) =>
				files.mkdir(absolute(path), options),
			move: (
				source: string,
				target: string,
				options?: { parents?: boolean; overwrite?: boolean },
			) => files.move(absolute(source), absolute(target), options),
			copy: (
				source: string,
				target: string,
				options?: { parents?: boolean; overwrite?: boolean },
			) => files.copy(absolute(source), absolute(target), options),
			remove: (path: string, options?: { missingOk?: boolean }) =>
				files.remove(absolute(path), options),
			append: (path: string, content: string, options?: { parents?: boolean }) =>
				files.append(absolute(path), content, options),
			touch: (path: string, options?: { parents?: boolean }) =>
				files.touch(absolute(path), options),
			rmdir: (path: string, options?: { missingOk?: boolean }) =>
				files.rmdir(absolute(path), options),
			exists: (path: string) => files.exists(absolute(path)),
			stat: (path: string) => files.stat(absolute(path)),
			list: (path = ".", options?: { limit?: number }) =>
				files.list(absolute(path), options),
			find: (
				path = ".",
				options?: { name?: string; kind?: "file" | "folder"; limit?: number },
			) => files.find(absolute(path), options),
			search: (
				query: string,
				path = ".",
				options?: { context?: number; limit?: number },
			) => files.search(query, absolute(path), options),
			readLines: (
				path: string,
				options?: { startLine?: number; endLine?: number; limit?: number },
			) => files.readLines(absolute(path), options),
			tree: (path = ".", options?: { limit?: number; maxDepth?: number }) =>
				files.tree(absolute(path), options),
			zip: (path = ".") => files.zip(absolute(path)),
			unzip: (
				input: Uint8Array | number[],
				path = ".",
				options?: { parents?: boolean; overwrite?: boolean },
			) => files.unzip(input, absolute(path), options),
			import: (path: string | string[]) => importAt(path, from),
			run: (path: string | string[]) => importAt(path, from),
			parse: (path: string | string[], extra?: SandboxEnvironment) =>
				parseAt(path, from, extra),
		});
		return {
			...root,
			sourcePath: from,
			imports: (path: string | string[]) => importAt(path, from),
			parse: (path: string | string[], extra?: SandboxEnvironment) =>
				parseAt(path, from, extra),
			fs,
			read: fs.read,
			write: fs.write,
			edit: fs.edit,
			mkdir: fs.mkdir,
			move: fs.move,
			copy: fs.copy,
			remove: fs.remove,
			append: fs.append,
			touch: fs.touch,
			rmdir: fs.rmdir,
			exists: fs.exists,
			stat: fs.stat,
			list: fs.list,
			find: fs.find,
			search: fs.search,
			readLines: fs.readLines,
			tree: fs.tree,
			zip: fs.zip,
			unzip: fs.unzip,
			fetch: proxyFetch,
			logger,
			ctx: root,
		};
	}
	const slot = Object.freeze({
		list: () => slots.slots.value,
		get: (path: string) => slots.get(path),
		paths: (path: string) => slots.paths(path),
		fileNames: (path: string) => slots.fileNames(path),
		import: (path: string, extra?: SandboxEnvironment) =>
			parseAt(slots.paths(path), sourcePath, extra),
	});
	Object.assign(root, scoped(sourcePath), {
		slot,
		skills: () =>
			slots.paths("skill").map((path) => ({ path, content: files.read(path) })),
		utils: Object.freeze({ yaml: { extract: extractYAMLFormatter } }),
		read_docs: builtinDocs,
		generateImageToPath,
		media: Object.freeze({ link: mediaLink }),
		fetch: proxyFetch,
		now: () => new Date().toISOString(),
	});
	Object.defineProperty(root, "__runCodeActTransaction", {
		value: files.transaction,
		configurable: false,
		enumerable: false,
		writable: false,
	});
	function registerCustomTools() {
		const collisions = new Set(Object.keys(root));
		const paths: ResourcePath[] = [];
		const collect = (tree: PluginData["tree"], prefix = "/") => {
			for (const [name, node] of Object.entries(tree)) {
				const path = prefix === "/" ? `/${name}` : `${prefix}/${name}`;
				if (typeof node === "string") paths.push(path);
				else collect(node, path);
			}
		};
		const active = activeFiletree.value;
		if (!active) throw new Error("Plugin 资源尚未加载。");
		collect(active.tree);
		const tools = paths
			.flatMap((path) => {
				const match = /\/tools\/([^/]+)\/tool\.js$/i.exec(path);
				if (!match || !files.exists(path.replace(/tool\.js$/i, "prompt.md")))
					return [];
				const meta = data().meta[path];
				return meta && "priority" in meta
					? [{ path, name: match[1]!, priority: meta.priority }]
					: [];
			})
			.sort(
				(left, right) =>
					right.priority - left.priority || left.path.localeCompare(right.path),
			);
		for (const tool of tools) {
			if (collisions.has(tool.name))
				throw new Error(`工具函数名称与 ctx 冲突：${tool.name}`);
			const callable = importAt(tool.path, tool.path);
			if (typeof callable !== "function")
				throw new Error(`工具默认导出必须是函数：${tool.path}`);
			root[tool.name] = callable;
			collisions.add(tool.name);
		}
		return tools.map(({ name, path }) => ({ name, path }));
	}
	function dispose() {
		importRegistry.clear();
		importing.clear();
	}
	return {
		environment: root,
		files,
		slots,
		slot,
		logger,
		importAt,
		importRegistry,
		dispose,
		parseAt,
		registerCustomTools,
	};
}
