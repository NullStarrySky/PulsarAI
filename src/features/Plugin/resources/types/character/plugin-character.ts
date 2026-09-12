import type { PluginData } from "../../../dataflow/types";

export interface CharacterDefinition {
	schemaVersion: number;
	name: string;
	description?: string;
	tags: string[];
	/** Enabled global Plugin source folder names, in merge order. */
	globalPlugins: string[];
}

function strings(value: unknown) {
	return Array.isArray(value)
		? [
				...new Set(
					value
						.filter((item): item is string => typeof item === "string")
						.map((item) => item.trim())
						.filter(Boolean),
				),
			]
		: [];
}

export function parseCharacterDefinition(source: unknown): CharacterDefinition {
	let value: Record<string, unknown> = {};
	try {
		const parsed = typeof source === "string" ? JSON.parse(source) : source;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
			value = parsed as Record<string, unknown>;
	} catch {
		// Invalid authoring JSON still yields a stable UI projection.
	}
	return {
		schemaVersion:
			typeof value.schemaVersion === "number" ? value.schemaVersion : 1,
		name:
			typeof value.name === "string" && value.name.trim()
				? value.name.trim()
				: "未命名角色",
		description:
			typeof value.description === "string" ? value.description : undefined,
		tags: strings(value.tags),
		globalPlugins: strings(value.globalPlugins).filter(
			(folder) => folder !== "." && folder !== ".." && !folder.includes("/"),
		),
	};
}

export interface CharacterData {
	id: string;
	name: string;
	description?: string;
	avatarUrl?: string;
	coverUrl?: string;
}

/** Character is a live UI projection of its owning local Plugin. */
export function characterFromPlugin(
	localPluginId: string,
	plugin: PluginData,
): CharacterData {
	const definition = parseCharacterDefinition(
		plugin.tree["definition.package.json"],
	);
	const avatar = plugin.tree["avatar.png"];
	const cover = plugin.tree["cover.png"];
	return {
		id: localPluginId,
		name: definition.name,
		description: definition.description,
		avatarUrl: typeof avatar === "string" ? avatar : undefined,
		coverUrl: typeof cover === "string" ? cover : undefined,
	};
}
