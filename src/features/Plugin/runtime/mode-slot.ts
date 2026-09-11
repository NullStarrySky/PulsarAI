import { computed } from "vue";
import { type UseSlotOptions, useSlot } from "../dataflow/use-slot";

export interface PluginMode {
	id: string;
	name: string;
	description?: string;
	enter?: string;
	exit?: string;
	resourcePath: string;
}

/** MODE is now just the selected JSON files of the ordinary slot registry. */
export function usePluginModes(options: UseSlotOptions) {
	const slots = useSlot(options);
	return computed<PluginMode[]>(() =>
		slots.paths("MODE").flatMap((resourcePath) => {
			try {
				const value = JSON.parse(slots.read(resourcePath)) as Record<
					string,
					unknown
				>;
				const name = String(
					value.name ??
						resourcePath
							.split("/")
							.at(-1)
							?.replace(/\.json$/i, ""),
				).trim();
				if (!name) return [];
				return [
					{
						id: String(value.id ?? resourcePath).trim(),
						name,
						resourcePath,
						...(typeof value.description === "string"
							? { description: value.description }
							: {}),
						...(typeof value.enter === "string" ? { enter: value.enter } : {}),
						...(typeof value.exit === "string" ? { exit: value.exit } : {}),
					},
				];
			} catch {
				return [];
			}
		}),
	);
}
