import { builtinGlobalSlotPath } from "@/features/Plugin/tree/builtin-world";
import type { StImportFile, StImportPlan } from "./st-import-plan";

/**
 * Minimal World surface used to apply an import plan — satisfied by the
 * object returned from `useWorld`.
 */
export interface StImportWorldWriter {
	exists(path: string): boolean;
	ls(path?: string): Array<{ id: string; name: string; type: "file" | "folder" }>;
	createFolder(parentPath: string, name: string): Promise<string>;
	createFile(parentPath: string, name: string, content?: unknown): Promise<string>;
	updateFolder(
		path: string,
		patch: { parent?: string },
	): Promise<void>;
	updateFile(
		path: string,
		patch: {
			slot?: string;
			condition?: string;
			priority?: number;
			resourceSelected?: boolean;
		},
	): Promise<void>;
	/** Enables/disables with single-selection slots deselecting their siblings. */
	setSelected(path: string, selected: boolean): Promise<void>;
}

export interface StImportApplyResult {
	/** The generated folder, or the single created file. */
	rootPath: string;
	createdPaths: string[];
	diagnostics: string[];
}

/**
 * Writes an import plan below `targetFolderPath` (`/self/…` or `/global/<source>/…`).
 * Imported resources default to enabled; worldbook entries keep the enabled
 * result defined by their original entry (carried in the plan).
 */
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
		const fileName = await uniqueName(writer, targetFolderPath, file.path, true);
		const filePath = await writer.createFile(
			targetFolderPath,
			fileName,
			file.content,
		);
		createdPaths.push(filePath);
		await patchImportedFile(writer, targetFolderPath, filePath, file);
		return { rootPath: filePath, createdPaths, diagnostics };
	}

	const folderName = await uniqueName(writer, targetFolderPath, plan.name, false);
	const folderPath = await writer.createFolder(targetFolderPath, folderName);
	createdPaths.push(folderPath);
	const folderCache = new Map<string, string>([["", folderPath]]);
	for (const file of plan.files) {
		const segments = file.path.split("/");
		const fileName = segments.pop();
		if (!fileName) continue;
		const parentPath = await ensureFolderChain(
			writer,
			folderPath,
			segments,
			folderCache,
			createdPaths,
		);
		const filePath = await writer.createFile(
			parentPath,
			fileName,
			file.content,
		);
		createdPaths.push(filePath);
		await patchImportedFile(writer, targetFolderPath, filePath, file);
	}
	return { rootPath: folderPath, createdPaths, diagnostics };
}

async function patchImportedFile(
	writer: StImportWorldWriter,
	targetFolderPath: string,
	filePath: string,
	file: StImportFile,
) {
	const slotPath = file.slotId
		? await ensureLocalSlotPath(writer, targetFolderPath, file.slotId)
		: undefined;
	await writer.updateFile(filePath, {
		...(slotPath ? { slot: slotPath } : {}),
		...(file.condition ? { condition: file.condition } : {}),
		...(file.priority !== undefined ? { priority: file.priority } : {}),
	});
	// 导入的资源默认开启，开启结果覆盖原有配置；世界书条目由计划携带
	// 原条目的开启结果。单选插槽经 setSelected 关闭同槽位的其他资源。
	if (file.resourceSelected !== false) {
		await writer.setSelected(filePath, true);
	} else {
		await writer.updateFile(filePath, { resourceSelected: false });
	}
}

/**
 * Resolves (or creates) the source-local slot path a file contributes through,
 * e.g. `/self/$localSlot/$localSlot:character` or
 * `/global/$source/$localSlot/$child` with `parent` pointing at the contract.
 */
async function ensureLocalSlotPath(
	writer: StImportWorldWriter,
	targetFolderPath: string,
	slotId: string,
): Promise<string> {
	const scope = targetFolderPath.startsWith("/self") ? "self" : "global";
	const second = targetFolderPath.split("/")[2] ?? "";
	const sourceRootPath =
		scope === "self"
			? "/self"
			: `/global/${second}`;
	let localRootPath: string | null = null;
	for (const child of writer.ls(sourceRootPath)) {
		if (child.type === "folder" && child.name === "localSlot") {
			localRootPath = `${sourceRootPath}/$${child.id}`;
			break;
		}
	}
	if (!localRootPath) localRootPath = await writer.createFolder(sourceRootPath, "localSlot");

	for (const child of writer.ls(localRootPath)) {
		if (
			child.type === "folder" &&
			(child.id === `localSlot:${slotId}` || child.name === slotId)
		) {
			const slotPath = `${localRootPath}/$${child.id}`;
			const contractPath = builtinGlobalSlotPath(slotId);
			if (scope === "global" && contractPath) {
				await writer.updateFolder(slotPath, { parent: contractPath });
			}
			return slotPath;
		}
	}
	const created = await writer.createFolder(localRootPath, slotId);
	const contractPath = builtinGlobalSlotPath(slotId);
	if (contractPath) await writer.updateFolder(created, { parent: contractPath });
	return created;
}

async function ensureFolderChain(
	writer: StImportWorldWriter,
	rootPath: string,
	segments: string[],
	cache: Map<string, string>,
	createdPaths: string[],
): Promise<string> {
	let cursor = rootPath;
	let relative = "";
	for (const segment of segments) {
		relative = relative ? `${relative}/${segment}` : segment;
		const cached = cache.get(relative);
		if (cached) {
			cursor = cached;
			continue;
		}
		cursor = writer.exists(`${cursor}/${segment}`)
			? `${cursor}/${segment}`
			: await writer.createFolder(cursor, segment);
		createdPaths.push(cursor);
		cache.set(relative, cursor);
	}
	return cursor;
}

async function uniqueName(
	writer: StImportWorldWriter,
	parentPath: string,
	base: string,
	isFile: boolean,
) {
	const dot = isFile ? base.lastIndexOf(".") : -1;
	const stem = dot > 0 ? base.slice(0, dot) : base;
	const tail = dot > 0 ? base.slice(dot) : "";
	let index = 1;
	let candidate = base;
	while (writer.exists(`${parentPath}/${candidate}`)) {
		index += 1;
		candidate = `${stem}-${index}${tail}`;
	}
	return candidate;
}
