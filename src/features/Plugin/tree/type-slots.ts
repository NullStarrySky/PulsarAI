import type {
	WorldFileType,
	WorldFileNode,
	WorldFolderNode,
} from "./world-types";

export const builtinWorldTypes: WorldFileType[] = [
	"markdown",
	"chat",
	"data",
	"javascript",
	"json",
	"media",
	"component",
	"text",
];

const builtinTypeAliases: Record<string, WorldFileType> = {
	md: "markdown",
	markdown: "markdown",
	chat: "chat",
	data: "data",
	js: "javascript",
	javascript: "javascript",
	json: "json",
	media: "media",
	vue: "component",
	component: "component",
	txt: "text",
	text: "text",
};

export function normalizeTypeFolderName(name: string): string {
	const trimmed = name.trim();
	const normalized = trimmed.toLowerCase();
	return builtinTypeAliases[normalized] ?? trimmed;
}

export interface WorldTypeDefinition {
	/** Canonical type: a builtin type name or a custom suffix. */
	type: string;
	/** Folder name as declared (e.g. .chat.json or markdown). */
	suffix: string;
	/** ID path of the slot folder owning the contract; `/self/slot` for root. */
	scopePath: string;
	folder: WorldFolderNode;
	/** wrapper replaces builtin wrapping during import (js file). */
	wrapper?: WorldFileNode;
	/** renderer renders the file surface in the editor dialog (vue file). */
	renderer?: WorldFileNode;
	/** initer seeds the content of newly created files (any file). */
	initer?: WorldFileNode;
}

export interface WorldTypeContract {
	scopePath: string;
	typesPath: string;
	definitions: WorldTypeDefinition[];
}

function definitionFile(
	folder: WorldFolderNode,
	base: string,
): WorldFileNode | undefined {
	return Object.values(folder.children).find(
		(child): child is WorldFileNode =>
			child.type === "file" &&
			(child.name.trim().toLowerCase() === base ||
				child.name.trim().toLowerCase().startsWith(`${base}.`)),
	);
}

function typeDefinitionFromFolder(
	folder: WorldFolderNode,
	scopePath: string,
): WorldTypeDefinition {
	const wrapper = definitionFile(folder, "wrapper");
	const renderer = definitionFile(folder, "renderer");
	const initer = definitionFile(folder, "initer");
	return {
		type: normalizeTypeFolderName(folder.name),
		suffix: folder.name,
		scopePath,
		folder,
		...(wrapper ? { wrapper } : {}),
		...(renderer ? { renderer } : {}),
		...(initer ? { initer } : {}),
	};
}

/**
 * Collects every `types` contract folder below `/self/slot/`.
 */
export function collectTypeContracts(
	selfRoot: WorldFolderNode,
): WorldTypeContract[] {
	const slotRoot = Object.values(selfRoot.children).find(
		(node): node is WorldFolderNode =>
			node.type === "folder" && node.id === "slot",
	);
	if (!slotRoot) return [];
	const contracts: WorldTypeContract[] = [];
	const visit = (folder: WorldFolderNode, path: string) => {
		for (const child of Object.values(folder.children)) {
			if (child.type !== "folder") continue;
			const childPath = `${path}/$${child.id}`;
			if (child.name === "types") {
				contracts.push({
					scopePath: path,
					typesPath: childPath,
					definitions: Object.values(child.children)
						.filter((node): node is WorldFolderNode => node.type === "folder")
						.map((typeFolder) => typeDefinitionFromFolder(typeFolder, path)),
				});
			}
			visit(child, childPath);
		}
	};
	visit(slotRoot, "/self/slot");
	return contracts;
}

/** Custom suffixes registered by any `types` contract. */
export function customTypeSuffixes(contracts: WorldTypeContract[]): string[] {
	const suffixes = new Set<string>();
	for (const contract of contracts) {
		for (const definition of contract.definitions) {
			if (
				!builtinWorldTypes.includes(definition.type as WorldFileType)
			) {
				suffixes.add(definition.type);
			}
		}
	}
	return [...suffixes];
}

/** Text payload of a definition file used as sandbox source or seed content. */
export function definitionFileText(file: WorldFileNode | undefined): string {
	if (!file) return "";
	return typeof file.content === "string"
		? file.content
		: JSON.stringify(file.content ?? null, null, 2);
}
