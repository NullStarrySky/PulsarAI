import { builtinSlotRegistry } from "@/features/Plugin/utils/import-converter";
import type { StImportFile, StImportPlan } from "./st-import-plan";

export interface StImportWorldWriter {
	exists(path: string): boolean;
	ls(path?: string): string[];
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

function slotContractPath(id: string) {
	const slot = builtinSlotRegistry.find((item) => item.id === id);
	if (!slot) return undefined;
	const parts = [slot.name];
	let parentId = slot.parentId;
	while (parentId) {
		const parent = builtinSlotRegistry.find((item) => item.id === parentId);
		if (!parent) break;
		parts.unshift(parent.name);
		parentId = parent.parentId;
	}
	return `/slot/${parts.join("/")}`;
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
