import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { type UseImportOptions, useImport } from "../resources/use-import";
import { type SlotResource, type UseSlotOptions, useSlot } from "./use-slot";

export interface SlotContent extends SlotResource {
	content: unknown;
}

/** Reactively imports every selected resource in one slot. */
export function useSlotContent(
	slot: MaybeRefOrGetter<string>,
	options: UseImportOptions & UseSlotOptions,
) {
	const slots = useSlot(options);
	const paths = computed(() => slots.paths(toValue(slot)));
	const imported = useImport(paths, options);
	return computed<SlotContent[]>(() => {
		const resources = slots.get(toValue(slot))?.selectedResources ?? [];
		const values = imported.value;
		if (!Array.isArray(values)) return [];
		return resources.map((resource, index) => ({
			...resource,
			content: values[index],
		}));
	});
}
