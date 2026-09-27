import {
	type MaybeRefOrGetter,
	readonly,
	shallowRef,
	toValue,
	watchEffect,
} from "vue";
import type { PluginData, ResourcePath } from "../dataflow/types";
import { importResource, type ResourceImportEnvironment } from "./import";

export interface UseImportOptions {
	filetree: MaybeRefOrGetter<PluginData | null>;
	environment?: MaybeRefOrGetter<ResourceImportEnvironment | undefined>;
}

/** Reactively imports one resource or aggregates imports for an ordered path list. */
export function useImport(
	path: MaybeRefOrGetter<ResourcePath | readonly ResourcePath[]>,
	options: UseImportOptions,
) {
	const value = shallowRef<unknown>();
	watchEffect((onCleanup) => {
		let stale = false;
		onCleanup(() => {
			stale = true;
		});
		const data = toValue(options.filetree);
		const request = toValue(path);
		const empty = Array.isArray(request) ? [] : undefined;
		value.value = empty;
		if (!data) return;
		const environment = options.environment
			? (toValue(options.environment) ?? {})
			: {};
		const imported =
			typeof request !== "string"
				? Promise.all(
						request.map((item) => importResource(data, item, environment)),
					)
				: importResource(data, request, environment);
		void Promise.resolve(imported).then((result) => {
			if (!stale) value.value = result;
		});
	});
	return readonly(value);
}
