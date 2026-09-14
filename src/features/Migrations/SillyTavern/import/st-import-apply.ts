import { normalizeResourcePath } from "@/features/Plugin/dataflow/pulse";
import type { PluginData, ResourceTree } from "@/features/Plugin/dataflow/types";
import { builtinSlotRegistry } from "@/features/Plugin/utils/import-converter";
import {
	slotContractPath,
	type StImportFile,
	type StImportPlan,
} from "./st-import-plan";

export interface StImportWorldWriter {
	exists(path: string): boolean;
	mkdir(path: string): void;
	write(path: string, content: string): void;
	updateFolderMeta(path: string, patch: { parent?: string }): void;
	updateFileMeta(
		path: string,
		patch: {
			slot?: string;
			condition?: string;
			priority?: number;
			resourceSelected?: boolean;
		},
	): void;
}

export interface StImportApplyResult {
	rootPath: string;
	createdPaths: string[];
	diagnostics: string[];
}

function deepMergeTrees(target: ResourceTree, source: ResourceTree) {
	for (const [key, val] of Object.entries(source)) {
		if (typeof val === "string") {
			target[key] = val;
		} else {
			if (!target[key] || typeof target[key] === "string") {
				target[key] = {};
			}
			deepMergeTrees(target[key] as ResourceTree, val);
		}
	}
}

/**
 * Pure data merge of an StImportPlan into an in-memory PluginData tree and meta.
 * Directly merges tree and meta without requiring filesystem mocks.
 */
export function mergeImportPlanToPluginData(
	target: PluginData,
	plan: StImportPlan,
	targetFolderPath = "/",
): PluginData {
	const normalizedTarget = normalizeResourcePath(targetFolderPath);
	if (normalizedTarget === "/") {
		deepMergeTrees(target.tree, plan.tree);
		for (const { path, meta } of plan.metaList) {
			target.meta[path] = meta;
		}
	} else {
		const targetParts = normalizedTarget.split("/").filter(Boolean);
		let current = target.tree;
		for (const part of targetParts) {
			if (!current[part] || typeof current[part] === "string") {
				current[part] = {};
			}
			current = current[part] as ResourceTree;
		}
		for (const [name, node] of Object.entries(plan.tree)) {
			if (name === "localSlot") {
				if (
					!target.tree.localSlot ||
					typeof target.tree.localSlot === "string"
				) {
					target.tree.localSlot = {};
				}
				deepMergeTrees(
					target.tree.localSlot as ResourceTree,
					node as ResourceTree,
				);
			} else {
				if (typeof node === "string") {
					current[name] = node;
				} else {
					if (!current[name] || typeof current[name] === "string") {
						current[name] = {};
					}
					deepMergeTrees(current[name] as ResourceTree, node);
				}
			}
		}
		for (const { path, meta } of plan.metaList) {
			if (path.startsWith("/localSlot")) {
				target.meta[path] = meta;
			} else {
				const remountedPath = normalizeResourcePath(
					`${normalizedTarget}${path}`,
				);
				target.meta[remountedPath] = meta;
			}
		}
	}
	return target;
}

export async function applyStImportPlan(
	writer: StImportWorldWriter,
	plan: StImportPlan,
	targetFolderPath: string,
): Promise<StImportApplyResult> {
	const createdPaths: string[] = [];
	const diagnostics = [...plan.diagnostics];
	if (plan.mode === "file") {
		const file = plan.files[0];
		if (!file) throw new Error("导入计划没有可写入的文件。");
		const path = uniquePath(writer, targetFolderPath, file.path, true);
		writeFile(writer, path, file);
		createdPaths.push(path);
		return { rootPath: path, createdPaths, diagnostics };
	}

	const rootPath = uniquePath(writer, targetFolderPath, plan.name, false);
	writer.mkdir(rootPath);
	createdPaths.push(rootPath);
	for (const file of plan.files) {
		const parts = file.path.split("/").filter(Boolean);
		const name = parts.pop();
		if (!name) continue;
		let parent = rootPath;
		for (const part of parts) {
			parent = join(parent, part);
			if (!writer.exists(parent)) {
				writer.mkdir(parent);
				createdPaths.push(parent);
			}
		}
		const path = join(parent, name);
		writeFile(writer, path, file);
		createdPaths.push(path);
	}
	return { rootPath, createdPaths, diagnostics };
}

function writeFile(
	writer: StImportWorldWriter,
	path: string,
	file: StImportFile,
) {
	writer.write(
		path,
		typeof file.content === "string"
			? file.content
			: JSON.stringify(file.content, null, 2),
	);
	const slot = file.slotId ? ensureLocalSlot(writer, file.slotId) : undefined;
	writer.updateFileMeta(path, {
		...(slot ? { slot } : {}),
		...(file.condition ? { condition: file.condition } : {}),
		...(file.priority !== undefined ? { priority: file.priority } : {}),
		resourceSelected: file.resourceSelected !== false,
	});
}

function ensureLocalSlot(writer: StImportWorldWriter, slotId: string) {
	const root = "/localSlot";
	if (!writer.exists(root)) writer.mkdir(root);
	const path = join(root, slotId);
	if (!writer.exists(path)) writer.mkdir(path);
	const contract = slotContractPath(slotId);
	if (contract) writer.updateFolderMeta(path, { parent: contract });
	return path;
}

function uniquePath(
	writer: StImportWorldWriter,
	parent: string,
	name: string,
	isFile: boolean,
) {
	const dot = isFile ? name.lastIndexOf(".") : -1;
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const suffix = dot > 0 ? name.slice(dot) : "";
	let path = join(parent, name);
	for (let index = 2; writer.exists(path); index += 1)
		path = join(parent, `${stem}-${index}${suffix}`);
	return path;
}

function join(parent: string, name: string) {
	return parent === "/" ? `/${name}` : `${parent}/${name}`;
}
