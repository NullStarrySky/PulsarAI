import type { WorldResource } from "../tree/world-store";

export interface PluginMode {
	id: string;
	name: string;
	description?: string;
	enter?: string;
	exit?: string;
	resourcePath: string;
}

export function parsePluginModes(resources: WorldResource[]): PluginMode[] {
	return resources.flatMap((resource) => {
		try {
			const value =
				typeof resource.file.content === "string"
					? JSON.parse(resource.file.content)
					: resource.file.content;
			if (!value || typeof value !== "object") return [];
			const mode = value as Record<string, unknown>;
			const id = String(mode.id ?? resource.file.id).trim();
			const name = String(
				mode.name ?? resource.file.name.replace(/\.json$/i, ""),
			).trim();
			if (!id || !name) return [];
			return [
				{
					id,
					name,
					resourcePath: resource.path,
					...(typeof mode.description === "string"
						? { description: mode.description }
						: {}),
					...(typeof mode.enter === "string" ? { enter: mode.enter } : {}),
					...(typeof mode.exit === "string" ? { exit: mode.exit } : {}),
				},
			];
		} catch {
			return [];
		}
	});
}
