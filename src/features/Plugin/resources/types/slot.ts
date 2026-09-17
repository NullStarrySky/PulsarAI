export type SlotDef = Record<string, SlotDef | SlotMeta>;

export interface SlotMeta {
	description?: string;
	selectionMode: "none" | "single" | "multiple";
	icon?: string;
}

export const globalSlotDefinitionFile = "/global.slot.json";
export const localSlotDefinitionFile = "local.slot.json";

export function isSlotMeta(value: unknown): value is SlotMeta {
	return Boolean(
		value &&
			typeof value === "object" &&
			"selectionMode" in value &&
			["none", "single", "multiple"].includes(
				(value as SlotMeta).selectionMode,
			),
	);
}

export function parseSlotDef(source: string | undefined): SlotDef {
	if (!source) return {};
	try {
		const value = JSON.parse(source) as unknown;
		if (!value || typeof value !== "object" || Array.isArray(value)) return {};
		return value as SlotDef;
	} catch {
		return {};
	}
}

export function slotMetaAt(definition: SlotDef, path: string): SlotMeta | null {
	let current: SlotDef | SlotMeta = definition;
	for (const name of path.split("/").filter(Boolean)) {
		if (isSlotMeta(current) || !(name in current)) return null;
		current = current[name]!;
	}
	return isSlotMeta(current) ? current : null;
}
